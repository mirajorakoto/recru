const { test } = require("node:test");
const assert = require("node:assert");
const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");
const { runMigrations } = require("../src/migrations/runner");

const INIT_SQL_PATH = path.join(__dirname, "../src/migrations/001_init.sql");

function insertJob(db, publicId, title) {
  db.prepare(
    `INSERT INTO recruitment_jobs
      (public_id, slug, title, summary, description, location, work_mode, contract_type, employer_type)
     VALUES (?, ?, ?, 'sum', 'desc', 'loc', 'onsite', 'cdd', 'techzone')`
  ).run(publicId, publicId + "-slug", title);
}

test("Base neuve : toutes les migrations s'appliquent et les tables sont créées", () => {
  const db = new Database(":memory:");
  runMigrations(db);

  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'recruitment_%'")
    .all()
    .map((r) => r.name);

  assert.ok(tables.includes("recruitment_jobs"));
  assert.ok(tables.includes("recruitment_applications"));
  assert.ok(tables.includes("recruitment_files"));
  assert.ok(tables.includes("recruitment_emails"));
  assert.ok(tables.includes("recruitment_events"));
  assert.ok(tables.includes("recruitment_migrations"));

  const versions = db.prepare("SELECT version FROM recruitment_migrations").all();
  assert.deepStrictEqual(versions, [{ version: 1 }]);

  const fkStatus = db.pragma("foreign_keys", { simple: true });
  assert.strictEqual(fkStatus, 1, "Les clés étrangères doivent être activées");
});

test("Base V1 existante (socle actuel) : mise à niveau sans perte de données", () => {
  const db = new Database(":memory:");

  // Simule une base V1 produite par l'ANCIENNE initialisation monolithique :
  // schéma complet + registre + version 1 déjà inscrite.
  db.exec(fs.readFileSync(INIT_SQL_PATH, "utf8"));
  db.exec(`
    CREATE TABLE IF NOT EXISTS recruitment_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  db.prepare("INSERT OR IGNORE INTO recruitment_migrations(version) VALUES (1)").run();
  insertJob(db, "p1", "Offre existante");

  runMigrations(db);

  const job = db.prepare("SELECT title FROM recruitment_jobs WHERE public_id = 'p1'").get();
  assert.strictEqual(job.title, "Offre existante");

  const versions = db.prepare("SELECT version FROM recruitment_migrations").all();
  assert.deepStrictEqual(versions, [{ version: 1 }]);
});

test("Base V1 sans registre : le runner référence la version 1 sans perte de données", () => {
  const db = new Database(":memory:");

  // Cas défensif : schéma complet présent, mais aucun registre de migrations.
  db.exec(fs.readFileSync(INIT_SQL_PATH, "utf8"));
  insertJob(db, "p2", "Offre sans registre");

  runMigrations(db);

  const job = db.prepare("SELECT title FROM recruitment_jobs WHERE public_id = 'p2'").get();
  assert.strictEqual(job.title, "Offre sans registre");

  const versions = db.prepare("SELECT version FROM recruitment_migrations").all();
  assert.deepStrictEqual(versions, [{ version: 1 }]);
});

test("Idempotence : une double exécution ne modifie ni les données ni le schéma", () => {
  const db = new Database(":memory:");
  runMigrations(db);
  insertJob(db, "p1", "t1");
  runMigrations(db);

  const jobs = db.prepare("SELECT COUNT(*) as count FROM recruitment_jobs").get();
  assert.strictEqual(jobs.count, 1);

  const versions = db.prepare("SELECT COUNT(*) as count FROM recruitment_migrations").get();
  assert.strictEqual(versions.count, 1);
});

test("Échec atomique : une migration défaillante ne laisse pas de version partiellement appliquée", () => {
  const db = new Database(":memory:");
  runMigrations(db);

  const badMigrationPath = path.join(__dirname, "../src/migrations/002_bad.sql");
  fs.writeFileSync(badMigrationPath, "CREATE TABLE recruitment_test (id INTEGER; SYNTAX_ERROR;");

  try {
    assert.throws(() => runMigrations(db), /SYNTAX_ERROR|near/);
  } finally {
    if (fs.existsSync(badMigrationPath)) fs.unlinkSync(badMigrationPath);
  }

  const versions = db.prepare("SELECT version FROM recruitment_migrations").all();
  assert.deepStrictEqual(versions, [{ version: 1 }]);

  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='recruitment_test'").all();
  assert.strictEqual(tables.length, 0);
});
