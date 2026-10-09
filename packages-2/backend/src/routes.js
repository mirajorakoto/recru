const fs = require("node:fs");
const express = require("express");
const rateLimit = require("express-rate-limit");
const multer = require("multer");
const { randomUUID } = require("node:crypto");
const { createNotifier } = require("./notifications");
const {
  burnPasswordCheck,
  decryptDocument,
  deriveSubKey,
  encryptDocument,
  hashPassword,
  htmlToText,
  randomToken,
  sanitizeEmailHtml,
  sha256Hex,
  signToken,
  validateCandidateDocument,
  validatePasswordStrength,
  verifyPassword,
  verifyToken,
  verifyTurnstile
} = require("./security");

const CONTRACT_TYPES = new Set(["stage", "cdd", "cdi", "alternance", "freelance", "interim", "autre"]);
const JOB_STATUSES = new Set(["draft", "published", "closed", "archived"]);
const PROCESSING_STATUSES = new Set(["received", "queued", "processing", "analysis_ready", "analysis_failed"]);
const DECISIONS = new Set(["to_review", "selected", "rejected", "withdrawn"]);
const STAFF_ROLES = new Set(["admin", "recruteur", "lecteur"]);
const INTERVIEW_MODES = new Set(["onsite", "visio", "phone"]);
const INTERVIEW_STATUSES = new Set(["planned", "done", "cancelled"]);
const EVALUATION_RECOMMENDATIONS = new Set(["favorable", "reserve", "defavorable"]);
// Score d'entretien /50 : 5 critères notés de 1 à 10.
const EVALUATION_MAX = 10;
const { SCORE_MAX } = require("./repository");
const EDUCATION_LEVELS = new Set(["bac", "bac+2", "bac+3", "bac+5", "doctorat", "autre", "non_precise"]);
// Pipeline CDC §11 : Nouvelle → CV analysé → Présélection → Entretien → Évaluation → Décision.
const PIPELINE_STATUSES = new Set([
  "nouvelle", "en_analyse", "cv_analyse", "preselectionnee", "entretien", "evaluation", "en_attente", "acceptee", "refusee"
]);
const SESSION_COOKIE = "rc_session";
// /recrutement/compte (espace candidat) et /recrutement/ressources ne doivent pas être masqués par une offre.
const RESERVED_SLUGS = new Set(["compte", "ressources"]);

/* ============================================================
 * Validateurs et helpers (inchangés, + quelques ajouts)
 * ============================================================ */

function cleanString(value, max, required = false) {
  const result = String(value || "").trim();
  if (required && !result) throw new Error("Un champ obligatoire est manquant.");
  if (result.length > max) throw new Error("Un champ dépasse la longueur autorisée.");
  return result;
}

function normalizeCriteria(value) {
  if (!Array.isArray(value)) throw new Error("Les critères doivent être une liste.");
  if (value.length > 30) throw new Error("Une offre ne peut pas contenir plus de 30 critères.");
  const criteria = value.map((item) => {
    const out = {
      label: cleanString(item.label, 300, true),
      required: Boolean(item.required)
    };
    if (item.category !== undefined) {
      const cat = String(item.category || "competence");
      if (!["competence", "experience", "formation", "langue", "autre"].includes(cat)) {
        throw new Error("Catégorie de critère invalide.");
      }
      out.category = cat;
    }
    return out;
  });
  if (new Set(criteria.map((item) => item.label.toLocaleLowerCase("fr"))).size !== criteria.length) {
    throw new Error("Les critères doivent être distincts.");
  }
  return criteria;
}

function normalizeOptionalEmail(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const email = cleanString(value, 254);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error(`${field} invalide.`);
  return email;
}

function normalizeOptionalUrl(value) {
  if (value === undefined || value === null || value === "") return "";
  const url = cleanString(value, 500);
  try {
    const parsed = new URL(url);
    if (!new Set(["https:", "http:"]).has(parsed.protocol) || parsed.username || parsed.password) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error("URL de portfolio invalide.");
  }
}

function normalizeOptionalDeadline(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    throw new Error("La date limite doit être une date ISO valide.");
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("La date limite doit être une date ISO valide.");
  return date.toISOString();
}

function normalizeOptionalDateTime(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    throw new Error(`${field} doit être une date ISO valide.`);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${field} doit être une date ISO valide.`);
  return date.toISOString();
}

function normalizeOptionalPositiveInteger(value, field) {
  if (value === undefined || value === null || value === "") return null;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${field} invalide.`);
  return value;
}

function normalizeBoolean(value, field) {
  if (typeof value !== "boolean") throw new Error(`${field} doit être booléen.`);
  return value;
}

function normalizeScore(value, field = "Score") {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`${field} doit être un nombre entre 0 et 100.`);
  return n;
}

function normalizeExperience(value, field = "Expérience") {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 80) throw new Error(`${field} doit être un nombre entre 0 et 80.`);
  return n;
}

function assertAllowedStatusTransition(currentStatus, nextStatus) {
  if (currentStatus === nextStatus) return;
  const transitions = {
    draft: new Set(["published"]),
    published: new Set(["closed"]),
    closed: new Set(["archived"]),
    archived: new Set()
  };
  if (!transitions[currentStatus]?.has(nextStatus)) {
    throw new Error("La réouverture ou le retour d'une offre clôturée est interdit.");
  }
}

function validateJobPayload(body, { partial = false } = {}) {
  const output = {};
  const fields = ["title", "summary", "description", "location"];
  for (const field of fields) {
    if (!partial || body[field] !== undefined) {
      output[field] = cleanString(body[field], field === "description" ? 10000 : 300, true);
    }
  }
  if (!partial || body.slug !== undefined) {
    output.slug = cleanString(body.slug, 120, true);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(output.slug)) {
      throw new Error("Le slug doit contenir uniquement des minuscules, chiffres et tirets.");
    }
    if (RESERVED_SLUGS.has(output.slug)) {
      throw new Error("Ce slug est réservé aux pages du site (compte, ressources).");
    }
  }
  if (body.criteria !== undefined || !partial) output.criteria = normalizeCriteria(body.criteria);
  if (body.work_mode !== undefined || !partial) {
    output.work_mode = body.work_mode || "onsite";
    if (!["onsite", "hybrid", "remote"].includes(output.work_mode)) throw new Error("Mode de travail invalide.");
  }
  if (body.contract_type !== undefined || !partial) {
    output.contract_type = body.contract_type || "stage";
    if (!CONTRACT_TYPES.has(output.contract_type)) throw new Error("Type de contrat invalide.");
  }
  if (body.status !== undefined || !partial) {
    output.status = body.status || "draft";
    if (!JOB_STATUSES.has(output.status)) throw new Error("Statut d'offre invalide.");
  }
  if (body.employer_type !== undefined || !partial) {
    output.employer_type = body.employer_type || "techzone";
    if (!new Set(["techzone", "partner"]).has(output.employer_type)) {
      throw new Error("Type d'employeur invalide.");
    }
  }
  if (!partial && output.employer_type === "partner" && !body.partner_name) {
    throw new Error("Le nom du partenaire est requis.");
  }
  if (body.partner_name !== undefined || (!partial && output.employer_type === "partner")) {
    output.partner_name = body.partner_name ? cleanString(body.partner_name, 160, true) : null;
  }
  if (body.application_deadline !== undefined) output.application_deadline = normalizeOptionalDeadline(body.application_deadline);
  if (body.image_media_id !== undefined) output.image_media_id = normalizeOptionalPositiveInteger(body.image_media_id, "L'identifiant image");
  if (body.sender_display_name !== undefined) output.sender_display_name = body.sender_display_name ? cleanString(body.sender_display_name, 120) : null;
  if (body.signature_html !== undefined) output.signature_html = body.signature_html ? cleanString(body.signature_html, 10000) : null;
  if (body.reply_to !== undefined) output.reply_to = normalizeOptionalEmail(body.reply_to, "L'adresse de réponse");
  if (body.urgent !== undefined || !partial) output.urgent = normalizeBoolean(body.urgent ?? false, "Urgent");
  // Champs additionnels CDC §9
  if (body.department !== undefined) output.department = body.department ? cleanString(body.department, 160) : null;
  if (body.required_diploma !== undefined) {
    const rd = body.required_diploma ? cleanString(body.required_diploma, 60) : null;
    if (rd && !EDUCATION_LEVELS.has(rd)) {
      // On accepte aussi les libellés libres ("Bac+3 informatique") : on ne bloque pas.
      output.required_diploma = rd;
    } else {
      output.required_diploma = rd;
    }
  }
  if (body.required_experience !== undefined) output.required_experience = body.required_experience ? cleanString(body.required_experience, 120) : null;
  if (body.seniority !== undefined) output.seniority = body.seniority ? cleanString(body.seniority, 80) : null;
  if (body.languages !== undefined) {
    if (!Array.isArray(body.languages)) throw new Error("Les langues doivent être une liste.");
    if (body.languages.length > 20) throw new Error("Trop de langues renseignées.");
    output.languages = body.languages.map((v) => cleanString(v, 60, true));
  }
  if (output.status === "published" && output.criteria && output.criteria.length === 0) {
    throw new Error("Une offre publiée doit contenir au moins un critère explicite.");
  }
  return output;
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

