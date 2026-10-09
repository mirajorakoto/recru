const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

test("external deployment check rejects non-HTTPS origins without exposing env values", (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "techzone-external-check-"));
  const envPath = path.join(directory, "recruitment.env");
  const sentinel = "must-not-appear-in-output";
  fs.writeFileSync(envPath, "CORS_ORIGIN=http://invalid.example.test\nSESSION_SECRET=" + sentinel + "\n");
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  const result = spawnSync(process.execPath, [path.resolve(__dirname, "../../../scripts/deployment-external-check.mjs")], {
    env: { ...process.env, RECRUITMENT_DEPLOY_ENV: envPath },
    encoding: "utf8"
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /origine publique doit être une origine HTTPS simple/);
  assert.doesNotMatch(result.stdout + result.stderr, new RegExp(sentinel));
});
