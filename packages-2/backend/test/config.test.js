const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { loadConfig, loadEnvFile, ConfigValidationError, repositoryRoot } = require("../src/config");

function validDevEnv(overrides = {}) {
  return {
    NODE_ENV: "development",
    PORT: "3111",
    DB_PATH: "./demo/data/recruitment.sqlite",
    RECRUITMENT_STORAGE_DIR: "./demo/storage/recruitment",
    RECRUITMENT_RETENTION_DAYS: "180",
    RECRUITMENT_MAX_FILE_MB: "10",
    PRIVACY_CONTACT_EMAIL: "contact@techzone.lat",
    ...overrides
  };
}

function validProductionEnv(overrides = {}) {
  return {
    ...validDevEnv(),
    NODE_ENV: "production",
    RECRUITMENT_FILE_KEY: Buffer.alloc(32, 1).toString("base64"),
    OPENAI_API_KEY: "sk-test",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    VITE_TURNSTILE_SITE_KEY: "turnstile-site",
    SMTP_HOST: "mail.example.com",
    SMTP_USER: "contact@example.com",
    SMTP_PASS: "secret",
    TRUST_PROXY_HOPS: "1",
    RECRUITMENT_HOST_ADAPTER: "/opt/techzone/private/recruitment-host-adapter.cjs",
    ...overrides
  };
}

test("valid development config loads with demo defaults, no secrets required", () => {
  const config = loadConfig({ env: validDevEnv() });
  assert.equal(config.isProduction, false);
  assert.equal(config.port, 3111);
  assert.equal(config.turnstile.bypassAllowed, true);
  // A 32-byte fallback key is generated deterministically for local demo use.
  assert.equal(Buffer.from(config.fileKey, "base64").length, 32);
  assert.equal(config.smtp.host, "localhost");
});

test("valid production config loads and forbids Turnstile bypass", () => {
  const config = loadConfig({ env: validProductionEnv() });
  assert.equal(config.isProduction, true);
  assert.equal(config.turnstile.bypassAllowed, false);
  assert.equal(config.smtp.host, "mail.example.com");
});

test("the isolated test deployment accepts only its dedicated Turnstile keys and cookie", () => {
  const config = loadConfig({ env: validProductionEnv({
    RECRUITMENT_TEST_DEPLOYMENT: "true",
    RECRUITMENT_TEST_PORTAL: "true",
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    CORS_ORIGIN: "https://recrutement.techzone.lat",
    ADMIN_ORIGIN: "https://recrutement.techzone.lat",
    SESSION_COOKIE_NAME: "techzone_recruitment_test_session"
  }) });
  assert.equal(config.isTestDeployment, true);
  assert.equal(config.servesTestPortal, true);
  assert.equal(config.turnstile.siteKey, "1x00000000000000000000AA");
});

test("the test portal cannot be enabled outside its isolated deployment", () => {
  assert.throws(() => loadConfig({ env: validProductionEnv({ RECRUITMENT_TEST_PORTAL: "true" }) }), /RECRUITMENT_TEST_PORTAL/);
});

test("the isolated test deployment does not require external AI or SMTP credentials", () => {
  const env = validProductionEnv({
    RECRUITMENT_TEST_DEPLOYMENT: "true",
    RECRUITMENT_TEST_PORTAL: "true",
    TURNSTILE_SECRET_KEY: "1x0000000000000000000000000000000AA",
    VITE_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
    CORS_ORIGIN: "https://recrutement.techzone.lat",
    ADMIN_ORIGIN: "https://recrutement.techzone.lat",
    SESSION_COOKIE_NAME: "techzone_recruitment_test_session",
    OPENAI_API_KEY: undefined,
    SMTP_HOST: undefined,
    SMTP_USER: undefined,
    SMTP_PASS: undefined
  });
  const config = loadConfig({ env });
  assert.equal(config.openai.apiKey, "");
  assert.equal(config.smtp.host, "localhost");
});

test("missing PRIVACY_CONTACT_EMAIL fails before listening, in any mode", () => {
  const env = validDevEnv();
  delete env.PRIVACY_CONTACT_EMAIL;
  assert.throws(() => loadConfig({ env }), ConfigValidationError);
});

test("invalid PORT (non-numeric) fails with an explicit error", () => {
  const env = validDevEnv({ PORT: "not-a-number" });
  assert.throws(() => loadConfig({ env }), ConfigValidationError);
});

test("development defaults to the private shared-VPS port when PORT is absent", () => {
  const env = validDevEnv();
  delete env.PORT;
  const config = loadConfig({ env });
  assert.equal(config.port, 3111);
  assert.equal(config.listenHost, "127.0.0.1");
});

test("LISTEN_HOST only accepts loopback or the explicit container interface", () => {
  const env = validDevEnv({ LISTEN_HOST: "192.168.1.10" });
  assert.throws(() => loadConfig({ env }), /LISTEN_HOST/);
});

test("production mode requires RECRUITMENT_FILE_KEY as 32 bytes base64", () => {
  const env = validProductionEnv({ RECRUITMENT_FILE_KEY: "too-short" });
  assert.throws(() => loadConfig({ env }), (error) => {
    assert.ok(error instanceof ConfigValidationError);
    assert.match(error.message, /RECRUITMENT_FILE_KEY/);
    return true;
  });
});