function toPublicJob(job, resolveMediaAsset) {
  return {
    public_id: job.public_id,
    slug: job.slug,
    title: job.title,
    summary: job.summary,
    description: job.description,
    criteria: job.criteria,
    location: job.location,
    work_mode: job.work_mode,
    contract_type: job.contract_type,
    employer_type: job.employer_type,
    partner_name: job.partner_name,
    urgent: job.urgent,
    application_deadline: job.application_deadline,
    department: job.department || null,
    required_diploma: job.required_diploma || null,
    required_experience: job.required_experience || null,
    seniority: job.seniority || null,
    languages: job.languages || [],
    image: resolveMediaAsset?.(job.image_media_id) || null
  };
}

function decodeCursor(value) {
  if (!value || typeof value !== "string" || value.length > 300) return null;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (typeof decoded.createdAt !== "string" || !Number.isSafeInteger(decoded.id) || decoded.id < 1) throw new Error();
    return decoded;
  } catch {
    throw new Error("Curseur de pagination invalide.");
  }
}

function encodeCursor(application) {
  return Buffer.from(JSON.stringify({ createdAt: application.created_at, id: application.id })).toString("base64url");
}

function parseApplicationListQuery(query) {
  const allowed = new Set(["limit", "cursor", "job_id", "processing_status", "hr_decision"]);
  for (const key of Object.keys(query)) {
    if (!allowed.has(key) || Array.isArray(query[key])) throw new Error("Paramètre de liste invalide.");
  }
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new Error("La limite doit être comprise entre 1 et 100.");
  }
  const jobId = query.job_id === undefined ? undefined : Number(query.job_id);
  if (jobId !== undefined && (!Number.isSafeInteger(jobId) || jobId < 1)) {
    throw new Error("Identifiant d'offre invalide.");
  }
  if (query.processing_status !== undefined && !PROCESSING_STATUSES.has(query.processing_status)) {
    throw new Error("Statut de traitement invalide.");
  }
  if (query.hr_decision !== undefined && !DECISIONS.has(query.hr_decision)) {
    throw new Error("Décision RH invalide.");
  }
  return {
    limit,
    jobId,
    processingStatus: query.processing_status,
    hrDecision: query.hr_decision,
    cursor: decodeCursor(query.cursor)
  };
}

function parseSearchQuery(query) {
  const allowed = new Set([
    "q", "skills", "education", "min_experience", "min_score",
    "job_id", "pipeline_status", "hr_decision", "sort", "limit", "offset"
  ]);
  for (const key of Object.keys(query)) {
    if (!allowed.has(key)) throw new Error(`Paramètre de recherche inconnu : ${key}.`);
  }
  const skills = [].concat(query.skills || [])
    .flatMap((value) => String(value).split(","))
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => cleanString(value, 80, true).toLocaleLowerCase("fr"));
  if (skills.length > 20) throw new Error("Trop de compétences demandées (max 20).");
  const sort = ["score", "final"].includes(query.sort) ? query.sort : "recent";
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("Limite invalide.");
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error("Offset invalide.");
  return {
    q: query.q ? cleanString(query.q, 200) : undefined,
    skills,
    education: query.education ? cleanString(query.education, 40) : undefined,
    minExperience: normalizeExperience(query.min_experience, "Expérience minimale"),
    minScore: normalizeScore(query.min_score, "Score minimum"),
    jobId: query.job_id ? Number(query.job_id) : undefined,
    pipelineStatus: query.pipeline_status ? cleanString(query.pipeline_status, 40) : undefined,
    hrDecision: query.hr_decision && DECISIONS.has(query.hr_decision) ? query.hr_decision : undefined,
    sort,
    limit,
    offset
  };
}

function toApplicationListItem(application) {
  return {
    id: application.id,
    public_id: application.public_id,
    full_name: application.full_name,
    email: application.email,
    job_id: application.job_id,
    job_title: application.job_title,
    job_slug: application.job_slug,
    processing_status: application.processing_status,
    pipeline_status: application.pipeline_status,
    hr_decision: application.hr_decision,
    match_score: application.match_score ?? null,
    interview_score: application.interview_score ?? null,
    hr_score: application.hr_score ?? null,
    final_score: application.final_score ?? null,
    scores: application.scores || null,
    experience_years: application.experience_years ?? null,
    education_level: application.education_level ?? null,
    created_at: application.created_at
  };
}

/**
 * Les entretiens ne se planifient (et leurs emails ne partent) qu'une fois la date limite de dépôt
 * de l'offre passée, ou l'offre clôturée/archivée : on évite de convoquer avant d'avoir tout reçu.
 */
function interviewLock(job, now = new Date()) {
  const deadline = job?.application_deadline ? new Date(job.application_deadline) : null;
  const validDeadline = deadline && !Number.isNaN(deadline.getTime());
  const locked = Boolean(validDeadline && deadline > now && job.status === "published");
  return {
    interviews_unlocked: !locked,
    interviews_unlock_at: validDeadline ? job.application_deadline : null
  };
}

function withInterviewLock(job) {
  return { ...job, ...interviewLock(job) };
}

function toApplicationDetail(application) {
  const { analysis_json, interview_questions_json, job_criteria_json, ...safeApplication } = application;
  let analysis = null;
  if (analysis_json) {
    try { analysis = JSON.parse(analysis_json); } catch { analysis = null; }
  }
  return { ...safeApplication, analysis };
}

function clientError(error) {
  if (error?.code === "SQLITE_CONSTRAINT_UNIQUE" && /recruitment_jobs\.slug/i.test(error.message)) {
    return "Ce slug est déjà utilisé.";
  }
  if (error?.code === "SQLITE_CONSTRAINT_UNIQUE" && /recruitment_interviews/i.test(error.message)) {
    return "Un entretien existe déjà pour ce créneau.";
  }
  return error.message;
}

function formatSmtpFrom(configuredFrom, displayName) {
  const addressMatch = String(configuredFrom || "").match(/<([^>]+)>/) ||
    String(configuredFrom || "").match(/([^\s<>]+@[^\s<>]+)/);
  const address = addressMatch?.[1] || addressMatch?.[0];
  if (!address) throw new Error("SMTP_FROM ne contient pas d'adresse valide.");
  const safeName = String(displayName || "TECH ZONE Recrutement")
    .replace(/[\r\n<>]/g, " ")
    .trim()
    .slice(0, 120);
  return { name: safeName, address };
}

