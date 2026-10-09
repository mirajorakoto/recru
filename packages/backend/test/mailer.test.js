const assert = require("node:assert/strict");
const test = require("node:test");
const { loadConfig } = require("../src/config");
const { createMailer } = require("../src/mailer");

const env = (extra = {}) => ({ NODE_ENV: "development", PRIVACY_CONTACT_EMAIL: "contact@techzone.lat", ...extra });
const quiet = () => { const lines = []; return { lines, log: (m) => lines.push(m), warn: (m) => lines.push(m), error: (m) => lines.push(m) }; };

test("SMTP_SECURE is read as text: « false » really means false", () => {
  assert.equal(loadConfig({ env: env({ SMTP_SECURE: "false" }) }).smtp.secure, false);
  assert.equal(loadConfig({ env: env({ SMTP_SECURE: "true" }) }).smtp.secure, true);
  assert.equal(loadConfig({ env: env({}) }).smtp.secure, true);
});

test("the public base URL feeds e-mail links and is mandatory in production", () => {
  assert.equal(loadConfig({ env: env({ PUBLIC_BASE_URL: "https://recrutement.techzone.lat/" }) }).publicBaseUrl, "https://recrutement.techzone.lat");
  assert.equal(loadConfig({ env: env() }).publicBaseUrl, "http://127.0.0.1:5173");
});

test("without SMTP credentials mails are simulated and logged, never silently dropped", async () => {
  const log = quiet();
  const mailer = createMailer(loadConfig({ env: env() }), { log });
  assert.equal(mailer.mode, "simulation");
  await mailer.transporter.sendMail({ to: "aina@example.test", subject: "Test" });
  assert.ok(log.lines.some((line) => /simulé/.test(line) && !line.includes("aina@")), "destinataire masqué");
  assert.equal(await mailer.verify(), false);
});

test("with SMTP_* in the .env the real SMTP transport is used, and an unreachable server is reported with a hint", async () => {
  const log = quiet();
  const config = loadConfig({ env: env({ SMTP_HOST: "127.0.0.1", SMTP_PORT: "1", SMTP_USER: "contact@techzone.lat", SMTP_PASS: "secret-pass", SMTP_SECURE: "false" }) });
  const mailer = createMailer(config, { log });
  assert.equal(mailer.mode, "smtp");
  assert.equal(await mailer.verify(), false);
  const text = log.lines.join("\n");
  assert.match(text, /INACCESSIBLE/);
  assert.match(text, /SMTP_HOST|SMTP_PORT/);
  assert.ok(!text.includes("secret-pass"), "le mot de passe n'apparaît jamais dans les journaux");
  assert.equal(createMailer(config, { log }).mode, "smtp");
  assert.equal(createMailer(loadConfig({ env: env({ SMTP_HOST: "127.0.0.1", SMTP_USER: "u", SMTP_PASS: "p", MAIL_MODE: "simulation" }) }), { log }).mode, "simulation");
});
