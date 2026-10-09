const path = require("node:path");
const dotenv = require("dotenv");
const { z } = require("zod");

const repositoryRoot = path.resolve(__dirname, "../../..");

/**
 * Loads the root .env file explicitly (never a nested one), without ever
 * overriding variables already set in the real process environment
 * (CI, containers, hosting platforms take priority).
 */
function loadEnvFile({ envPath = path.join(repositoryRoot, ".env"), env = process.env } = {}) {
  dotenv.config({ path: envPath, override: false, processEnv: env });
  return env;
}

function resolveFromRoot(value, fallback) {
  const raw = value || fallback;
  return path.isAbsolute(raw) ? raw : path.join(repositoryRoot, raw);
}

function isBase64Key32(value) {
  return typeof value === "string" &&
    /^[A-Za-z0-9+/]{43}=$/.test(value) &&
    Buffer.from(value, "base64").length === 32;
}

const base64Key = z.string().min(1, "obligatoire").refine(isBase64Key32, {
  message: "doit être 32 octets encodés en base64 (ex: openssl rand -base64 32)"
});

const positiveInt = z.coerce.number().int().positive();
const oneProxyHop = z.coerce.number().int().refine((value) => value === 1, {
  message: "le vhost nginx impose une seule passerelle de confiance"
});

/**
 * Fields required in every mode (development, test, production): the
 * recruitment module cannot run safely without them, even locally.
 */
const alwaysRequiredSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: positiveInt.default(3111),
  LISTEN_HOST: z.enum(["127.0.0.1", "0.0.0.0"]).default("127.0.0.1"),
  DB_PATH: z.string().min(1).default("./demo/data/recruitment.sqlite"),
  RECRUITMENT_STORAGE_DIR: z.string().min(1).default("./demo/storage/recruitment"),
  RECRUITMENT_RETENTION_DAYS: positiveInt.default(180),
  RECRUITMENT_MAX_FILE_MB: positiveInt.default(10),
  PRIVACY_CONTACT_EMAIL: z.string().email("doit être une adresse email valide"),
  OPENAI_MODEL: z.string().min(1).default("gpt-5.4-nano-2026-03-17"),
  OPENAI_TIMEOUT_MS: positiveInt.default(45000),
  SMTP_PORT: positiveInt.default(465),
  SMTP_SECURE: z.coerce.boolean().default(true),
  // The supplied production vhosts are the sole reverse-proxy hop. Limiting
  // this to one prevents a client-provided X-Forwarded-For chain being trusted.
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(1).default(0)
});

/**
 * Fields only required when NODE_ENV === "production". In development/test the
 * recruitment demo server supplies its own deterministic AI service and a
 * jsonTransport mailer, so these can stay empty locally without risk.
 */
const productionOnlySchema = z.object({
  RECRUITMENT_FILE_KEY: base64Key,
  OPENAI_API_KEY: z.string().min(1, "obligatoire en production"),
  TURNSTILE_SECRET_KEY: z.string().min(1, "obligatoire en production"),
  VITE_TURNSTILE_SITE_KEY: z.string().min(1, "obligatoire en production"),
  SMTP_HOST: z.string().min(1, "obligatoire en production"),
  SMTP_USER: z.string().min(1, "obligatoire en production"),
  SMTP_PASS: z.string().min(1, "obligatoire en production"),
  RECRUITMENT_HOST_ADAPTER: z.string().min(1, "obligatoire en production"),
  TRUST_PROXY_HOPS: oneProxyHop
});

// This is deliberately narrower than productionOnlySchema. The isolated
// acceptance portal uses deterministic analysis and a non-delivering mail
// transport, so it must not need or read third-party production credentials.
const isolatedTestProductionSchema = z.object({
  RECRUITMENT_FILE_KEY: base64Key,
  TURNSTILE_SECRET_KEY: z.string().min(1, "obligatoire en production"),
  VITE_TURNSTILE_SITE_KEY: z.string().min(1, "obligatoire en production"),
  RECRUITMENT_HOST_ADAPTER: z.string().min(1, "obligatoire en production"),
  OPENAI_API_KEY: z.string().optional().default(""),
  SMTP_HOST: z.string().optional().default("localhost"),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  TRUST_PROXY_HOPS: oneProxyHop
});

/**
 * Portail candidat, rôles RH et notifications (CDC §7-8, §24). Tout est optionnel :
 * les valeurs par défaut sont sûres (cookie Secure en production, pas d'email d'accusé).
 */