test("production mode rejects non-canonical base64 file keys", () => {
  const env = validProductionEnv({ RECRUITMENT_FILE_KEY: "A".repeat(44) });
  assert.throws(() => loadConfig({ env }), ConfigValidationError);
});

test("production mode requires OPENAI_API_KEY, TURNSTILE keys and SMTP credentials", () => {
  const env = validProductionEnv({ OPENAI_API_KEY: "", TURNSTILE_SECRET_KEY: "", SMTP_USER: "" });
  assert.throws(() => loadConfig({ env }), (error) => {
    assert.ok(error instanceof ConfigValidationError);
    const missing = error.issues.map((issue) => issue.path.join("."));
    assert.ok(missing.includes("OPENAI_API_KEY"));
    assert.ok(missing.includes("TURNSTILE_SECRET_KEY"));
    assert.ok(missing.includes("SMTP_USER"));
    return true;
  });
});

test("production only trusts the single nginx proxy hop", () => {
  assert.throws(() => loadConfig({ env: validProductionEnv({ TRUST_PROXY_HOPS: "0" }) }), /TRUST_PROXY_HOPS/);
});

test("error message never contains raw secret values, only variable names", () => {
  const env = validProductionEnv({
    SMTP_PASS: "super-secret-smtp-password-12345",
    SMTP_USER: "" // force validation to fail while a secret is present
  });
  try {
    loadConfig({ env });
    assert.fail("expected ConfigValidationError");
  } catch (error) {
    assert.ok(error instanceof ConfigValidationError);
    assert.match(error.message, /SMTP_USER/);
    assert.doesNotMatch(error.message, /super-secret-smtp-password-12345/);
  }
});

test("relative DB_PATH and storage dir resolve against the repository root, not cwd", () => {
  const config = loadConfig({ env: validDevEnv() });
  assert.equal(config.dbPath, path.join(repositoryRoot, "demo/data/recruitment.sqlite"));
  assert.equal(config.storageDir, path.join(repositoryRoot, "demo/storage/recruitment"));
});

test("loadEnvFile never overrides variables already set in the real environment", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techzone-env-"));
  const envPath = path.join(tempDir, ".env");
  fs.writeFileSync(envPath, "PRIVACY_CONTACT_EMAIL=from-dotenv@example.com\n");

  const fakeProcessEnv = { PRIVACY_CONTACT_EMAIL: "from-real-env@example.com" };
  loadEnvFile({ envPath, env: fakeProcessEnv });

  assert.equal(fakeProcessEnv.PRIVACY_CONTACT_EMAIL, "from-real-env@example.com");
});

test("missing .env file does not throw: real environment variables can suffice", () => {
  const fakeProcessEnv = {};
  assert.doesNotThrow(() => loadEnvFile({ envPath: "/nonexistent/.env", env: fakeProcessEnv }));
});

test("portal options default to safe values and are read from RECRUITMENT_* variables", () => {
  const dev = loadConfig({ env: validDevEnv() });
  assert.equal(dev.portal.cookieSecure, false);
  assert.equal(dev.portal.acknowledgementEmail, true, "accusé de réception automatique par défaut");
  assert.deepEqual(dev.portal.adminEmails, []);
  assert.equal(dev.portal.sessionTtlHours, 168);
  assert.equal(dev.portal.timezone, "Indian/Antananarivo");

  const production = loadConfig({ env: validProductionEnv() });
  assert.equal(production.portal.cookieSecure, true, "cookie Secure par défaut en production");

  const custom = loadConfig({ env: validDevEnv({
    RECRUITMENT_PUBLIC_BASE_URL: "https://recrutement.techzone.lat",
    RECRUITMENT_COOKIE_SECURE: "true",
    RECRUITMENT_ADMIN_EMAILS: " Admin@Techzone.lat , rh@techzone.lat ",
    RECRUITMENT_ACK_EMAIL: "false",
    RECRUITMENT_SESSION_TTL_HOURS: "48"
  }) });
  assert.equal(custom.portal.publicBaseUrl, "https://recrutement.techzone.lat");
  assert.equal(custom.portal.cookieSecure, true);
  assert.deepEqual(custom.portal.adminEmails, ["admin@techzone.lat", "rh@techzone.lat"]);
  assert.equal(custom.portal.acknowledgementEmail, false);
  assert.equal(custom.portal.sessionTtlHours, 48);
});

test("invalid portal options fail before listening", () => {
  assert.throws(() => loadConfig({ env: validDevEnv({ RECRUITMENT_ADMIN_EMAILS: "pas-un-email" }) }), ConfigValidationError);
  assert.throws(() => loadConfig({ env: validDevEnv({ RECRUITMENT_PUBLIC_BASE_URL: "pas une url" }) }), ConfigValidationError);
  assert.throws(() => loadConfig({ env: validDevEnv({ RECRUITMENT_ACK_EMAIL: "peut-etre" }) }), ConfigValidationError);
});
