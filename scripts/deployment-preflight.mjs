import { statSync, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import dotenv from "dotenv";

const require = createRequire(import.meta.url);
const { loadConfig } = require("../packages/backend/src/config");
const Database = require("better-sqlite3");

const root = resolve(import.meta.dirname, "..");
const containerDbDirectory = "/opt/techzone/host-backend/db/";
const recruitmentEnvPath = process.env.RECRUITMENT_DEPLOY_ENV || resolve(root, "deployment/recruitment.env");
const composeEnvPath = process.env.RECRUITMENT_COMPOSE_ENV || resolve(root, "deployment/compose.env");
const composeFilePath = process.env.RECRUITMENT_COMPOSE_FILE || resolve(root, "docker-compose.yml");
const composeProject = process.env.RECRUITMENT_COMPOSE_PROJECT || "";
const isTestDeployment = process.env.RECRUITMENT_TEST_DEPLOYMENT === "true";
const hostPortKey = isTestDeployment ? "RECRUITMENT_TEST_HOST_PORT" : "RECRUITMENT_HOST_PORT";
const requiredRecruitmentKeys = [
  "NODE_ENV", "PORT", "DB_PATH", "RECRUITMENT_STORAGE_DIR",
  "RECRUITMENT_FILE_KEY", "RECRUITMENT_RETENTION_DAYS", "RECRUITMENT_MAX_FILE_MB",
  "OPENAI_API_KEY", "TURNSTILE_SECRET_KEY", "VITE_TURNSTILE_SITE_KEY",
  "SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASS", "SMTP_FROM",
  "PRIVACY_CONTACT_EMAIL", "RECRUITMENT_HOST_ADAPTER", "SESSION_SECRET", "TRUST_PROXY_HOPS"
];
const requiredTestRecruitmentKeys = [
  "NODE_ENV", "PORT", "DB_PATH", "RECRUITMENT_STORAGE_DIR",
  "RECRUITMENT_FILE_KEY", "RECRUITMENT_RETENTION_DAYS", "RECRUITMENT_MAX_FILE_MB",
  "TURNSTILE_SECRET_KEY", "VITE_TURNSTILE_SITE_KEY", "PRIVACY_CONTACT_EMAIL",
  "RECRUITMENT_HOST_ADAPTER", "SESSION_SECRET", "RECRUITMENT_TEST_DEPLOYMENT",
  "RECRUITMENT_TEST_PORTAL", "SESSION_COOKIE_NAME", "CORS_ORIGIN", "ADMIN_ORIGIN", "TRUST_PROXY_HOPS"
];
const requiredComposeKeys = [
  "TECHZONE_HOST_BACKEND_ROOT", "TECHZONE_HOST_SHARED_ROOT", "TECHZONE_HOST_DB_DIRECTORY", "RECRUITMENT_HOST_ADAPTER_SOURCE", hostPortKey
];
const errors = [];

function readPrivateEnv(filePath, label) {
  if (!existsSync(filePath)) {
    errors.push(label + " absent : " + filePath);
    return null;
  }
  const mode = statSync(filePath).mode & 0o777;
  if ((mode & 0o077) !== 0) errors.push(label + " doit être en mode 0600.");
  return dotenv.parse(readFileSync(filePath));
}

function requireKeys(env, keys, label) {
  for (const key of keys) {
    if (!env[key]?.trim()) errors.push(label + " : variable obligatoire absente (" + key + ").");
  }
}

function checkLoopbackPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => {
      if (!isExpectedComposePortBound(port)) {
        errors.push("deployment/compose.env : " + hostPortKey + " est déjà utilisé sur 127.0.0.1.");
      }
      resolve();
    });
    server.listen(port, "127.0.0.1", () => {
      server.close(() => resolve());
    });
  });
}

function composeArgs(command) {
  return ["compose", "--env-file", composeEnvPath, "-f", composeFilePath, ...(composeProject ? ["-p", composeProject] : []), ...command];
}

function isExpectedComposePortBound(port) {
  const containers = spawnSync("docker", composeArgs(["ps", "-q"]), { cwd: root, encoding: "utf8", timeout: 10_000 });
  if (containers.error || containers.status !== 0) return false;
  for (const id of containers.stdout.split(/\s+/).filter(Boolean)) {
    const inspect = spawnSync("docker", ["inspect", "--format", "{{json .NetworkSettings.Ports}}", id], {
      cwd: root,
      encoding: "utf8",
      timeout: 10_000
    });
    if (inspect.error || inspect.status !== 0) continue;
    try {
      const bindings = JSON.parse(inspect.stdout);
      if (bindings?.["3111/tcp"]?.some((binding) => binding.HostIp === "127.0.0.1" && binding.HostPort === String(port))) {
        return true;
      }
    } catch {
      // An unexpected Docker inspection result must not make the port safe.
    }
  }
  return false;
}

function checkPrivateFile(filePath, key) {
  if (!existsSync(filePath)) {
    errors.push("deployment/compose.env : le montage " + key + " est introuvable.");
    return;
  }
  const stat = statSync(filePath);
  if (!stat.isFile()) {
    errors.push("deployment/compose.env : le montage " + key + " doit être un fichier.");
    return;
  }
  if ((stat.mode & 0o077) !== 0) {
    errors.push("deployment/compose.env : le montage " + key + " doit être en mode 0600.");
  }
}

function checkDirectory(filePath, key) {
  if (!existsSync(filePath)) {
    errors.push("deployment/compose.env : le montage " + key + " est introuvable.");
    return;
  }
  if (!statSync(filePath).isDirectory()) {
    errors.push("deployment/compose.env : le montage " + key + " doit être un répertoire.");
  }
}

