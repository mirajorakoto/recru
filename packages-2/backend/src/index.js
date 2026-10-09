const express = require("express");
const { createOpenAiService } = require("./ai");
const { createRepository } = require("./repository");
const { createRouters } = require("./routes");
const { runMigrations } = require("./migrations/runner");
const { getEncryptionKey } = require("./security");
const { createAnalysisWorker, createPurgeScheduler } = require("./worker");

/**
 * Consignes RH (paramètres d'analyse IA, CDC §16-17) lues à chaque analyse :
 * elles orientent les preuves à citer, jamais la décision.
 */
function createGuidanceLoader(repository) {
  return function loadGuidance() {
    try {
      const row = repository.db.prepare("SELECT value_json FROM recruitment_settings WHERE key = 'ai_criteria'").get();
      if (!row) return null;
      const criteria = JSON.parse(row.value_json)?.criteria || {};
      const parts = Object.entries(criteria).filter(([, text]) => String(text || "").trim());
      return parts.length ? Object.fromEntries(parts) : null;
    } catch {
      return null;
    }
  };
}

function withGuidance(aiService, loadGuidance) {
  return {
    ...aiService,
    analyzeApplication: (input) => aiService.analyzeApplication({ ...input, guidance: loadGuidance() })
  };
}

function createRecruitmentModule(options) {
  if (typeof options?.db?.prepare !== "function") throw new Error("A shared better-sqlite3 db adapter is required.");
  if (typeof options?.requireAdminSession !== "function") throw new Error("The host requireAdminSession middleware is required.");
  if (typeof options?.transporter?.sendMail !== "function") throw new Error("A SMTP transporter with sendMail is required.");
  const config = {
    storageDir: options.config?.storageDir,
    maxFileMb: options.config?.maxFileMb || 10,
    retentionDays: options.config?.retentionDays || 180,
    turnstileSecret: options.config?.turnstileSecret,
    bypassTurnstile: options.config?.bypassTurnstile,
    fetchImpl: options.config?.fetchImpl,
    applicationRateLimit: options.config?.applicationRateLimit || 5,
    authRateLimit: options.config?.authRateLimit || 20,
    smtpFrom: options.config?.smtpFrom || "TECH ZONE Recrutement <contact@techzone.lat>",
    timezone: options.config?.timezone || "Indian/Antananarivo",
    // Portail candidat (CDC §7.3, §8)
    publicBaseUrl: options.config?.publicBaseUrl || "",
    cookieSecure: options.config?.cookieSecure ?? process.env.NODE_ENV === "production",
    cookiePath: options.config?.cookiePath || "/",
    sessionTtlHours: options.config?.sessionTtlHours || 24 * 7,
    acknowledgementEmail: options.config?.acknowledgementEmail ?? true // accusé de réception automatique
  };
  if (!config.storageDir) throw new Error("config.storageDir is required.");
  runMigrations(options.db);
  // createRepository() complète aussi le schéma (colonnes/tables du cahier des charges) avant toute requête.
  const repository = createRepository(options.db);
  const encryptionKey = getEncryptionKey(options.config.fileKey);

  // Amorçage des administrateurs RH (CDC §8) : e-mails séparés par des virgules ou tableau.
  const adminEmails = [].concat(options.config?.adminEmails || [])
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  for (const email of adminEmails) {
    if (!repository.getStaff(email)) repository.upsertStaff({ email, role: "admin", active: true });
  }

  const baseAiService = options.aiService || createOpenAiService({
    apiKey: options.config.openAiApiKey,
    model: options.config.openAiModel || "gpt-5.4-nano-2026-03-17",
    timeoutMs: options.config.openAiTimeoutMs
  });
  const aiService = withGuidance(baseAiService, createGuidanceLoader(repository));
  const routers = createRouters({
    repository,
    config,
    encryptionKey,
    aiService,
    transporter: options.transporter,
    resolveMediaAsset: options.resolveMediaAsset
  });
  const worker = createAnalysisWorker({ repository, aiService, encryptionKey });
  const purgeScheduler = createPurgeScheduler({
    repository,
    retentionDays: config.retentionDays,
    intervalMs: options.config?.purgeIntervalMs
  });
  const adminRouter = express.Router();
  adminRouter.use(options.requireAdminSession, routers.adminRouter);

  return {
    adminRouter,
    publicRouter: routers.publicRouter,
    repository,
    runMigrations: () => runMigrations(options.db),
    start: () => {
      purgeScheduler.start();
      worker.start();
    },
    stop: () => {
      worker.stop();
      purgeScheduler.stop();
    },
    worker,
    purgeScheduler
  };
}

module.exports = {
  createRecruitmentModule,
  createRepository,
  runMigrations
};
