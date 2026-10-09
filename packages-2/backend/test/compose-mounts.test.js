const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Compose keeps host code read-only and SQLite writable", () => {
  const compose = fs.readFileSync(path.resolve(__dirname, "../../..", "docker-compose.yml"), "utf8");

  assert.match(compose, /TECHZONE_HOST_BACKEND_ROOT[^\n]+:\/opt\/techzone\/host-backend:ro/);
  assert.match(compose, /TECHZONE_HOST_DB_DIRECTORY[^\n]+:\/opt\/techzone\/host-backend\/db:rw/);
});
