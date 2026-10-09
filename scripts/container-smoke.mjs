import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";

const image = "techzone-recrutement-backend:local";
const containerName = "techzone-recruitment-smoke-" + process.pid;
const fixtureDir = mkdtempSync(join(tmpdir(), "techzone-recruitment-container-"));

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) throw new Error(command + " " + (args[0] || "") + " a échoué.");
}

function verifyRuntimeImage() {
  const result = spawnSync("docker", [
    "run", "--rm", "--entrypoint", "sh", image, "-c",
    "test ! -d /app/node_modules/@playwright/test && test ! -d /app/node_modules/vitest && test ! -d /app/packages/backend/test && test ! -d /app/packages/backend/scripts"
  ], { stdio: "ignore" });
  if (result.status !== 0) {
    throw new Error("L'image runtime contient encore des outils ou scripts de test.");
  }
}

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

async function waitForHealth(port) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/api/health");
      if (response.ok) return response;
    } catch {
      // The isolated container is still binding its loopback port.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Le conteneur n'a pas répondu au health check.");
}

try {
  writeFileSync(join(fixtureDir, "host-adapter.cjs"), [
    'const Database = require("/app/node_modules/better-sqlite3");',
    'const db = new Database("/var/lib/techzone/host.sqlite");',
    'db.pragma("foreign_keys = ON");',
    "module.exports = {",
    "  db,",
    "  sessionMiddleware: (_req, _res, next) => next(),",
    "  requireAdminOrigin: (_req, _res, next) => next(),",
    '  requireAdminSession: (_req, res) => res.status(401).json({ error: "Session RH requise." }),',
    "  close: () => db.close()",
    "};"
  ].join("\n"));
  run("docker", ["version", "--format", "Docker {{.Server.Version}}"]);
  run("docker", ["compose", "--progress", "quiet", "--env-file", "deployment/compose.env.template", "build", "techzone-recruitment"]);
  verifyRuntimeImage();
  const port = await reserveLoopbackPort();
  run("docker", [
    "run", "--rm", "--detach", "--name", containerName,
    "--label", "techzone.recruitment.fixture=true",
    "--publish", "127.0.0.1:" + port + ":3111",
    "--mount", "type=bind,src=" + fixtureDir + ",dst=/opt/techzone/private,readonly",
    "--env", "NODE_ENV=production",
    "--env", "PORT=3111",
    "--env", "TRUST_PROXY_HOPS=1",
    "--env", "DB_PATH=/var/lib/techzone/host.sqlite",
    "--env", "RECRUITMENT_STORAGE_DIR=/var/lib/techzone/recruitment",
    "--env", "RECRUITMENT_FILE_KEY=" + Buffer.alloc(32, 4).toString("base64"),
    "--env", "OPENAI_API_KEY=fixture-openai-key",
    "--env", "TURNSTILE_SECRET_KEY=fixture-turnstile-key",
    "--env", "VITE_TURNSTILE_SITE_KEY=fixture-turnstile-site-key",
    "--env", "SMTP_HOST=smtp.example.test",
    "--env", "SMTP_PORT=587",
    "--env", "SMTP_SECURE=false",
    "--env", "SMTP_USER=fixture-user",
    "--env", "SMTP_PASS=fixture-password",
    "--env", "SMTP_FROM=TECH ZONE Fixture <fixture@example.test>",
    "--env", "PRIVACY_CONTACT_EMAIL=privacy@example.test",
    "--env", "RECRUITMENT_HOST_ADAPTER=/opt/techzone/private/host-adapter.cjs",
    image
  ]);
  const health = await waitForHealth(port);
  const body = await health.json();
  if (body.ok !== true || body.mode !== "recruitment-production") {
    throw new Error("La réponse de health check du conteneur est invalide.");
  }
  const anonymous = await fetch("http://127.0.0.1:" + port + "/api/admin/recrutement/offres");
  if (anonymous.status !== 401) throw new Error("La route RH anonyme du conteneur doit répondre 401.");
  console.log("Container smoke test OK: production health and anonymous RH rejection.");
} finally {
  spawnSync("docker", ["stop", containerName], { stdio: "ignore" });
  rmSync(fixtureDir, { recursive: true, force: true });
}
