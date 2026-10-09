import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { connect } from "node:tls";
import dotenv from "dotenv";

const root = resolve(import.meta.dirname, "..");
const recruitmentEnvPath = process.env.RECRUITMENT_DEPLOY_ENV || resolve(root, "deployment/recruitment.env");
const errors = [];

function readOrigins(env) {
  const rawOrigins = [env.CORS_ORIGIN, env.ADMIN_ORIGIN]
    .flatMap((value) => String(value || "").split(","))
    .map((value) => value.trim())
    .filter(Boolean);

  return [...new Set(rawOrigins)];
}

function parseHttpsOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error();
    return url;
  } catch {
    errors.push("L'origine publique doit être une origine HTTPS simple.");
    return null;
  }
}

function verifyTls(url) {
  return new Promise((resolveCheck) => {
    const socket = connect({
      host: url.hostname,
      port: Number(url.port || 443),
      servername: url.hostname,
      rejectUnauthorized: true,
      timeout: 10_000
    });
    const fail = () => {
      socket.destroy();
      errors.push("Le certificat TLS de " + url.host + " ne peut pas être validé.");
      resolveCheck();
    };
    socket.once("error", fail);
    socket.once("timeout", fail);
    socket.once("secureConnect", () => {
      socket.end();
      resolveCheck();
    });
  });
}

if (!existsSync(recruitmentEnvPath)) {
  errors.push("deployment/recruitment.env est absent.");
} else {
  const env = dotenv.parse(readFileSync(recruitmentEnvPath));
  const origins = readOrigins(env);
  if (!origins.length) {
    errors.push("deployment/recruitment.env ne définit aucune origine publique.");
  } else {
    await Promise.all(origins.map((origin) => {
      const url = parseHttpsOrigin(origin);
      return url ? verifyTls(url) : Promise.resolve();
    }));
  }
}

if (errors.length) {
  console.error("Contrôle externe de déploiement en échec :");
  for (const error of errors) console.error("- " + error);
  process.exitCode = 1;
} else {
  console.log("Contrôle externe de déploiement OK : certificats TLS valides.");
}
