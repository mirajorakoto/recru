// Production entrypoint. Unlike demo-server.js, this file:
//   - never fabricates a fallback encryption key or a fake admin session
//   - always uses the real OpenAI Responses API and real SMTP
//   - refuses to start if the host has not wired its real session middleware
//
// A production process loads its host adapter before it creates the HTTP
// listener. It never fabricates an RH session or an isolated production DB.

const express = require("express");
const path = require("node:path");
const { createRecruitmentModule } = require("./src");
const { createOpenAiService, createTestAiService } = require("./src/ai");
const { loadConfig, loadEnvFile } = require("./src/config");
const { loadHostAdapter } = require("./src/host-adapter");
const { createMailer } = require("./src/mailer");

loadEnvFile();
const config = loadConfig();

if (!config.isProduction) {
  throw new Error(
    "server.js is the production entrypoint and requires NODE_ENV=production. " +
    "Use demo-server.js for local development and testing."
  );
}

const hostAdapter = loadHostAdapter(config.hostAdapterPath);
const db = hostAdapter.db;
db.pragma("foreign_keys = ON");

// --- Real OpenAI analysis service ------------------------------------------
// env.js already requires OPENAI_API_KEY to be set when NODE_ENV=production,
// so this never silently falls back to a fake analyzer in this file.
const aiService = config.isTestDeployment
  ? createTestAiService()
  : createOpenAiService({
    apiKey: config.openai.apiKey,
    model: config.openai.model,
    timeoutMs: config.openai.timeoutMs
  });

// Transport e-mail piloté par le .env (SMTP_*), journalisé et vérifié au démarrage.
const mailer = createMailer(config);
const transporter = mailer.transporter;
void mailer.verify();

const recruitment = createRecruitmentModule({
  db,
  requireAdminSession: hostAdapter.requireAdminSession,
  transporter,
  aiService,
  resolveMediaAsset: hostAdapter.resolveMediaAsset,
  config: {
    storageDir: config.storageDir,
    fileKey: config.fileKey,
    retentionDays: config.retentionDays,
    maxFileMb: config.maxFileMb,
    turnstileSecret: config.turnstile.secretKey,
    smtpFrom: config.smtp.from,
    publicBaseUrl: config.publicBaseUrl
    // bypassTurnstile intentionally omitted: env.js already refuses to
    // start in production without TURNSTILE_SECRET_KEY, and there is no
    // config flag here to bypass it — Turnstile is always enforced.
  }
});

const app = express();
app.set("trust proxy", config.trustProxyHops);
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.set({
    "Referrer-Policy": "same-origin",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Permissions-Policy": "camera=(), geolocation=(), microphone=()"
  });
  if (req.secure) res.set("Strict-Transport-Security", "max-age=31536000");
  next();
});
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (req, res) => res.json({ ok: true, mode: "recruitment-production" }));
app.use("/api/recrutement", recruitment.publicRouter);
// The isolated portal may authenticate an existing TechZone administrator in
// a real browser. This route is deliberately absent from the main deployment:
// it creates only the dedicated, short-lived acceptance-session cookie.
if (config.isTestDeployment) {
  if (typeof hostAdapter.authenticateAdmin !== "function" || typeof hostAdapter.adminLoginRateLimiter !== "function") {
    throw new Error("L'adaptateur de recette doit fournir l'authentification admin hôte et son rate-limit.");
  }
  const testAuthRouter = express.Router();
  testAuthRouter.post("/login", hostAdapter.adminLoginRateLimiter, async (req, res, next) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    if (!email || !password) return res.status(400).json({ error: "Email et mot de passe administrateur requis." });
    try {
      const admin = await hostAdapter.authenticateAdmin({ email, password });
      if (!admin) return res.status(401).json({ error: "Identifiants administrateur invalides." });
      req.session.regenerate((regenerateError) => {
        if (regenerateError) return next(regenerateError);
        req.session.adminUserId = admin.id;
        req.session.save((saveError) => {
          if (saveError) return next(saveError);
          return res.json({ user: { id: admin.id, email: admin.email, display_name: admin.display_name } });
        });
      });
    } catch {
      next(new Error("Authentification administrateur indisponible."));
    }
  });
  app.use("/api/admin/recrutement/auth", hostAdapter.sessionMiddleware, hostAdapter.requireAdminOrigin, testAuthRouter);
}
// The host session parser must run before its guard; otherwise a valid host
// cookie would never populate req.session in this standalone process.
app.use(
  "/api/admin/recrutement",
  hostAdapter.sessionMiddleware,
  hostAdapter.requireAdminOrigin,
  recruitment.adminRouter
);
// The test portal has an SPA fallback, but API typos must stay observable to
// clients and monitoring instead of becoming a successful HTML response.
app.use("/api", (req, res) => res.status(404).json({ error: "Route API introuvable." }));
if (config.servesTestPortal) {
  const portalDir = path.resolve(__dirname, "../../demo/dist");
  app.get("/recruitment-config.json", (req, res) => {
    res.set("Cache-Control", "no-store").json({
      turnstileSiteKey: config.turnstile.siteKey,
      isTestDeployment: config.isTestDeployment
    });
  });
  app.use(express.static(portalDir));
  app.get("/{*splat}", (req, res) => res.sendFile(path.join(portalDir, "index.html")));
}
app.use((error, req, res, next) => {
  if (error?.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "Le fichier dépasse la taille autorisée." });
  console.error("Erreur HTTP recrutement.");
  res.status(500).json({ error: "Erreur serveur." });
});

const server = app.listen(config.port, config.listenHost, () => {
  console.log(`TechZone recruitment API (production): listening on ${config.listenHost}:${config.port}`);
  recruitment.start();
});

function shutdown() {
  recruitment.stop();
  server.close(() => {
    hostAdapter.close?.();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

module.exports = { app, recruitment };
