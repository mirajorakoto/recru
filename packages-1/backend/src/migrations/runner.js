const fs = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname);

function ensureMigrationsTable(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS recruitment_migrations (
      version     INTEGER PRIMARY KEY,
      applied_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

function getAppliedVersions(db) {
  const rows = db.prepare("SELECT version FROM recruitment_migrations").all();
  return new Set(rows.map((r) => r.version));
}

function getMigrationFiles() {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  return files.map((f) => {
    const match = f.match(/^(\d+)_/);
    if (!match) throw new Error(`Nom de fichier de migration invalide: ${f}`);
    return {
      version: parseInt(match[1], 10),
      filename: f,
      path: path.join(MIGRATIONS_DIR, f),
    };
  });
}

function runMigrations(db) {
  // Activation des clés étrangères (spécifique à SQLite, essentiel pour nos contraintes)
  db.pragma("foreign_keys = ON");

  ensureMigrationsTable(db);
  const applied = getAppliedVersions(db);
  const files = getMigrationFiles();

  const insertStmt = db.prepare(
    "INSERT INTO recruitment_migrations (version) VALUES (?)"
  );

  for (const file of files) {
    if (applied.has(file.version)) continue;

    const sql = fs.readFileSync(file.path, "utf8");

    // better-sqlite3 gère le ROLLBACK automatique si la fonction lève une erreur (Atomicité)
    const applyMigration = db.transaction(() => {
      db.exec(sql);
      insertStmt.run(file.version);
    });

    try {
      applyMigration();
      console.log(`[migrations] Version ${file.version} appliquée (${file.filename})`);
    } catch (err) {
      console.error(
        `[migrations] Échec de la version ${file.version} (Rollback automatique):`,
        err.message
      );
      throw err;
    }
  }
}

module.exports = { runMigrations };