const trueFalse = z.enum(["true", "false"]);
const portalSchema = z.object({
  RECRUITMENT_PUBLIC_BASE_URL: z.string().url("doit être une URL absolue (ex: https://recrutement.techzone.lat)").optional().or(z.literal("")).default(""),
  RECRUITMENT_COOKIE_SECURE: trueFalse.optional(),
  RECRUITMENT_SESSION_TTL_HOURS: positiveInt.default(168),
  RECRUITMENT_AUTH_RATE_LIMIT: positiveInt.default(20),
  RECRUITMENT_ADMIN_EMAILS: z.string().default(""),
  RECRUITMENT_ACK_EMAIL: trueFalse.default("true"),
  RECRUITMENT_TIMEZONE: z.string().min(1).default("Indian/Antananarivo")
});

const testDeploymentSchema = z.object({
  RECRUITMENT_TEST_DEPLOYMENT: z.enum(["true", "false"]).default("false"),
  RECRUITMENT_TEST_PORTAL: z.enum(["true", "false"]).default("false")
});

const turnstileTestKeys = {
  site: "1x00000000000000000000AA",
  secret: "1x0000000000000000000000000000000AA"
};
const testOrigin = "https://recrutement.techzone.lat";

/**
 * Same fields as production, but optional/defaulted for local use.
 */
const nonProductionOptionalSchema = z.object({
  RECRUITMENT_FILE_KEY: z
    .string()
    .optional()
    .transform((value) => value || Buffer.alloc(32, 7).toString("base64")),
  OPENAI_API_KEY: z.string().optional().default(""),
  TURNSTILE_SECRET_KEY: z.string().optional().default(""),
  VITE_TURNSTILE_SITE_KEY: z.string().optional().default(""),
  SMTP_HOST: z.string().optional().default("localhost"),
  SMTP_USER: z.string().optional().default(""),
  SMTP_PASS: z.string().optional().default(""),
  RECRUITMENT_HOST_ADAPTER: z.string().optional().default("")
});

class ConfigValidationError extends Error {
  constructor(issues) {
    const details = issues.map((issue) => `  - ${issue.path.join(".") || "(racine)"}: ${issue.message}`).join("\n");
    super(`Configuration invalide, arrêt avant écoute réseau:\n${details}`);
    this.name = "ConfigValidationError";
    this.issues = issues;
  }
}

/**
 * Validates process environment variables and returns a typed, resolved
 * config object. Throws ConfigValidationError (never logs raw values) on any
 * missing or malformed required variable. Must be called, and must succeed,
 * before the HTTP server starts listening.
 */
