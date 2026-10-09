/**
 * Extension idempotente du schéma SQLite du module recrutement.
 *
 * - Peut être appelée à chaque démarrage (CREATE IF NOT EXISTS + ALTER TABLE
 *   gardé par PRAGMA table_info) : aucune erreur si tout est déjà en place.
 * - Ne dépend pas du format de ./migrations/runner. Elle suppose seulement que
 *   les tables de base (recruitment_jobs, recruitment_applications, …) existent
 *   déjà, créées par les migrations d'origine.
 * - Elle est appelée automatiquement par createRepository() (repository.js),
 *   AVANT la préparation de la moindre requête SQL : c'est ce qui corrige
 *   l'erreur « table recruitment_jobs has no column named department ».
 */

const BASE_TABLES = ["recruitment_jobs", "recruitment_applications"];

function tableExists(db, table) {
  return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function hasColumn(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === column);
}

/** Ajoute la colonne si absente. Retourne true si elle vient d'être ajoutée. */
function addColumn(db, table, column, definition) {
  if (hasColumn(db, table, column)) return false;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  return true;
}

/**
 * Recalcule interview_score (moyenne des totaux d'évaluation, /50) et final_score
 * (IA /100 + entretien /50 + note RH /20 = /170, sur les composantes disponibles).
 * À compléter par une clause WHERE.
 */
const RECOMPUTE_SCORES_SQL = `
  UPDATE recruitment_applications SET
    interview_score = (SELECT ROUND(AVG(e.total), 1) FROM recruitment_evaluations e WHERE e.application_id = recruitment_applications.id),
    final_score = CASE
      WHEN match_score IS NULL AND hr_score IS NULL
           AND NOT EXISTS (SELECT 1 FROM recruitment_evaluations e WHERE e.application_id = recruitment_applications.id) THEN NULL
      ELSE ROUND(COALESCE(match_score, 0)
        + COALESCE((SELECT AVG(e.total) FROM recruitment_evaluations e WHERE e.application_id = recruitment_applications.id), 0)
        + COALESCE(hr_score, 0), 1)
    END`;

function upgradeEvaluationScale(db) {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'recruitment_evaluations'").get();
  if (!row || !/BETWEEN 1 AND 5/.test(row.sql)) return;
  db.exec(`
    DROP INDEX IF EXISTS idx_rec_eval_app;
    ALTER TABLE recruitment_evaluations RENAME TO recruitment_evaluations_v1;
    CREATE TABLE recruitment_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      interview_id INTEGER NOT NULL,
      application_id INTEGER NOT NULL,
      evaluator TEXT NOT NULL,
      technical INTEGER NOT NULL CHECK (technical BETWEEN 1 AND 10),
      communication INTEGER NOT NULL CHECK (communication BETWEEN 1 AND 10),
      motivation INTEGER NOT NULL CHECK (motivation BETWEEN 1 AND 10),
      experience INTEGER NOT NULL CHECK (experience BETWEEN 1 AND 10),
      adaptability INTEGER NOT NULL CHECK (adaptability BETWEEN 1 AND 10),
      total INTEGER NOT NULL,
      recommendation TEXT NOT NULL DEFAULT 'reserve',
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (interview_id, evaluator)
    );
    INSERT INTO recruitment_evaluations
      (id, interview_id, application_id, evaluator, technical, communication, motivation, experience, adaptability,
       total, recommendation, comment, created_at, updated_at)
    SELECT id, interview_id, application_id, evaluator, technical * 2, communication * 2, motivation * 2, experience * 2,
           adaptability * 2, total * 2, recommendation, comment, created_at, updated_at
    FROM recruitment_evaluations_v1;
    DROP TABLE recruitment_evaluations_v1;
  `);
}

function skillsFromAnalysis(analysis) {
  const raw = [...(analysis?.profile?.skills || []), ...(analysis?.profile?.technologies || [])];
  const skills = raw
    .map((item) => String(item).trim().toLocaleLowerCase("fr"))
    .filter((item) => item.length > 0 && item.length <= 80);
  return [...new Set(skills)].slice(0, 100);
}