/** Garantit que la table légère de paramètres existe (idempotent). */
function ensureSettingsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recruitment_settings (
      key TEXT PRIMARY KEY,
      value_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

const adminActor = (req) => req.adminUser?.email || "admin";

/* ============================================================
 * Fabrique de routeurs
 * ============================================================ */

function createRouters({ repository, config, encryptionKey, aiService, transporter, resolveMediaAsset }) {
  const publicRouter = express.Router();
  const adminRouter = express.Router();
  const maxBytes = Number(config.maxFileMb || 10) * 1024 * 1024;
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 2 }
  }).fields([{ name: "cv", maxCount: 1 }, { name: "cover_letter", maxCount: 1 }]);
  const applicationLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(config.applicationRateLimit || 5),
    standardHeaders: true,
    legacyHeaders: false
  });

  /* ==========================================================
   * SERVICES PARTAGÉS : notifications, session candidat, rôles
   * ========================================================== */

  const notifier = createNotifier({
    repository,
    transporter,
    smtpFrom: config.smtpFrom,
    timezone: config.timezone || "Indian/Antananarivo"
  });
  const sessionKey = deriveSubKey(encryptionKey, "recruitment-candidate-session-v1");
  const sessionTtlSeconds = Math.round(Number(config.sessionTtlHours || 24 * 7) * 3600);
  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: Number(config.authRateLimit || 20),
    standardHeaders: true,
    legacyHeaders: false
  });
  const lastViewLog = new Map();

  // Les notifications ne bloquent jamais la réponse HTTP (un échec SMTP est journalisé par le notifier).
  const notifyAsync = (application, payload) => {
    notifier.notifyCandidate(application, payload).catch(() => {});
  };

  function readCookie(req, name) {
    const raw = req.headers.cookie;
    if (!raw) return null;
    for (const part of raw.split(";")) {
      const index = part.indexOf("=");
      if (index < 0 || part.slice(0, index).trim() !== name) continue;
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
    }
    return null;
  }

  function cookieAttributes(maxAge) {
    const attributes = ["Path=" + (config.cookiePath || "/"), "HttpOnly", "SameSite=Lax", `Max-Age=${maxAge}`];
    if (config.cookieSecure) attributes.push("Secure");
    return attributes.join("; ");
  }

  function issueSession(res, account) {
    const token = signToken({ sub: account.id, tv: account.token_version, kind: "candidate" }, sessionKey, sessionTtlSeconds);
    res.append("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieAttributes(sessionTtlSeconds)}`);
  }

  function clearSession(res) {
    res.append("Set-Cookie", `${SESSION_COOKIE}=; ${cookieAttributes(0)}`);
  }

  /** Compte candidat de la session courante, ou null (jeton invalide, compte désactivé, sessions révoquées). */
  function currentAccount(req) {
    const payload = verifyToken(readCookie(req, SESSION_COOKIE), sessionKey);
    if (!payload || payload.kind !== "candidate") return null;
    const account = repository.getAccountById(payload.sub);
    if (!account || !account.active || account.token_version !== payload.tv) return null;
    return account;
  }

  function requireAccount(req, res, next) {
    const account = currentAccount(req);
    if (!account) return res.status(401).json({ error: "Connexion requise." });
    req.account = account;
    next();
  }

  /** Enregistre l'enregistrement + les documents chiffrés ; annule tout en cas d'échec. */
  function persistApplication({ job, payload, documents, accountId }) {
    const writtenPaths = [];
    let application;
    try {
      application = repository.createApplication(job.id, { ...payload, account_id: accountId || null });
      for (const document of documents) {
        const encrypted = encryptDocument({
          buffer: document.file.buffer,
          storageDir: config.storageDir,
          key: encryptionKey,
          applicationPublicId: application.public_id,
          kind: document.kind
        });
        writtenPaths.push(encrypted.encrypted_path);
        repository.addFile(application.id, {
          kind: document.kind,
          original_name: document.file.originalname,
          mime_type: document.mimeType,
          size_bytes: document.file.size,
          ...encrypted
        });
      }
      return application;
    } catch (error) {
      for (const filename of writtenPaths) fs.rmSync(filename, { force: true });
      if (application) repository.deleteApplication(application.id);
      if (/UNIQUE constraint failed/.test(error.message)) {
        const conflict = new Error("Une candidature existe déjà pour cet email et cette offre.");
        conflict.status = 409;
        throw conflict;
      }
      throw error;
    }
  }

  function collectDocuments(req) {
    const cv = req.files?.cv?.[0];
    const coverLetter = req.files?.cover_letter?.[0];
    if (!cv) {
      const missing = new Error("Le CV est requis.");
      missing.status = 400;
      throw missing;
    }
    const documents = [{ kind: "cv", file: cv }, ...(coverLetter ? [{ kind: "cover_letter", file: coverLetter }] : [])];
    for (const document of documents) {
      try {
        document.mimeType = validateCandidateDocument(document.file, maxBytes);
      } catch (error) {
        error.status = 400;
        throw error;
      }
    }
    return documents;
  }

  function pipelineNotice(status, jobTitle) {
    const notices = {
      preselectionnee: ["Candidature présélectionnée", `Votre candidature au poste « ${jobTitle} » a été présélectionnée. Nous reviendrons vers vous pour la suite.`],
      en_attente: ["Candidature en attente", `Votre candidature au poste « ${jobTitle} » est en attente d'une décision. Nous vous tiendrons informé(e).`],
      acceptee: ["Décision sur votre candidature", `Une décision favorable a été prise pour votre candidature au poste « ${jobTitle} ». L'équipe recrutement vous contactera.`],
      refusee: ["Décision sur votre candidature", `Nous vous remercions de votre intérêt pour le poste « ${jobTitle} ». Votre candidature n'a pas été retenue.`]
    };
    return notices[status] || null;
  }

  /** Change l'étape du pipeline, journalise et prévient le candidat (CDC §11, §24). */
  function moveApplication(application, status, actor) {
    if (application.pipeline_status === status) return application;
    repository.setPipelineStatus(application.id, status);
    repository.recordEvent(application.id, "pipeline_status_changed", actor, { from: application.pipeline_status, to: status });
    const notice = pipelineNotice(status, application.job_title);
    if (notice) {
      notifyAsync(application, { type: "pipeline", title: notice[0], text: `Bonjour ${application.full_name},\n\n${notice[1]}\n\nCe message est informatif ; toute décision finale est prise par un membre de l'équipe.` });
    }
    return repository.getApplicationById(application.id);
  }

  function lockMessage(job) {
    return `Les entretiens ne peuvent être planifiés qu'après la date limite de dépôt des candidatures (${notifier.formatDate(job.application_deadline)}), ou une fois l'offre clôturée.`;
  }

  function notifyInterview(application, { scheduledAt, durationMin, location }) {
    const where = location ? `\nLieu ou lien : ${location}` : "";
    notifyAsync(application, {
      type: "interview",
      title: "Entretien programmé",
      text: `Bonjour ${application.full_name},\n\nVotre entretien pour le poste « ${application.job_title} » est programmé le ${notifier.formatDate(scheduledAt)} (durée ${durationMin} min).${where}\n\nMerci de confirmer votre présence en répondant à ce message si nécessaire.`,
      email: true
    });
  }

  function publicApplicationUrl(path) {
    return `${String(config.publicBaseUrl || "").replace(/\/$/, "")}${path}`;
  }

  /* ==========================================================
   * ROUTES PUBLIQUES
   * ========================================================== */

  publicRouter.get("/offres", (req, res) => {
    const jobs = repository.listJobs({ publicOnly: true }).map((job) =>
      toPublicJob(job, resolveMediaAsset)
    );
    res.json({ total: jobs.length, offres: jobs });
  });

  publicRouter.get("/offres/:slug", (req, res) => {
    const job = repository.getPublishedJobBySlug(req.params.slug);
    if (!job) return res.status(404).json({ error: "Offre introuvable." });
    res.json({ offre: toPublicJob(job, resolveMediaAsset) });
  });

  publicRouter.post(
    "/offres/:publicId/candidatures",
    applicationLimiter,
    upload,
    asyncRoute(async (req, res) => {
      const job = repository.getJobByPublicId(req.params.publicId);
      if (!job || job.status !== "published") return res.status(404).json({ error: "Offre introuvable." });
      if (job.application_deadline && new Date(job.application_deadline) < new Date()) {
        return res.status(410).json({ error: "Cette offre n'accepte plus de candidatures." });
      }
      // Un candidat connecté est déjà authentifié : pas de captcha, et son compte est rattaché à la candidature.
      const account = currentAccount(req);
      if (!account) {
        const captchaValid = await verifyTurnstile({
          secret: config.turnstileSecret,
          token: req.body.turnstile_token,
          ip: req.ip,
          fetchImpl: config.fetchImpl,
          bypass: Boolean(config.bypassTurnstile)
        });
        if (!captchaValid) return res.status(400).json({ error: "Vérification anti-robot invalide." });
      }
      if (![true, "true", "1", 1].includes(req.body.consent)) {
        return res.status(400).json({ error: "Votre consentement explicite est requis." });
      }
      let documents;
      let payload;
      try {
        documents = collectDocuments(req);
        payload = {
          full_name: cleanString(req.body.full_name || account?.full_name, 160, true),
          email: cleanString(account?.email || req.body.email, 254, true),
          phone: cleanString(req.body.phone || account?.phone, 50, true),
          candidate_location: cleanString(req.body.candidate_location || account?.candidate_location, 160),
          portfolio_url: normalizeOptionalUrl(req.body.portfolio_url || account?.portfolio_url)
        };
        if (!/^\S+@\S+\.\S+$/.test(payload.email)) throw new Error("Email invalide.");
      } catch (error) {
        return res.status(error.status || 400).json({ error: error.message });
      }
      let application;
      try {
        application = persistApplication({ job, payload, documents, accountId: account?.id });
      } catch (error) {
        if (error.status) return res.status(error.status).json({ error: error.message });
        throw error;
      }
      repository.recordEvent(application.id, "application_received", account ? "candidate_account" : "candidate");
      notifyAsync(application, {
        type: "application_received",
        title: "Candidature enregistrée",
        text: `Bonjour ${application.full_name},\n\nNous avons bien reçu votre candidature au poste « ${job.title} ».${job.application_deadline ? `\n\nLes candidatures sont ouvertes jusqu'au ${notifier.formatDate(job.application_deadline)} ; les entretiens seront planifiés après cette date.` : ""}\n\nElle sera étudiée par notre équipe ; l'analyse automatisée n'est qu'une aide et la décision reste humaine.`,
        // Accusé de réception automatique (désactivable : config.acknowledgementEmail = false).
        // La notification dans l'espace candidat est toujours enregistrée.
        email: config.acknowledgementEmail !== false
      });
      res.status(202).json({ application_id: application.public_id, status: "queued" });
    })
  );

  /* ==========================================================
   * PORTAIL CANDIDAT (CDC §7.3, §8, §24, §31)
   * ========================================================== */

  publicRouter.use("/compte", express.json({ limit: "100kb" }));

  publicRouter.post("/compte/inscription", authLimiter, asyncRoute(async (req, res) => {
    try {
      const email = normalizeOptionalEmail(req.body.email, "Email");
      if (!email) throw new Error("L'email est requis.");
      validatePasswordStrength(req.body.password);
      if (![true, "true", 1].includes(req.body.consent)) throw new Error("Votre consentement explicite est requis.");
      const fullName = cleanString(req.body.full_name, 160, true);
      const phone = cleanString(req.body.phone, 50);
      const location = cleanString(req.body.candidate_location, 160);
      const portfolio = normalizeOptionalUrl(req.body.portfolio_url);
      if (repository.getAccountByEmail(email)) {
        return res.status(409).json({ error: "Un compte existe déjà avec cet email." });
      }
      let account = repository.createAccount({
        email,
        password_hash: await hashPassword(req.body.password),
        full_name: fullName,
        phone: phone || null,
        candidate_location: location || null
      });
      if (portfolio) account = repository.updateAccountProfile(account.id, { portfolio_url: portfolio });
      repository.recordEvent(null, "account_registered", "candidate", { account_id: account.id });
      issueSession(res, account);
      res.status(201).json({ compte: account });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  }));

  publicRouter.post("/compte/connexion", authLimiter, asyncRoute(async (req, res) => {
    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");
    const invalid = () => res.status(401).json({ error: "Email ou mot de passe incorrect." });
    if (!email || !password) return invalid();
    const account = repository.getAccountByEmail(email, { withSecrets: true });
    if (!account) {
      await burnPasswordCheck(password);
      return invalid();
    }
    const valid = await verifyPassword(password, account.password_hash);
    if (!valid || !account.active) return invalid();
    repository.touchLogin(account.id);
    issueSession(res, repository.getAccountById(account.id));
    res.json({ compte: repository.getAccountById(account.id) });
  }));

  publicRouter.post("/compte/deconnexion", (req, res) => {
    clearSession(res);
    res.status(204).end();
  });

  publicRouter.get("/compte/moi", requireAccount, (req, res) => res.json({ compte: req.account }));

  publicRouter.patch("/compte/moi", requireAccount, (req, res) => {
    try {
      const changes = {};
      if (req.body.full_name !== undefined) changes.full_name = cleanString(req.body.full_name, 160, true);
      if (req.body.phone !== undefined) changes.phone = cleanString(req.body.phone, 50) || null;
      if (req.body.candidate_location !== undefined) changes.candidate_location = cleanString(req.body.candidate_location, 160) || null;
      if (req.body.portfolio_url !== undefined) changes.portfolio_url = normalizeOptionalUrl(req.body.portfolio_url) || null;
      res.json({ compte: repository.updateAccountProfile(req.account.id, changes) });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  publicRouter.post("/compte/mot-de-passe", requireAccount, authLimiter, asyncRoute(async (req, res) => {
    try {
      const secrets = repository.getAccountById(req.account.id, { withSecrets: true });
      if (!(await verifyPassword(String(req.body.current_password || ""), secrets.password_hash))) {
        return res.status(403).json({ error: "Mot de passe actuel incorrect." });
      }
      validatePasswordStrength(req.body.new_password);
      repository.setAccountPassword(req.account.id, await hashPassword(req.body.new_password));
      repository.recordEvent(null, "account_password_changed", "candidate", { account_id: req.account.id });
      issueSession(res, repository.getAccountById(req.account.id)); // les autres sessions sont révoquées
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  }));

  // Réponse identique que le compte existe ou non (anti-énumération).
  publicRouter.post("/compte/mot-de-passe-oublie", authLimiter, asyncRoute(async (req, res) => {
    const email = String(req.body?.email || "").trim();
    const account = /^\S+@\S+\.\S+$/.test(email) ? repository.getAccountByEmail(email) : null;
    if (account && account.active) {
      const token = randomToken(32);
      repository.setResetToken(account.id, sha256Hex(token), new Date(Date.now() + 60 * 60 * 1000).toISOString());
      const link = publicApplicationUrl(`/recrutement/compte?token=${token}`);
      try {
        await notifier.sendPlain({
          to: account.email,
          subject: "Réinitialisation de votre mot de passe",
          text: `Bonjour ${account.full_name},\n\nPour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 heure) :\n${link}\n\nSi vous n'êtes pas à l'origine de cette demande, ignorez ce message.`
        });
      } catch {
        repository.recordEvent(null, "password_reset_email_failed", "system", { account_id: account.id });
      }
    }
    res.status(202).json({ status: "sent" });
  }));

  publicRouter.post("/compte/reinitialisation", authLimiter, asyncRoute(async (req, res) => {
    try {
      const token = String(req.body?.token || "");
      const account = token ? repository.findAccountByResetHash(sha256Hex(token)) : null;
      if (!account || !account.active) return res.status(400).json({ error: "Lien invalide ou expiré." });
      validatePasswordStrength(req.body.password);
      repository.setAccountPassword(account.id, await hashPassword(req.body.password));
      repository.recordEvent(null, "account_password_reset", "candidate", { account_id: account.id });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  }));

  publicRouter.get("/compte/candidatures", requireAccount, (req, res) => {
    res.json({ candidatures: repository.listApplicationsForAccount(req.account.id) });
  });

  publicRouter.post("/compte/candidatures/:publicId/retrait", requireAccount, (req, res) => {
    const application = repository.listApplicationsForAccount(req.account.id).find((item) => item.public_id === req.params.publicId);
    if (!application) return res.status(404).json({ error: "Candidature introuvable." });
    repository.setDecision(application.id, "withdrawn", "candidate");
    repository.recordEvent(application.id, "application_withdrawn", "candidate");
    res.json({ status: "withdrawn" });
  });

  publicRouter.get("/compte/entretiens", requireAccount, (req, res) => {
    res.json({ entretiens: repository.listInterviewsForAccount(req.account.id) });
  });

  publicRouter.get("/compte/notifications", requireAccount, (req, res) => {
    const notifications = repository.listNotifications(req.account.id, { unreadOnly: req.query.unread === "true", limit: 50 });
    res.json({ notifications, unread: notifications.filter((item) => !item.read_at).length });
  });

  publicRouter.post("/compte/notifications/lues", requireAccount, (req, res) => {
    const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number).filter(Number.isSafeInteger) : null;
    res.json({ changed: repository.markNotificationsRead(req.account.id, ids) });
  });

  // Droit à l'effacement (CDC §31) : supprime le compte, ses candidatures, ses CV chiffrés et ses notifications.
  publicRouter.delete("/compte", requireAccount, authLimiter, asyncRoute(async (req, res) => {
    const secrets = repository.getAccountById(req.account.id, { withSecrets: true });
    if (!(await verifyPassword(String(req.body?.password || ""), secrets.password_hash))) {
      return res.status(403).json({ error: "Mot de passe incorrect." });
    }
    const removed = repository.deleteAccountWithApplications(req.account.id);
    repository.recordEvent(null, "account_erased", "candidate", { account_id: req.account.id, applications_removed: removed });
    clearSession(res);
    res.status(204).end();
  }));

  /* ==========================================================
   * CONTRÔLE D'ACCÈS RH (CDC §7, §8, §30)
   * lecteur = lecture seule ; recruteur = recrutement ;
   * admin = + équipe, comptes, journal, paramètres, effacement.
   * ========================================================== */

  adminRouter.use((req, res, next) => {
    const role = repository.resolveStaffRole(req.adminUser?.email);
    if (!role) return res.status(403).json({ error: "Compte RH désactivé ou non autorisé." });
    req.staffRole = role;
    const isRead = req.method === "GET" || req.method === "HEAD";
    const adminOnly = /^\/(equipe|comptes|audit)(\/|$)/.test(req.path)
      || (!isRead && /^\/parametres(\/|$)/.test(req.path))
      || (req.method === "DELETE" && /^\/candidatures\/[^/]+$/.test(req.path));
    if (role === "lecteur" && !isRead) return res.status(403).json({ error: "Rôle lecteur : lecture seule." });
    if (adminOnly && role !== "admin") return res.status(403).json({ error: "Action réservée aux administrateurs." });
    next();
  });

  adminRouter.get("/moi", (req, res) => {
    res.json({
      email: req.adminUser?.email || null,
      display_name: req.adminUser?.display_name || req.adminUser?.email || "Admin RH",
      role: req.staffRole
    });
  });

  /* ==========================================================
   * TABLEAU DE BORD (CDC §22)
   * ========================================================== */

  adminRouter.get("/tableau-de-bord", (req, res) => {
    try {
      res.json(repository.dashboardStats());
    } catch (error) {
      res.status(500).json({ error: clientError(error) });
    }
  });

  /* ==========================================================
   * OFFRES (CDC §9)
   * ========================================================== */

  adminRouter.get("/offres", (req, res) => res.json({ offres: repository.listJobs().map(withInterviewLock) }));

  adminRouter.post("/offres", (req, res) => {
    try {
      const payload = validateJobPayload(req.body);
      if (payload.status === "published" && payload.application_deadline && new Date(payload.application_deadline).getTime() <= Date.now()) {
        throw new Error("Une offre publiée doit avoir une date limite future.");
      }
      const job = repository.createJob(payload);
      repository.recordEvent(null, "job_created", adminActor(req), { job_id: job.id, status: job.status });
      res.status(201).json({ offre: job });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  adminRouter.patch("/offres/:id", (req, res) => {
    try {
      const existing = repository.getJobById(req.params.id);
      if (!existing) return res.status(404).json({ error: "Offre introuvable." });
      const changes = validateJobPayload(req.body, { partial: true });
      const nextStatus = changes.status || existing.status;
      const nextCriteria = changes.criteria || existing.criteria;
      const nextEmployerType = changes.employer_type || existing.employer_type;
      const nextPartnerName = changes.partner_name ?? existing.partner_name;
      if (nextStatus === "published" && nextCriteria.length === 0) {
        return res.status(400).json({ error: "Une offre publiée doit contenir au moins un critère explicite." });
      }
      if (nextEmployerType === "partner" && !nextPartnerName) {
        return res.status(400).json({ error: "Le nom du partenaire est requis." });
      }
      assertAllowedStatusTransition(existing.status, nextStatus);
      const nextDeadline = changes.application_deadline ?? existing.application_deadline;
      if (nextStatus === "published" && nextDeadline && new Date(nextDeadline).getTime() <= Date.now()) {
        return res.status(400).json({ error: "Une offre publiée doit avoir une date limite future." });
      }
      const job = repository.updateJob(req.params.id, changes);
      if (!job) return res.status(404).json({ error: "Offre introuvable." });
      if (existing.status !== job.status) {
        repository.recordEvent(null, "job_status_changed", adminActor(req), {
          job_id: job.id, from: existing.status, to: job.status
        });
      }
      res.json({ offre: job });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  adminRouter.delete("/offres/:id", (req, res) => {
    if (!repository.getJobById(req.params.id)) {
      return res.status(404).json({ error: "Offre introuvable." });
    }
    if (!repository.deleteJob(req.params.id)) {
      return res.status(409).json({ error: "Seul un brouillon sans candidature peut être supprimé." });
    }
    repository.recordEvent(null, "job_deleted", adminActor(req), { job_id: Number(req.params.id) });
    res.status(204).end();
  });

  /* ==========================================================
   * CANDIDATURES — Liste, détail, recherche, actions
   * ========================================================== */

  adminRouter.get("/candidatures", (req, res) => {
    try {
      const query = parseApplicationListQuery(req.query);
      const applications = repository.listApplications(query);
      const hasNext = applications.length > query.limit;
      const candidatures = applications.slice(0, query.limit).map(toApplicationListItem);
      res.json({
        candidatures,
        pagination: {
          limit: query.limit,
          next_cursor: hasNext ? encodeCursor(applications[query.limit - 1]) : null
        }
      });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  // Recherche multicritère (CDC §23). Doit être déclarée AVANT /candidatures/:id
  // pour ne pas être interprétée comme un identifiant.
  adminRouter.get("/candidatures/recherche", (req, res) => {
    try {
      const query = parseSearchQuery(req.query);
      const result = repository.searchApplications(query);
      res.json({
        total: result.total,
        rows: result.rows.map(toApplicationListItem),
        pagination: {
          limit: query.limit,
          offset: query.offset,
          has_more: query.offset + query.limit < result.total
        }
      });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  adminRouter.get("/candidatures/:id", (req, res) => {
    const application = repository.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ error: "Candidature introuvable." });
    const files = repository.listFiles(application.id).map(({ encrypted_path, iv, auth_tag, ...file }) => file);
    const notes = repository.listEvents(application.id)
      .filter((event) => event.event_type === "hr_note_added" && event.details?.note)
      .map((event) => ({ text: event.details.note, actor: event.actor, created_at: event.created_at }));
    // Accès sensible journalisé (CDC §31), au plus une fois par 10 minutes et par couple acteur/dossier.
    const viewKey = `${adminActor(req)}:${application.id}`;
    if (Date.now() - (lastViewLog.get(viewKey) || 0) > 10 * 60 * 1000) {
      lastViewLog.set(viewKey, Date.now());
      repository.recordEvent(application.id, "hr_viewed", adminActor(req));
    }
    const lock = interviewLock(repository.getJobById(application.job_id));
    res.json({ candidature: { ...toApplicationDetail(application), notes, ...lock }, fichiers: files });
  });

  adminRouter.get("/candidatures/:id/events", (req, res) => {
    const application = repository.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ error: "Candidature introuvable." });
    res.json({ evenements: repository.listEvents(application.id) });
  });

  adminRouter.get("/candidatures/:id/fichiers/:fileId", (req, res) => {
    const application = repository.getApplicationById(req.params.id);
    const file = repository.getFile(req.params.fileId);
    if (!application || !file || file.application_id !== application.id) {
      return res.status(404).json({ error: "Fichier introuvable." });
    }
    try {
      const buffer = decryptDocument(file, encryptionKey);
      repository.recordEvent(application.id, "file_downloaded", adminActor(req), { file_id: file.id, kind: file.kind });
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(file.original_name)}`);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Cache-Control", "private, no-store");
      res.send(buffer);
    } catch (error) {
      console.error(`Échec de déchiffrement pour le fichier ${file.id}.`);
      res.status(500).json({ error: "Impossible de déchiffrer ce document." });
    }
  });

  adminRouter.post("/candidatures/:id/retry-analysis", (req, res) => {
    const application = repository.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ error: "Candidature introuvable." });
    if (!repository.retryAnalysis(application.id)) {
      return res.status(409).json({ error: "Seule une analyse échouée peut être relancée." });
    }
    repository.recordEvent(application.id, "analysis_retry_requested", adminActor(req));
    res.status(202).json({ status: "queued" });
  });

  adminRouter.patch("/candidatures/:id/decision", (req, res) => {
    if (!DECISIONS.has(req.body.decision)) return res.status(400).json({ error: "Décision invalide." });
    const actor = adminActor(req);
    const application = repository.setDecision(req.params.id, req.body.decision, actor);
    if (!application) return res.status(404).json({ error: "Candidature introuvable." });
    repository.recordEvent(application.id, "hr_decision_changed", actor, { decision: req.body.decision });
    let current = application;
    if (req.body.decision === "selected" && ["nouvelle", "en_analyse", "cv_analyse"].includes(current.pipeline_status)) {
      current = moveApplication(current, "preselectionnee", actor);
    } else if (req.body.decision === "rejected") {
      current = moveApplication(current, "refusee", actor);
    }
    res.json({ candidature: toApplicationDetail(current) });
  });

  // Étape du pipeline (CDC §11) : changement manuel, journalisé, notifié au candidat.
  adminRouter.patch("/candidatures/:id/pipeline", (req, res) => {
    const status = req.body?.status;
    if (!PIPELINE_STATUSES.has(status)) return res.status(400).json({ error: "Étape de pipeline invalide." });
    const application = repository.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ error: "Candidature introuvable." });
    const updated = moveApplication(application, status, adminActor(req));
    res.json({ candidature: toApplicationDetail(updated) });
  });

  // Dépôt d'une candidature par un recruteur (CDC §12) : le consentement du candidat doit être confirmé.
  adminRouter.post("/candidatures", upload, asyncRoute(async (req, res) => {
    const job = repository.getJobById(req.body.job_id);
    if (!job) return res.status(404).json({ error: "Offre introuvable." });
    if (![true, "true", "1", 1].includes(req.body.consent)) {
      return res.status(400).json({ error: "Confirmez que le candidat a consenti au traitement de ses données." });
    }
    let documents;
    let payload;
    try {
      documents = collectDocuments(req);
      payload = {
        full_name: cleanString(req.body.full_name, 160, true),
        email: cleanString(req.body.email, 254, true),
        phone: cleanString(req.body.phone, 50, true),
        candidate_location: cleanString(req.body.candidate_location, 160),
        portfolio_url: normalizeOptionalUrl(req.body.portfolio_url)
      };
      if (!/^\S+@\S+\.\S+$/.test(payload.email)) throw new Error("Email invalide.");
    } catch (error) {
      return res.status(error.status || 400).json({ error: error.message });
    }
    let application;
    try {
      application = persistApplication({ job, payload, documents });
    } catch (error) {
      if (error.status) return res.status(error.status).json({ error: error.message });
      throw error;
    }
    repository.recordEvent(application.id, "application_created_by_staff", adminActor(req));
    res.status(201).json({ candidature: toApplicationDetail(application) });
  }));

  // Droit à l'effacement (CDC §31) : réservé aux administrateurs (voir le contrôle d'accès).
  adminRouter.delete("/candidatures/:id", (req, res) => {
    const application = repository.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ error: "Candidature introuvable." });
    repository.eraseApplication(application.id);
    repository.recordEvent(null, "application_erased", adminActor(req), { application_id: application.id });
    res.status(204).end();
  });

  // Note RH libre (CDC §17 : explication/justification). Tracée dans le journal.
  adminRouter.post("/candidatures/:id/notes", (req, res) => {
    const application = repository.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ error: "Candidature introuvable." });
    let text;
    try {
      text = cleanString(req.body.text, 2000, true);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    repository.recordEvent(application.id, "hr_note_added", adminActor(req), { note: text });
    res.status(201).json({ success: true });
  });

  // Questions d'entretien générées par l'IA à partir de l'offre et du CV analysé (CDC §18)
  async function generateQuestionsFor(application, actor) {
    if (!application.analysis_json) return null;
    let analysis;
    try { analysis = JSON.parse(application.analysis_json); } catch { return null; }
    const job = repository.getJobById(application.job_id);
    const questions = await aiService.generateInterviewQuestions({ job, analysis });
    repository.saveInterviewQuestions(application.id, questions);
    repository.recordEvent(application.id, "interview_questions_generated", actor);
    return questions;
  }

  // À la convocation, les questions sont préparées automatiquement (sans bloquer la réponse).
  function prepareQuestionsAsync(application, actor) {
    if (application.interview_questions || typeof aiService.generateInterviewQuestions !== "function") return;
    generateQuestionsFor(application, actor).catch(() => {});
  }

  adminRouter.post("/candidatures/:id/interview-questions", asyncRoute(async (req, res) => {
    const application = repository.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ error: "Candidature introuvable." });
    if (!application.analysis_json) {
      return res.status(409).json({ error: "Analyse IA requise avant la génération des questions." });
    }
    const questions = await generateQuestionsFor(application, adminActor(req));
    if (!questions) return res.status(409).json({ error: "Analyse IA illisible." });
    res.json({ questions });
  }));

  /* ==========================================================
   * NOTE RH /20, CLASSEMENT PAR OFFRE, CONVOCATIONS GROUPÉES
   * Score final /170 = analyse IA (/100) + entretien (/50) + note RH (/20)
   * ========================================================== */

  adminRouter.patch("/candidatures/:id/score-rh", (req, res) => {
    try {
      const application = repository.getApplicationById(req.params.id);
      if (!application) return res.status(404).json({ error: "Candidature introuvable." });
      const updated = repository.setHrScore(application.id, req.body?.score, adminActor(req));
      repository.recordEvent(application.id, "hr_score_set", adminActor(req), {
        score: updated.hr_score,
        comment: req.body?.comment ? cleanString(req.body.comment, 500) : undefined
      });
      res.json({ candidature: toApplicationDetail(updated) });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  adminRouter.get("/offres/:id/classement", (req, res) => {
    const job = repository.getJobById(req.params.id);
    if (!job) return res.status(404).json({ error: "Offre introuvable." });
    const rows = repository.listRanking(job.id).map((application) => ({
      ...toApplicationListItem(application),
      rank: application.rank,
      next_interview_at: application.next_interview_at || null,
      interviews_count: application.interviews_count || 0
    }));
    res.json({
      offre: {
        id: job.id, title: job.title, status: job.status, application_deadline: job.application_deadline,
        ...interviewLock(job)
      },
      rows,
      maxima: SCORE_MAX
    });
  });

  // Convocation groupée : on coche des candidats dans le classement, un créneau est attribué à chacun
  // (l'un après l'autre) et l'email de convocation part automatiquement. Bloqué avant la date limite.
  adminRouter.post("/offres/:id/convocations", (req, res) => {
    try {
      const job = repository.getJobById(req.params.id);
      if (!job) return res.status(404).json({ error: "Offre introuvable." });
      const lock = interviewLock(job);
      if (!lock.interviews_unlocked) {
        return res.status(409).json({ error: lockMessage(job), ...lock });
      }
      const ids = [...new Set([].concat(req.body.application_ids || []).map(Number))].filter((id) => Number.isSafeInteger(id) && id > 0);
      if (!ids.length) throw new Error("Sélectionnez au moins un candidat.");
      if (ids.length > 100) throw new Error("100 candidats maximum par envoi.");
      const startAt = normalizeOptionalDateTime(req.body.start_at, "Date de début");
      if (!startAt) throw new Error("La date et l'heure du premier entretien sont requises.");
      const durationMin = req.body.duration_min ? Number(req.body.duration_min) : 45;
      if (!Number.isSafeInteger(durationMin) || durationMin < 15 || durationMin > 240) throw new Error("La durée doit être entre 15 et 240 minutes.");
      const gapMin = req.body.gap_min === undefined || req.body.gap_min === "" ? 15 : Number(req.body.gap_min);
      if (!Number.isSafeInteger(gapMin) || gapMin < 0 || gapMin > 120) throw new Error("La pause entre entretiens doit être entre 0 et 120 minutes.");
      const mode = req.body.mode || "onsite";
      if (!INTERVIEW_MODES.has(mode)) throw new Error("Mode d'entretien invalide.");
      const interviewerEmail = normalizeOptionalEmail(req.body.interviewer_email, "Email recruteur");
      if (!interviewerEmail) throw new Error("L'email du recruteur est requis.");
      const location = req.body.location ? cleanString(req.body.location, 500) : null;
      const notes = req.body.notes ? cleanString(req.body.notes, 2000) : null;
      const actor = adminActor(req);

      const stepMs = (durationMin + gapMin) * 60000;
      let cursor = new Date(startAt).getTime();
      const created = [];
      const skipped = [];
      for (const id of ids) {
        const application = repository.getApplicationById(id);
        if (!application || application.job_id !== job.id) { skipped.push({ application_id: id, reason: "Candidature introuvable pour cette offre." }); continue; }
        if (application.processing_status !== "analysis_ready") { skipped.push({ application_id: id, reason: "Analyse IA requise." }); continue; }
        if (application.hr_decision === "withdrawn" || application.pipeline_status === "refusee") { skipped.push({ application_id: id, reason: "Candidature retirée ou refusée." }); continue; }
        if (repository.listInterviews({ applicationId: id, status: "planned", limit: 1 }).length) { skipped.push({ application_id: id, reason: "Déjà convoqué(e)." }); continue; }
        let slot = cursor;
        let attempts = 0;
        while (attempts < 200 && repository.findInterviewerConflict({ interviewerEmail, startIso: new Date(slot).toISOString(), durationMin })) {
          slot += stepMs;
          attempts += 1;
        }
        if (attempts >= 200) { skipped.push({ application_id: id, reason: "Aucun créneau libre pour ce recruteur." }); continue; }
        const scheduledAt = new Date(slot).toISOString();
        const interview = repository.createInterview({
          application_id: id, scheduled_at: scheduledAt, duration_min: durationMin, mode, location,
          interviewer_email: interviewerEmail, notes, created_by: actor
        });
        repository.setPipelineStatus(id, "entretien");
        repository.recordEvent(id, "interview_scheduled", actor, { interview_id: interview.id, scheduled_at: scheduledAt, mode, bulk: true });
        notifyInterview(application, { scheduledAt, durationMin, location });
        prepareQuestionsAsync(application, actor);
        created.push({ application_id: id, interview_id: interview.id, scheduled_at: scheduledAt });
        cursor = slot + stepMs;
      }
      repository.recordEvent(null, "interviews_bulk_scheduled", actor, { job_id: job.id, created: created.length, skipped: skipped.length });
      res.status(201).json({ created, skipped });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  /* ==========================================================
   * EMAIL DE SÉLECTION (déjà en place, conservé)
   * ========================================================== */

  adminRouter.post("/candidatures/:id/email-draft", asyncRoute(async (req, res) => {
    const application = repository.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ error: "Candidature introuvable." });
    if (application.hr_decision !== "selected") {
      return res.status(409).json({ error: "Le candidat doit être marqué retenu avant de préparer cet email." });
    }
    const job = repository.getJobById(application.job_id);
    const draft = await aiService.draftSelectionEmail({ application, job });
    const signature = sanitizeEmailHtml(job.signature_html || "<p>L'équipe recrutement TECH ZONE</p>");
    res.json({
      draft: {
        subject: draft.subject,
        html: `${sanitizeEmailHtml(draft.html)}${signature}`,
        recipient: application.email,
        sender_display_name: job.sender_display_name || (job.employer_type === "partner" ? job.partner_name : "TECH ZONE Recrutement"),
        reply_to: job.reply_to || null
      }
    });
  }));

  adminRouter.post("/candidatures/:id/emails/send", asyncRoute(async (req, res) => {
    const application = repository.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ error: "Candidature introuvable." });
    if (application.hr_decision !== "selected" || req.body.confirmed !== true) {
      return res.status(409).json({ error: "Décision RH et confirmation explicite requises." });
    }
    const idempotencyKey = cleanString(req.body.idempotency_key, 200, true);
    const subject = cleanString(req.body.subject, 240, true);
    const html = sanitizeEmailHtml(req.body.html);
    if (!html) return res.status(400).json({ error: "Le contenu de l'email est vide." });
    const actor = adminActor(req);
    let emailId;
    try {
      const result = repository.db.prepare(`
        INSERT INTO recruitment_emails (
          application_id, idempotency_key, recipient, subject, html_body,
          text_body, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, 'sending', ?)
      `).run(application.id, idempotencyKey, application.email, subject, html, htmlToText(html), actor);
      emailId = result.lastInsertRowid;
    } catch (error) {
      if (/UNIQUE constraint failed/.test(error.message)) {
        const existing = repository.db.prepare("SELECT * FROM recruitment_emails WHERE idempotency_key = ?").get(idempotencyKey);
        if (existing.status === "sent") {
          return res.status(200).json({ email: existing, duplicate: true });
        }
        if (existing.status === "sending") {
          return res.status(409).json({ email: existing, duplicate: true });
        }
        const claimed = repository.db.prepare(`
          UPDATE recruitment_emails SET status='sending', error_message=NULL
          WHERE id=? AND status='failed'
        `).run(existing.id).changes;
        if (!claimed) return res.status(409).json({ email: existing, duplicate: true });
        emailId = existing.id;
      } else {
        throw error;
      }
    }
    try {
      const job = repository.getJobById(application.job_id);
      const info = await transporter.sendMail({
        from: formatSmtpFrom(config.smtpFrom, job.sender_display_name || (job.employer_type === "partner" ? job.partner_name : null)),
        to: application.email,
        replyTo: job.reply_to || undefined,
        subject,
        html,
        text: htmlToText(html),
        headers: { "X-TechZone-Idempotency-Key": idempotencyKey }
      });
      repository.db.prepare(`
        UPDATE recruitment_emails SET status='sent', smtp_message_id=?, sent_at=datetime('now') WHERE id=?
      `).run(info.messageId || null, emailId);
      repository.recordEvent(application.id, "selection_email_sent", actor, { idempotency_key: idempotencyKey });
      res.json({ success: true, email_id: emailId });
    } catch (error) {
      repository.db.prepare("UPDATE recruitment_emails SET status='failed', error_message=? WHERE id=?")
        .run("Échec d'envoi SMTP.", emailId);
      repository.recordEvent(application.id, "selection_email_failed", actor, { email_id: Number(emailId) });
      throw error;
    }
  }));

  /* ==========================================================
   * ENTRETIENS (CDC §20)
   * ========================================================== */

  adminRouter.get("/entretiens", (req, res) => {
    try {
      const filters = {
        applicationId: req.query.application_id ? Number(req.query.application_id) : undefined,
        status: req.query.status && INTERVIEW_STATUSES.has(req.query.status) ? req.query.status : undefined,
        interviewer: req.query.interviewer ? cleanString(req.query.interviewer, 254) : undefined,
        from: req.query.from ? normalizeOptionalDateTime(req.query.from, "Date de début") : undefined,
        to: req.query.to ? normalizeOptionalDateTime(req.query.to, "Date de fin") : undefined,
        limit: req.query.limit ? Math.min(Number(req.query.limit), 200) : 100
      };
      const entretiens = repository.listInterviews(filters);
      res.json({ entretiens });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  adminRouter.post("/entretiens", (req, res) => {
    try {
      const applicationId = Number(req.body.application_id);
      if (!Number.isSafeInteger(applicationId) || applicationId < 1) {
        throw new Error("Candidature invalide.");
      }
      const application = repository.getApplicationById(applicationId);
      if (!application) return res.status(404).json({ error: "Candidature introuvable." });
      const lock = interviewLock(repository.getJobById(application.job_id));
      if (!lock.interviews_unlocked) {
        return res.status(409).json({ error: lockMessage(repository.getJobById(application.job_id)), ...lock });
      }
      if (application.processing_status !== "analysis_ready") {
        return res.status(409).json({ error: "Analyse IA requise avant de planifier un entretien." });
      }
      const scheduledAt = normalizeOptionalDateTime(req.body.scheduled_at, "Date de l'entretien");
      if (!scheduledAt) throw new Error("La date de l'entretien est requise.");
      const durationMin = req.body.duration_min ? Number(req.body.duration_min) : 45;
      if (!Number.isSafeInteger(durationMin) || durationMin < 15 || durationMin > 240) {
        throw new Error("La durée doit être entre 15 et 240 minutes.");
      }
      const mode = req.body.mode || "onsite";
      if (!INTERVIEW_MODES.has(mode)) throw new Error("Mode d'entretien invalide.");
      const interviewerEmail = normalizeOptionalEmail(req.body.interviewer_email, "Email recruteur");
      if (!interviewerEmail) throw new Error("L'email du recruteur est requis.");
      const location = req.body.location ? cleanString(req.body.location, 500) : null;
      const notes = req.body.notes ? cleanString(req.body.notes, 2000) : null;
      const actor = adminActor(req);

      const conflict = repository.findInterviewerConflict({
        interviewerEmail,
        startIso: scheduledAt,
        durationMin
      });
      if (conflict) {
        return res.status(409).json({ error: "Ce créneau est déjà occupé pour ce recruteur." });
      }

      const interview = repository.createInterview({
        application_id: applicationId,
        scheduled_at: scheduledAt,
        duration_min: durationMin,
        mode,
        location,
        interviewer_email: interviewerEmail,
        notes,
        created_by: actor
      });
      repository.setPipelineStatus(applicationId, "entretien");
      repository.recordEvent(applicationId, "interview_scheduled", actor, {
        interview_id: interview.id,
        scheduled_at: scheduledAt,
        mode
      });
      if (req.body.notify_candidate !== false) notifyInterview(application, { scheduledAt, durationMin, location });
      prepareQuestionsAsync(application, actor);
      res.status(201).json({ entretien: interview });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  adminRouter.patch("/entretiens/:id", (req, res) => {
    try {
      const existing = repository.getInterview(req.params.id);
      if (!existing) return res.status(404).json({ error: "Entretien introuvable." });
      const changes = {};
      if (req.body.scheduled_at !== undefined) {
        changes.scheduled_at = normalizeOptionalDateTime(req.body.scheduled_at, "Date de l'entretien");
      }
      if (req.body.duration_min !== undefined) {
        const d = Number(req.body.duration_min);
        if (!Number.isSafeInteger(d) || d < 15 || d > 240) throw new Error("Durée invalide.");
        changes.duration_min = d;
      }
      if (req.body.mode !== undefined) {
        if (!INTERVIEW_MODES.has(req.body.mode)) throw new Error("Mode invalide.");
        changes.mode = req.body.mode;
      }
      if (req.body.location !== undefined) changes.location = req.body.location ? cleanString(req.body.location, 500) : null;
      if (req.body.interviewer_email !== undefined) {
        changes.interviewer_email = normalizeOptionalEmail(req.body.interviewer_email, "Email recruteur");
      }
      if (req.body.status !== undefined) {
        if (!INTERVIEW_STATUSES.has(req.body.status)) throw new Error("Statut d'entretien invalide.");
        changes.status = req.body.status;
      }
      if (req.body.notes !== undefined) changes.notes = req.body.notes ? cleanString(req.body.notes, 2000) : null;

      // Vérifie le conflit si le créneau change
      if (changes.scheduled_at || changes.duration_min || changes.interviewer_email) {
        const conflict = repository.findInterviewerConflict({
          interviewerEmail: changes.interviewer_email || existing.interviewer_email,
          startIso: changes.scheduled_at || existing.scheduled_at,
          durationMin: changes.duration_min || existing.duration_min,
          excludeId: existing.id
        });
        if (conflict) return res.status(409).json({ error: "Ce créneau est déjà occupé pour ce recruteur." });
      }
      const interview = repository.updateInterview(req.params.id, changes);
      repository.recordEvent(existing.application_id, "interview_updated", adminActor(req), { interview_id: interview.id });
      const rescheduled = changes.scheduled_at && changes.scheduled_at !== existing.scheduled_at;
      if (rescheduled || changes.status === "cancelled") {
        const application = repository.getApplicationById(existing.application_id);
        if (application) {
          notifyAsync(application, {
            type: "interview",
            title: changes.status === "cancelled" ? "Entretien annulé" : "Entretien reprogrammé",
            text: changes.status === "cancelled"
              ? `Bonjour ${application.full_name},\n\nVotre entretien du ${notifier.formatDate(existing.scheduled_at)} est annulé. Nous vous recontacterons.`
              : `Bonjour ${application.full_name},\n\nVotre entretien est reprogrammé au ${notifier.formatDate(interview.scheduled_at)}.`,
            email: true
          });
        }
      }
      res.json({ entretien: interview });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  /* ==========================================================
   * ÉVALUATIONS (CDC §21)
   * ========================================================== */

  adminRouter.get("/candidatures/:id/evaluations", (req, res) => {
    const application = repository.getApplicationById(req.params.id);
    if (!application) return res.status(404).json({ error: "Candidature introuvable." });
    res.json({ evaluations: repository.listEvaluations(application.id) });
  });

  adminRouter.post("/candidatures/:id/evaluations", (req, res) => {
    try {
      const application = repository.getApplicationById(req.params.id);
      if (!application) return res.status(404).json({ error: "Candidature introuvable." });
      const scores = ["technical", "communication", "motivation", "experience", "adaptability"].map((key) => {
        const n = Number(req.body[key]);
        if (!Number.isSafeInteger(n) || n < 1 || n > EVALUATION_MAX) throw new Error(`Note « ${key} » invalide (1 à ${EVALUATION_MAX}).`);
        return n;
      });
      const recommendation = req.body.recommendation || "reserve";
      if (!EVALUATION_RECOMMENDATIONS.has(recommendation)) {
        throw new Error("Recommandation invalide.");
      }
      const actor = adminActor(req);
      const interviewId = req.body.interview_id ? Number(req.body.interview_id) : null;

      // Si aucun interview_id n'est fourni, on rattache à l'entretien le plus récent
      let resolvedInterviewId = interviewId;
      if (!resolvedInterviewId) {
        const recent = repository.listInterviews({ applicationId: application.id, limit: 1 });
        resolvedInterviewId = recent[0]?.id || null;
      }
      if (!resolvedInterviewId) {
        return res.status(409).json({ error: "Aucun entretien associé à cette candidature." });
      }

      const targetInterview = repository.getInterview(resolvedInterviewId);
      if (!targetInterview || targetInterview.application_id !== application.id) {
        throw new Error("Cet entretien n'appartient pas à cette candidature.");
      }
      const evaluation = repository.upsertEvaluation({
        interview_id: resolvedInterviewId,
        application_id: application.id,
        evaluator: actor,
        technical: scores[0],
        communication: scores[1],
        motivation: scores[2],
        experience: scores[3],
        adaptability: scores[4],
        recommendation,
        comment: req.body.comment ? cleanString(req.body.comment, 4000) : null
      });

      // Aligne le pipeline : une évaluation enregistrée = entretien réalisé.
      if (application.pipeline_status === "entretien") {
        repository.setPipelineStatus(application.id, "evaluation");
      }
      repository.recordEvent(application.id, "evaluation_submitted", actor, {
        interview_id: resolvedInterviewId,
        total: evaluation.total,
        recommendation
      });
      res.status(201).json({ evaluation });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  /* ==========================================================
   * ÉQUIPE / STAFF (CDC §7.1 et §8)
   * ========================================================== */

  adminRouter.get("/equipe", (req, res) => {
    res.json({ membres: repository.listStaff() });
  });

  adminRouter.post("/equipe", (req, res) => {
    try {
      const email = normalizeOptionalEmail(req.body.email, "Email");
      if (!email) throw new Error("L'email est requis.");
      const role = req.body.role || "recruteur";
      if (!STAFF_ROLES.has(role)) throw new Error("Rôle invalide.");
      const active = req.body.active !== false;
      const current = repository.getStaff(email);
      const demotesLastAdmin = current && current.role === "admin" && current.active && (role !== "admin" || !active);
      if (demotesLastAdmin && repository.countActiveAdmins() <= 1) {
        return res.status(409).json({ error: "Impossible de retirer le dernier administrateur actif." });
      }
      const membre = repository.upsertStaff({ email, role, active });
      repository.recordEvent(null, "staff_upserted", adminActor(req), { email, role, active });
      res.status(201).json({ membre });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  /* ==========================================================
   * COMPTES CANDIDATS (CDC §8, §31)
   * ========================================================== */

  adminRouter.get("/comptes", (req, res) => {
    try {
      const limit = req.query.limit ? Math.min(Number(req.query.limit), 200) : 50;
      const offset = req.query.offset ? Math.max(Number(req.query.offset), 0) : 0;
      res.json({ comptes: repository.listAccounts({ limit, offset }) });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  adminRouter.get("/comptes/:id", (req, res) => {
    const compte = repository.getAccountById(req.params.id);
    if (!compte) return res.status(404).json({ error: "Compte introuvable." });
    res.json({ compte });
  });

  adminRouter.post("/comptes/:id/activer", (req, res) => {
    const compte = repository.setAccountActive(req.params.id, true);
    if (!compte) return res.status(404).json({ error: "Compte introuvable." });
    repository.recordEvent(null, "account_activated", adminActor(req), { account_id: compte.id });
    res.json({ compte });
  });

  adminRouter.post("/comptes/:id/desactiver", (req, res) => {
    const compte = repository.setAccountActive(req.params.id, false);
    if (!compte) return res.status(404).json({ error: "Compte introuvable." });
    repository.recordEvent(null, "account_deactivated", adminActor(req), { account_id: compte.id });
    res.json({ compte });
  });

  adminRouter.delete("/comptes/:id", (req, res) => {
    const compte = repository.getAccountById(req.params.id);
    if (!compte) return res.status(404).json({ error: "Compte introuvable." });
    const removed = repository.deleteAccountWithApplications(req.params.id);
    repository.recordEvent(null, "account_erased", adminActor(req), {
      account_id: Number(req.params.id),
      applications_removed: removed
    });
    res.status(204).end();
  });

  /* ==========================================================
   * JOURNAL D'AUDIT (CDC §30)
   * ========================================================== */

  adminRouter.get("/audit", (req, res) => {
    try {
      const result = repository.listAuditEvents({
        eventType: req.query.event_type ? cleanString(req.query.event_type, 80) : undefined,
        actor: req.query.actor ? cleanString(req.query.actor, 254) : undefined,
        applicationId: req.query.application_id ? Number(req.query.application_id) : undefined,
        beforeId: req.query.before_id ? Number(req.query.before_id) : undefined,
        limit: req.query.limit ? Math.min(Number(req.query.limit), 200) : 50
      });
      res.json(result);
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  /* ==========================================================
   * NOTIFICATIONS (CDC §24)
   * ========================================================== */

  adminRouter.get("/notifications", (req, res) => {
    try {
      const accountId = Number(req.query.account_id);
      if (!Number.isSafeInteger(accountId) || accountId < 1) {
        // Sans compte ciblé, on renvoie une vue vide (le front s'y attend).
        return res.json({ notifications: [], unread: 0 });
      }
      const notifications = repository.listNotifications(accountId, {
        unreadOnly: req.query.unread === "true",
        limit: req.query.limit ? Math.min(Number(req.query.limit), 100) : 50
      });
      const unread = notifications.filter((n) => !n.read_at).length;
      res.json({ notifications, unread });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  adminRouter.post("/notifications/mark-read", (req, res) => {
    try {
      const accountId = Number(req.body.account_id);
      if (!Number.isSafeInteger(accountId) || accountId < 1) {
        throw new Error("Compte cible requis.");
      }
      const ids = Array.isArray(req.body.ids) ? req.body.ids.map(Number) : null;
      const changed = repository.markNotificationsRead(accountId, ids);
      res.json({ changed });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  /* ==========================================================
   * PARAMÈTRES ANALYSE IA (CDC §16, §17, §30)
   * ========================================================== */

  const DEFAULT_AI_SETTINGS = {
    criteria: { technical: "", communication: "", experience: "", clarify: "" },
    options: { summaryOnly: true, requireHumanReview: true, hideIrrelevant: true }
  };

  adminRouter.get("/parametres/analyse-ia", (req, res) => {
    try {
      ensureSettingsTable(repository.db);
      const row = repository.db.prepare("SELECT value_json FROM recruitment_settings WHERE key = ?").get("ai_criteria");
      const settings = row ? JSON.parse(row.value_json) : DEFAULT_AI_SETTINGS;
      res.json({ parametres: settings });
    } catch (error) {
      res.status(500).json({ error: clientError(error) });
    }
  });

  adminRouter.patch("/parametres/analyse-ia", (req, res) => {
    try {
      ensureSettingsTable(repository.db);
      const body = req.body || {};
      const criteria = {};
      for (const key of ["technical", "communication", "experience", "clarify"]) {
        criteria[key] = body.criteria?.[key] !== undefined
          ? cleanString(body.criteria[key], 500)
          : "";
      }
      const options = {
        summaryOnly: Boolean(body.options?.summaryOnly ?? true),
        requireHumanReview: Boolean(body.options?.requireHumanReview ?? true),
        hideIrrelevant: Boolean(body.options?.hideIrrelevant ?? true)
      };
      const value = JSON.stringify({ criteria, options });
      repository.db.prepare(`
        INSERT INTO recruitment_settings (key, value_json) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = datetime('now')
      `).run("ai_criteria", value);
      repository.recordEvent(null, "ai_criteria_updated", adminActor(req));
      res.json({ parametres: { criteria, options } });
    } catch (error) {
      res.status(400).json({ error: clientError(error) });
    }
  });

  return { adminRouter, publicRouter };
}

module.exports = { createRouters, validateJobPayload };