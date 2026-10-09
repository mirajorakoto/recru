import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import dotenv from "dotenv";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, process.env.RECRUITMENT_DEPLOY_ENV || "deployment/recruitment.test.env");
const composePath = resolve(root, process.env.RECRUITMENT_COMPOSE_ENV || "deployment/compose.env");
const receiptPath = resolve(root, "deployment/private/recruitment-test-session.json");
const browserAccountReceiptPath = resolve(root, "deployment/private/recruitment-browser-test-account.json");
const browserAccountMarkdownPath = resolve(root, "deployment/private/identifiants-recette.md");

if (!existsSync(envPath) || !existsSync(composePath)) throw new Error("Fichiers de recette introuvables.");
const env = dotenv.parse(readFileSync(envPath));
const compose = dotenv.parse(readFileSync(composePath));
if (env.RECRUITMENT_TEST_DEPLOYMENT !== "true") throw new Error("Recette isolée requise.");
const databaseName = env.DB_PATH?.slice("/opt/techzone/host-backend/db/".length);
if (!databaseName || databaseName.includes("/")) throw new Error("Chemin SQLite de recette invalide.");
const db = new Database(resolve(compose.TECHZONE_HOST_DB_DIRECTORY || "", databaseName));
try {
  db.prepare("DELETE FROM admin_sessions WHERE sid LIKE 'recruitment-test-%'").run();
  db.prepare("DELETE FROM admin_users WHERE email = ?").run("recrutement-test-session@techzone.invalid");
  db.prepare("DELETE FROM admin_users WHERE email = ?").run("recrutement-browser-test@techzone.invalid");
} finally {
  db.close();
}
if (existsSync(receiptPath)) rmSync(receiptPath);
if (existsSync(browserAccountReceiptPath)) rmSync(browserAccountReceiptPath);
if (existsSync(browserAccountMarkdownPath)) rmSync(browserAccountMarkdownPath);
console.log("Session et compte RH temporaires de recette supprimés.");
