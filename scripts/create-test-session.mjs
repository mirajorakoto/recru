import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import dotenv from "dotenv";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");
const signature = require("cookie-signature");
const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, process.env.RECRUITMENT_DEPLOY_ENV || "deployment/recruitment.test.env");
const composePath = resolve(root, process.env.RECRUITMENT_COMPOSE_ENV || "deployment/compose.env");
const receiptPath = resolve(root, "deployment/private/recruitment-test-session.json");
const testAdminEmail = "recrutement-test-session@techzone.invalid";

function fail(message) {
  console.error("Session de recette non créée : " + message);
  process.exit(1);
}

if (!existsSync(envPath) || !existsSync(composePath)) fail("fichiers de recette introuvables.");
const env = dotenv.parse(readFileSync(envPath));
const compose = dotenv.parse(readFileSync(composePath));
if (env.RECRUITMENT_TEST_DEPLOYMENT !== "true" || env.RECRUITMENT_TEST_PORTAL !== "true") {
  fail("le fichier de recette isolée est requis.");
}
if (!env.SESSION_SECRET || env.SESSION_COOKIE_NAME !== "techzone_recruitment_test_session") {
  fail("la session ou le cookie de recette est invalide.");
}
if (!env.DB_PATH?.startsWith("/opt/techzone/host-backend/db/")) fail("chemin SQLite conteneur invalide.");
const databaseName = env.DB_PATH.slice("/opt/techzone/host-backend/db/".length);
if (!databaseName || databaseName.includes("/")) fail("nom de base SQLite invalide.");
const dbPath = resolve(compose.TECHZONE_HOST_DB_DIRECTORY || "", databaseName);
if (!existsSync(dbPath)) fail("base SQLite hôte introuvable.");

const db = new Database(dbPath);
try {
  let admin = db.prepare("SELECT id FROM admin_users WHERE actif = 1 ORDER BY id LIMIT 1").get();
  if (!admin) {
    const timestamp = new Date().toISOString().slice(0, 19).replace("T", " ");
    // This account is only a session anchor. Its random non-login password is
    // never displayed and cleanup removes it with the temporary session.
    db.prepare(
      "INSERT INTO admin_users (email, password_hash, display_name, actif, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)"
    ).run(testAdminEmail, "temporary-" + randomBytes(32).toString("hex"), "RH recette temporaire", timestamp, timestamp);
    admin = db.prepare("SELECT id FROM admin_users WHERE email = ?").get(testAdminEmail);
  }
  const now = Date.now();
  const expiresAt = new Date(now + 2 * 60 * 60 * 1000);
  const sid = "recruitment-test-" + randomUUID();
  const session = {
    cookie: {
      originalMaxAge: 2 * 60 * 60 * 1000,
      expires: expiresAt.toISOString(),
      secure: true,
      httpOnly: true,
      path: "/",
      sameSite: "strict"
    },
    adminUserId: admin.id
  };
  // Remove only prior temporary sessions created by this tool, never host sessions.
  db.prepare("DELETE FROM admin_sessions WHERE sid LIKE 'recruitment-test-%'").run();
  db.prepare("INSERT INTO admin_sessions (sid, sess, expired_at) VALUES (?, ?, ?)").run(
    sid,
    JSON.stringify(session),
    expiresAt.toISOString().slice(0, 19).replace("T", " ")
  );
  const signed = encodeURIComponent("s:" + signature.sign(sid, env.SESSION_SECRET));
  writeFileSync(receiptPath, JSON.stringify({
    expiresAt: expiresAt.toISOString(),
    domain: "recrutement.techzone.lat",
    cookieName: env.SESSION_COOKIE_NAME,
    cookieValue: signed,
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "Strict"
  }, null, 2) + "\n", { mode: 0o600 });
  chmodSync(receiptPath, 0o600);
  console.log("Session RH temporaire créée (expiration dans deux heures).");
  console.log("Le cookie est conservé uniquement dans deployment/private/recruitment-test-session.json (0600).");
} finally {
  db.close();
}