function loadConfig({ env = process.env } = {}) {
  const baseResult = alwaysRequiredSchema.safeParse(env);
  if (!baseResult.success) {
    throw new ConfigValidationError(baseResult.error.issues);
  }

  const isProduction = baseResult.data.NODE_ENV === "production";
  const testDeploymentRequested = env.RECRUITMENT_TEST_DEPLOYMENT === "true";
  const conditionalSchema = isProduction
    ? (testDeploymentRequested ? isolatedTestProductionSchema : productionOnlySchema)
    : nonProductionOptionalSchema;
  const conditionalResult = conditionalSchema.safeParse(env);
  if (!conditionalResult.success) {
    throw new ConfigValidationError(conditionalResult.error.issues);
  }

  const portalResult = portalSchema.safeParse(env);
  if (!portalResult.success) {
    throw new ConfigValidationError(portalResult.error.issues);
  }
  const portalEnv = portalResult.data;
  const adminEmails = portalEnv.RECRUITMENT_ADMIN_EMAILS.split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  const invalidAdmin = adminEmails.find((value) => !/^\S+@\S+\.\S+$/.test(value));
  if (invalidAdmin) {
    throw new ConfigValidationError([{ path: ["RECRUITMENT_ADMIN_EMAILS"], message: "contient une adresse email invalide" }]);
  }

  const merged = { ...baseResult.data, ...conditionalResult.data };
  const testDeploymentResult = testDeploymentSchema.safeParse(env);
  if (!testDeploymentResult.success) {
    throw new ConfigValidationError(testDeploymentResult.error.issues);
  }
  const isTestDeployment = testDeploymentResult.data.RECRUITMENT_TEST_DEPLOYMENT === "true";
  const servesTestPortal = testDeploymentResult.data.RECRUITMENT_TEST_PORTAL === "true";

  if (isTestDeployment) {
    const testDeploymentIssues = [];
    if (!isProduction) testDeploymentIssues.push({ path: ["RECRUITMENT_TEST_DEPLOYMENT"], message: "requiert NODE_ENV=production" });
    if (!servesTestPortal) testDeploymentIssues.push({ path: ["RECRUITMENT_TEST_PORTAL"], message: "doit être activé pour la recette isolée" });
    if (merged.TURNSTILE_SECRET_KEY !== turnstileTestKeys.secret) testDeploymentIssues.push({ path: ["TURNSTILE_SECRET_KEY"], message: "doit utiliser la clé secrète de test Turnstile" });
    if (merged.VITE_TURNSTILE_SITE_KEY !== turnstileTestKeys.site) testDeploymentIssues.push({ path: ["VITE_TURNSTILE_SITE_KEY"], message: "doit utiliser la clé de site de test Turnstile" });
    if (env.CORS_ORIGIN !== testOrigin || env.ADMIN_ORIGIN !== testOrigin) {
      testDeploymentIssues.push({ path: ["CORS_ORIGIN"], message: "et ADMIN_ORIGIN doivent cibler recrutement.techzone.lat" });
    }
    if (env.SESSION_COOKIE_NAME !== "techzone_recruitment_test_session") {
      testDeploymentIssues.push({ path: ["SESSION_COOKIE_NAME"], message: "doit isoler le cookie de recette" });
    }
    if (testDeploymentIssues.length) throw new ConfigValidationError(testDeploymentIssues);
  } else if (servesTestPortal) {
    throw new ConfigValidationError([{ path: ["RECRUITMENT_TEST_PORTAL"], message: "nécessite RECRUITMENT_TEST_DEPLOYMENT=true" }]);
  }

  return {
    nodeEnv: merged.NODE_ENV,
    isProduction,
    port: merged.PORT,
    listenHost: merged.LISTEN_HOST,
    trustProxyHops: merged.TRUST_PROXY_HOPS,
    dbPath: resolveFromRoot(env.DB_PATH, merged.DB_PATH),
    storageDir: resolveFromRoot(env.RECRUITMENT_STORAGE_DIR, merged.RECRUITMENT_STORAGE_DIR),
    fileKey: merged.RECRUITMENT_FILE_KEY,
    retentionDays: merged.RECRUITMENT_RETENTION_DAYS,
    maxFileMb: merged.RECRUITMENT_MAX_FILE_MB,
    privacyContactEmail: merged.PRIVACY_CONTACT_EMAIL,
    openai: {
      apiKey: merged.OPENAI_API_KEY,
      model: merged.OPENAI_MODEL,
      timeoutMs: merged.OPENAI_TIMEOUT_MS
    },
    turnstile: {
      secretKey: merged.TURNSTILE_SECRET_KEY,
      siteKey: merged.VITE_TURNSTILE_SITE_KEY,
      // Bypassing Turnstile is only ever safe outside production, and only
      // ever wired up by the demo server — never by this config module.
      bypassAllowed: !isProduction
    },
    isTestDeployment,
    servesTestPortal,
    smtp: {
      host: merged.SMTP_HOST,
      port: merged.SMTP_PORT,
      secure: merged.SMTP_SECURE,
      user: merged.SMTP_USER,
      pass: merged.SMTP_PASS,
      from: env.SMTP_FROM || "TECH ZONE Recrutement <contact@techzone.lat>"
    },
    hostAdapterPath: merged.RECRUITMENT_HOST_ADAPTER,
    portal: {
      publicBaseUrl: portalEnv.RECRUITMENT_PUBLIC_BASE_URL,
      // Cookie de session candidat : Secure par défaut en production uniquement.
      cookieSecure: portalEnv.RECRUITMENT_COOKIE_SECURE ? portalEnv.RECRUITMENT_COOKIE_SECURE === "true" : isProduction,
      sessionTtlHours: portalEnv.RECRUITMENT_SESSION_TTL_HOURS,
      authRateLimit: portalEnv.RECRUITMENT_AUTH_RATE_LIMIT,
      adminEmails,
      acknowledgementEmail: portalEnv.RECRUITMENT_ACK_EMAIL === "true",
      timezone: portalEnv.RECRUITMENT_TIMEZONE
    }
  };
}

module.exports = { loadConfig, loadEnvFile, ConfigValidationError, isBase64Key32, repositoryRoot };
