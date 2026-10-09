// Copy this file outside Git, then configure RECRUITMENT_HOST_ADAPTER with its
// in-container path. It reuses the host's SQLite session store and guards.
const path = require("node:path");

const hostBackendRoot = process.env.TECHZONE_HOST_BACKEND_ROOT || "/opt/techzone/host-backend";
const fromHost = (...parts) => require(path.join(hostBackendRoot, ...parts));
const session = require(path.join(hostBackendRoot, "node_modules/express-session"));
const { SqliteSessionStore } = fromHost("src/auth/sqliteSessionStore");
const { getEnv } = fromHost("src/config");
const { getDb } = fromHost("src/db/connection");
const { requireAdminSession, requireTrustedAdminOrigin } = fromHost("src/middleware/adminAuth");
const { verifyPassword } = fromHost("src/auth/password");
const { findAdminUserByEmail, sanitizeAdminUser } = fromHost("src/db/repository");
const { adminLoginRateLimiter } = fromHost("src/middleware/rateLimiter");

const env = getEnv();
if (env.isProduction && !process.env.SESSION_SECRET) {
  throw new Error("SESSION_SECRET est obligatoire pour réutiliser la session hôte.");
}

const sessionMiddleware = session({
  name: env.sessionCookieName,
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store: new SqliteSessionStore(),
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: env.isProduction,
    maxAge: env.adminSessionTtlMs
  }
});

const db = getDb();
// Avoid immediate SQLITE_BUSY failures while the existing host is writing.
db.pragma("busy_timeout = 5000");

module.exports = {
  db,
  sessionMiddleware,
  requireAdminOrigin: requireTrustedAdminOrigin(env.allowedOrigins),
  requireAdminSession,
  // Used only by the isolated test portal. It validates an existing TechZone
  // administrator and still creates the session through the host store.
  authenticateAdmin({ email, password }) {
    const user = findAdminUserByEmail(email);
    if (!user || !user.actif || !verifyPassword(password, user.password_hash)) return null;
    return sanitizeAdminUser(user);
  },
  adminLoginRateLimiter
};
