const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Docker context excludes local secrets and candidate storage", () => {
  const dockerignore = fs.readFileSync(path.resolve(__dirname, "../../..", ".dockerignore"), "utf8");

  for (const pattern of [".env", ".env.*", "deployment/*.env", "deployment/private/", "demo/storage/"]) {
    assert.match(dockerignore, new RegExp("^" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", "m"));
  }
});