function checkComposeConfig() {
  const result = spawnSync("docker", composeArgs(["config", "--quiet"]), {
    cwd: root,
    stdio: "pipe",
    timeout: 10_000
  });
  if (result.error || result.status !== 0) {
    errors.push("Docker Compose ne peut pas valider la configuration de déploiement.");
  }
}

function checkServerConfig(env) {
  try {
    loadConfig({ env });
  } catch (error) {
    const invalidKeys = error.issues
      ?.map((issue) => issue.path.join("."))
      .filter(Boolean);
    errors.push(
      "deployment/recruitment.env : configuration serveur invalide" +
      (invalidKeys?.length ? " (" + invalidKeys.join(", ") + ")." : ".")
    );
  }
}

function checkSharedSqlite(recruitmentEnv, composeEnv) {
  const databaseFileName = recruitmentEnv.DB_PATH?.startsWith(containerDbDirectory)
    ? recruitmentEnv.DB_PATH.slice(containerDbDirectory.length)
    : "";
  if (!databaseFileName || databaseFileName.includes("/")) return null;

  const hostDbPath = resolve(composeEnv.TECHZONE_HOST_DB_DIRECTORY, databaseFileName);
  if (!existsSync(hostDbPath) || !statSync(hostDbPath).isFile()) {
    errors.push("deployment/compose.env : la base SQLite partagée est introuvable.");
    return null;
  }
  if ((statSync(composeEnv.TECHZONE_HOST_DB_DIRECTORY).mode & 0o222) === 0) {
    errors.push("deployment/compose.env : le répertoire SQLite partagé doit être inscriptible.");
  }
  if ((statSync(hostDbPath).mode & 0o222) === 0) {
    errors.push("deployment/compose.env : la base SQLite partagée doit être inscriptible.");
  }
  return hostDbPath;
}

function checkHostSessionSchema(hostDbPath) {
  let db;
  try {
    db = new Database(hostDbPath, { readonly: true, fileMustExist: true });
    const names = new Set(db.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('admin_sessions', 'admin_users')"
    ).all().map((row) => row.name));
    for (const table of ["admin_sessions", "admin_users"]) {
      if (!names.has(table)) {
        errors.push("deployment/compose.env : la base hôte ne contient pas la table " + table + ".");
      }
    }
  } catch {
    errors.push("deployment/compose.env : le schéma SQLite hôte ne peut pas être vérifié en lecture seule.");
  } finally {
    db?.close();
  }
}

const recruitmentEnv = readPrivateEnv(recruitmentEnvPath, "deployment/recruitment.env");
if (recruitmentEnv) {
  const errorsBeforeValidation = errors.length;
  requireKeys(recruitmentEnv, isTestDeployment ? requiredTestRecruitmentKeys : requiredRecruitmentKeys, "deployment/recruitment.env");
  if (recruitmentEnv.NODE_ENV && recruitmentEnv.NODE_ENV !== "production") {
    errors.push("deployment/recruitment.env : NODE_ENV doit valoir production.");
  }
  if (recruitmentEnv.RECRUITMENT_HOST_ADAPTER && !recruitmentEnv.RECRUITMENT_HOST_ADAPTER.startsWith("/")) {
    errors.push("deployment/recruitment.env : RECRUITMENT_HOST_ADAPTER doit être un chemin absolu dans le conteneur.");
  }
  if (recruitmentEnv.DB_PATH && !recruitmentEnv.DB_PATH.startsWith("/opt/techzone/host-backend/db/")) {
    errors.push("deployment/recruitment.env : DB_PATH doit utiliser le montage SQLite privé du conteneur.");
  }
  if (errors.length === errorsBeforeValidation && recruitmentEnv.NODE_ENV === "production") {
    checkServerConfig(recruitmentEnv);
  }
}

const composeEnv = readPrivateEnv(composeEnvPath, "deployment/compose.env");
if (composeEnv) {
  requireKeys(composeEnv, requiredComposeKeys, "deployment/compose.env");
  if (composeEnv.TECHZONE_HOST_BACKEND_ROOT) checkDirectory(composeEnv.TECHZONE_HOST_BACKEND_ROOT, "TECHZONE_HOST_BACKEND_ROOT");
  if (composeEnv.TECHZONE_HOST_SHARED_ROOT) checkDirectory(composeEnv.TECHZONE_HOST_SHARED_ROOT, "TECHZONE_HOST_SHARED_ROOT");
  if (composeEnv.TECHZONE_HOST_DB_DIRECTORY) checkDirectory(composeEnv.TECHZONE_HOST_DB_DIRECTORY, "TECHZONE_HOST_DB_DIRECTORY");
  if (composeEnv.RECRUITMENT_HOST_ADAPTER_SOURCE) checkPrivateFile(composeEnv.RECRUITMENT_HOST_ADAPTER_SOURCE, "RECRUITMENT_HOST_ADAPTER_SOURCE");
  const port = Number(composeEnv[hostPortKey]);
  if (!Number.isSafeInteger(port) || port < 1024 || port > 65535) {
    errors.push("deployment/compose.env : " + hostPortKey + " doit être un port non privilégié valide.");
  } else {
    await checkLoopbackPort(port);
  }
  checkComposeConfig();
}

if (recruitmentEnv && composeEnv) {
  const hostDbPath = checkSharedSqlite(recruitmentEnv, composeEnv);
  if (hostDbPath) checkHostSessionSchema(hostDbPath);
}

if (errors.length) {
  console.error("Préflight déploiement en échec (aucune valeur sensible n'est affichée) :");
  for (const error of errors) console.error("- " + error);
  process.exitCode = 1;
} else {
  console.log("Préflight déploiement OK : fichiers privés, variables et montages présents.");
}
