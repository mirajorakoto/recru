const assert = require("node:assert/strict");
const { once } = require("node:events");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");
const { createRecruitmentModule } = require("../src");
const { loadHostAdapter, validateHostAdapter } = require("../src/host-adapter");

const adapter = {
  db: { prepare() {}, pragma() {} },
  sessionMiddleware(req, res, next) { next(); },
  requireAdminOrigin(req, res, next) { next(); },
  requireAdminSession() {}
};

test("a host adapter must expose the shared database and session middleware", () => {
  assert.equal(validateHostAdapter(adapter), adapter);
  assert.throws(() => validateHostAdapter({}), /connexion SQLite partagée/);
  assert.throws(() => validateHostAdapter({ db: adapter.db }), /sessionMiddleware/);
  assert.throws(() => validateHostAdapter({ db: adapter.db, sessionMiddleware: adapter.sessionMiddleware }), /requireAdminOrigin/);
  assert.throws(() => validateHostAdapter({ db: adapter.db, sessionMiddleware: adapter.sessionMiddleware, requireAdminOrigin: adapter.requireAdminOrigin }), /requireAdminSession/);
});

test("a missing or unresolvable host adapter fails before the production server listens", () => {
  assert.throws(() => loadHostAdapter(""), /RECRUITMENT_HOST_ADAPTER/);
  assert.throws(() => loadHostAdapter("/does/not/exist.cjs"), /Impossible de charger/);
});

test("the deployment mount exposes the host shared module read-only", () => {
  const compose = fs.readFileSync(path.resolve(__dirname, "../../..", "docker-compose.yml"), "utf8");
  assert.match(compose, /TECHZONE_HOST_SHARED_ROOT[^\n]*:\/opt\/techzone\/shared:ro/);
});

test("the embedded module rejects malformed host integrations before it migrates", () => {
  const base = {
    db: adapter.db,
    requireAdminSession: adapter.requireAdminSession,
    transporter: { sendMail() {} },
    config: { storageDir: "/tmp/recruitment-test" }
  };

  assert.throws(() => createRecruitmentModule({ ...base, db: {} }), /shared better-sqlite3/);
  assert.throws(() => createRecruitmentModule({ ...base, requireAdminSession: true }), /requireAdminSession/);
  assert.throws(() => createRecruitmentModule({ ...base, transporter: {} }), /SMTP transporter/);
});

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForHealth(port, process) {
  // Le sous-processus lance un vrai serveur de production (chargement du
  // binaire natif better-sqlite3, migrations, Express) : sur une machine
  // lente ou sous antivirus (ex. Windows Defender scannant un binaire natif
  // fraîchement installé), le démarrage peut dépasser une seconde. Ce budget
  // reste sous le timeout du test (10 s) pour laisser de la marge au reste
  // des assertions.
  for (let attempt = 0; attempt < 180; attempt += 1) {
    if (process.exitCode !== null) throw new Error("Le point d'entrée de production s'est arrêté prématurément.");
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (response.ok) return response;
    } catch {
      // The process has not finished binding its loopback socket yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Le point d'entrée de production n'a pas répondu au health check.");
}

test("the production entrypoint starts through a host adapter and rejects anonymous RH access", { timeout: 10_000 }, async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "techzone-production-smoke-"));
  const dbPath = path.join(root, "host.sqlite");
  const adapterPath = path.join(root, "host-adapter.cjs");
  const port = await reserveLoopbackPort();
  const databaseModule = require.resolve("better-sqlite3");
  fs.writeFileSync(adapterPath, [
    `const Database = require(${JSON.stringify(databaseModule)});`,
    `const db = new Database(${JSON.stringify(dbPath)});`,
    "db.pragma('foreign_keys = ON');",
    "module.exports = {",
    "  db,",
    "  sessionMiddleware: (_req, _res, next) => next(),",
    "  requireAdminOrigin: (_req, _res, next) => next(),",
    "  requireAdminSession: (_req, res) => res.status(401).json({ error: 'Session RH requise.' }),",
    "  close: () => db.close()",
    "};"
  ].join("\n"));
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve(__dirname, ".."),
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      DB_PATH: dbPath,
      RECRUITMENT_STORAGE_DIR: path.join(root, "encrypted-files"),
      RECRUITMENT_FILE_KEY: Buffer.alloc(32, 4).toString("base64"),
      OPENAI_API_KEY: "fixture-openai-key",
      TURNSTILE_SECRET_KEY: "fixture-turnstile-key",
      VITE_TURNSTILE_SITE_KEY: "fixture-turnstile-site-key",
      SMTP_HOST: "smtp.example.test",
      SMTP_PORT: "587",
      SMTP_SECURE: "false",
      SMTP_USER: "fixture-user",
      SMTP_PASS: "fixture-password",
      TRUST_PROXY_HOPS: "1",
      SMTP_FROM: "TECH ZONE Fixture <fixture@example.test>",
      PRIVACY_CONTACT_EMAIL: "privacy@example.test",
      RECRUITMENT_HOST_ADAPTER: adapterPath
    },
    stdio: "ignore"
  });
  t.after(async () => {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
    fs.rmSync(root, { recursive: true, force: true });
  });

  const health = await waitForHealth(port, child);
  assert.deepEqual(await health.json(), { ok: true, mode: "recruitment-production" });
  assert.equal(health.headers.get("x-powered-by"), null);
  assert.equal(health.headers.get("x-content-type-options"), "nosniff");
  assert.equal(health.headers.get("x-frame-options"), "DENY");
  const anonymous = await fetch(`http://127.0.0.1:${port}/api/admin/recrutement/offres`);
  assert.equal(anonymous.status, 401);
  const missingApi = await fetch(`http://127.0.0.1:${port}/api/inconnue`);
  assert.equal(missingApi.status, 404);
  assert.deepEqual(await missingApi.json(), { error: "Route API introuvable." });
});