/**
 * Remplit les colonnes dérivées (score, expérience, formation, résumé, compétences)
 * pour les candidatures déjà analysées avant l'ajout de ces colonnes.
 */
function backfillAnalysisColumns(db) {
  if (!hasColumn(db, "recruitment_applications", "analysis_json")) return;
  const rows = db.prepare(`
    SELECT id, analysis_json FROM recruitment_applications
    WHERE analysis_json IS NOT NULL AND match_score IS NULL AND analysis_json LIKE '%"score"%'
  `).all();
  if (!rows.length) return;

  const update = db.prepare(`
    UPDATE recruitment_applications
    SET match_score = ?, experience_years = ?, education_level = ?, profile_summary = ?
    WHERE id = ?
  `);
  const clearSkills = db.prepare("DELETE FROM recruitment_application_skills WHERE application_id = ?");
  const insertSkill = db.prepare(
    "INSERT OR IGNORE INTO recruitment_application_skills (application_id, skill) VALUES (?, ?)"
  );

  db.transaction(() => {
    for (const row of rows) {
      let analysis;
      try {
        analysis = JSON.parse(row.analysis_json);
      } catch {
        continue;
      }
      update.run(
        Number.isFinite(analysis?.score?.total) ? Math.round(analysis.score.total) : null,
        Number.isFinite(analysis?.profile?.experience_years) ? analysis.profile.experience_years : null,
        analysis?.profile?.highest_education_level || null,
        analysis?.summary ? String(analysis.summary).slice(0, 2000) : null,
        row.id
      );
      clearSkills.run(row.id);
      for (const skill of skillsFromAnalysis(analysis)) insertSkill.run(row.id, skill);
    }
  })();
}

