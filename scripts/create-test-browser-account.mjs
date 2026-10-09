import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import dotenv from "dotenv";

const require = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, "..");
const compose = dotenv.parse(readFileSync(resolve(root, "deployment/compose.env")));
const envPath = resolve(root, process.env.RECRUITMENT_DEPLOY_ENV || "deployment/recruitment.test.env");
const receiptPath = resolve(root, "deployment/private/recruitment-browser-test-account.json");
const markdownPath = resolve(root, "deployment/private/identifiants-recette.md");
const email = "recrutement-browser-test@techzone.invalid";

function fail(message) {
  console.error("Compte navigateur de recette non créé : " + message);
  process.exit(1);
}

if (!existsSync(envPath) || !compose.TECHZONE_HOST_BACKEND_ROOT || !compose.TECHZONE_HOST_DB_DIRECTORY) {
  fail("configuration de recette ou hôte introuvable.");
}
const env = dotenv.parse(readFileSync(envPath));
if (env.RECRUITMENT_TEST_DEPLOYMENT !== "true") fail("environnement isolé requis.");

const dbPath = resolve(compose.TECHZONE_HOST_DB_DIRECTORY, "techzone.sqlite");
if (!existsSync(dbPath)) fail("base SQLite hôte introuvable.");
const Database = require("better-sqlite3");
const { hashPassword } = require(resolve(compose.TECHZONE_HOST_BACKEND_ROOT, "src/auth/password"));
const db = new Database(dbPath);
try {
  const password = randomBytes(24).toString("base64url");
  const now = new Date().toISOString().slice(0, 19).replace("T", " ");
  db.prepare("DELETE FROM admin_users WHERE email = ?").run(email);
  db.prepare("INSERT INTO admin_users (email, password_hash, display_name, actif, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)")
    .run(email, hashPassword(password), "RH recette navigateur", now, now);
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  writeFileSync(receiptPath, JSON.stringify({ email, password, expiresAt }, null, 2) + "\n", { mode: 0o600 });
  chmodSync(receiptPath, 0o600);
  writeFileSync(markdownPath, `# Identifiants de recette — recrutement.techzone.lat\n\nRoute : \`https://recrutement.techzone.lat/admin/recrutement\`\n\n| Email | Mot de passe | Expiration |\n| --- | --- | --- |\n| \`${email}\` | \`${password}\` | ${expiresAt} |\n\nCe fichier privé est renouvelé par \`npm run deployment:test:browser-account\`.\n`, { mode: 0o600 });
  chmodSync(markdownPath, 0o600);
  console.log("Compte RH navigateur créé ; identifiants conservés uniquement dans deployment/private (0600).");
} finally {
  db.close();
}