function ensureRecruitmentSchema(db) {
  for (const table of BASE_TABLES) {
    if (!tableExists(db, table)) {
      throw new Error(
        `Table « ${table} » introuvable : exécutez d'abord les migrations de base du module recrutement ` +
          "avant d'appeler ensureRecruitmentSchema()."
      );
    }
  }

  const apply = db.transaction(() => {
    // --- Offres : champs du cahier des charges §9
    addColumn(db, "recruitment_jobs", "department", "TEXT");
    addColumn(db, "recruitment_jobs", "required_diploma", "TEXT");
    addColumn(db, "recruitment_jobs", "required_experience", "TEXT");
    addColumn(db, "recruitment_jobs", "seniority", "TEXT");
    addColumn(db, "recruitment_jobs", "languages_json", "TEXT");

    // --- Candidatures : pipeline §11, score & profil extrait §13-16
    const pipelineAdded = addColumn(
      db, "recruitment_applications", "pipeline_status", "TEXT NOT NULL DEFAULT 'nouvelle'"
    );
    addColumn(db, "recruitment_applications", "account_id", "INTEGER");
    addColumn(db, "recruitment_applications", "match_score", "INTEGER");
    addColumn(db, "recruitment_applications", "experience_years", "REAL");
    addColumn(db, "recruitment_applications", "education_level", "TEXT");
    addColumn(db, "recruitment_applications", "profile_summary", "TEXT");
    addColumn(db, "recruitment_applications", "interview_questions_json", "TEXT");
    addColumn(db, "recruitment_applications", "interview_questions_at", "TEXT");
    // Score final : IA (/100, match_score) + entretien (/50, moyenne des évaluations) + note RH (/20)
    addColumn(db, "recruitment_applications", "hr_score", "INTEGER");
    addColumn(db, "recruitment_applications", "hr_scored_by", "TEXT");
    addColumn(db, "recruitment_applications", "interview_score", "REAL");
    addColumn(db, "recruitment_applications", "final_score", "REAL");

    // --- Comptes candidats (§8), personnel (§8), entretiens (§20), évaluations (§21),
    //     notifications (§24), compétences indexées (§23)
    db.exec(`
      CREATE TABLE IF NOT EXISTS recruitment_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL,
        normalized_email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        phone TEXT,
        candidate_location TEXT,
        portfolio_url TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        token_version INTEGER NOT NULL DEFAULT 0,
        reset_token_hash TEXT,
        reset_expires_at TEXT,
        last_login_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS recruitment_staff (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        role TEXT NOT NULL CHECK (role IN ('admin', 'recruteur', 'lecteur')),
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS recruitment_interviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        scheduled_at TEXT NOT NULL,
        duration_min INTEGER NOT NULL DEFAULT 45,
        mode TEXT NOT NULL DEFAULT 'onsite',
        location TEXT,
        interviewer_email TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned',
        notes TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS recruitment_evaluations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        interview_id INTEGER NOT NULL,
        application_id INTEGER NOT NULL,
        evaluator TEXT NOT NULL,
        technical INTEGER NOT NULL CHECK (technical BETWEEN 1 AND 10),
        communication INTEGER NOT NULL CHECK (communication BETWEEN 1 AND 10),
        motivation INTEGER NOT NULL CHECK (motivation BETWEEN 1 AND 10),
        experience INTEGER NOT NULL CHECK (experience BETWEEN 1 AND 10),
        adaptability INTEGER NOT NULL CHECK (adaptability BETWEEN 1 AND 10),
        total INTEGER NOT NULL,
        recommendation TEXT NOT NULL DEFAULT 'reserve',
        comment TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (interview_id, evaluator)
      );

      CREATE TABLE IF NOT EXISTS recruitment_notifications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        application_id INTEGER NOT NULL,
        account_id INTEGER,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        read_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS recruitment_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS recruitment_application_skills (
        application_id INTEGER NOT NULL,
        skill TEXT NOT NULL,
        PRIMARY KEY (application_id, skill)
      );
    `);

    // Anciennes bases : évaluations notées de 1 à 5 (/25) -> 1 à 10 (/50). Les notes existantes sont doublées.
    upgradeEvaluationScale(db);

    // Index créés après les colonnes (sinon « no such column » sur une ancienne base).
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_rec_apps_pipeline ON recruitment_applications(pipeline_status);
      CREATE INDEX IF NOT EXISTS idx_rec_apps_score ON recruitment_applications(match_score);
      CREATE INDEX IF NOT EXISTS idx_rec_apps_account ON recruitment_applications(account_id);
      CREATE INDEX IF NOT EXISTS idx_rec_apps_job_final ON recruitment_applications(job_id, final_score);
      CREATE INDEX IF NOT EXISTS idx_rec_interviews_app ON recruitment_interviews(application_id);
      CREATE INDEX IF NOT EXISTS idx_rec_interviews_when ON recruitment_interviews(scheduled_at);
      CREATE INDEX IF NOT EXISTS idx_rec_eval_app ON recruitment_evaluations(application_id);
      CREATE INDEX IF NOT EXISTS idx_rec_notif_account ON recruitment_notifications(account_id, read_at);
      CREATE INDEX IF NOT EXISTS idx_rec_skill ON recruitment_application_skills(skill);
    `);

    // Anciennes candidatures déjà analysées : elles entrent dans le pipeline à « cv_analyse ».
    if (pipelineAdded && hasColumn(db, "recruitment_applications", "processing_status")) {
      db.exec(`
        UPDATE recruitment_applications SET pipeline_status = 'cv_analyse'
        WHERE processing_status = 'analysis_ready' AND pipeline_status = 'nouvelle'
      `);
    }
  });

  apply();
  backfillAnalysisColumns(db);
  db.exec(`${RECOMPUTE_SCORES_SQL} WHERE final_score IS NULL
    AND (match_score IS NOT NULL OR hr_score IS NOT NULL
         OR EXISTS (SELECT 1 FROM recruitment_evaluations e WHERE e.application_id = recruitment_applications.id))`);
}

module.exports = { ensureRecruitmentSchema, hasColumn, tableExists, RECOMPUTE_SCORES_SQL };
