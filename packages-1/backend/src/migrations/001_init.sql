-- Migration 001: Initial schema
-- Note: La table de suivi 'recruitment_migrations' est créée dynamiquement par le runner.

CREATE TABLE IF NOT EXISTS recruitment_jobs (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id           TEXT NOT NULL UNIQUE,
  slug                TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  summary             TEXT NOT NULL,
  description         TEXT NOT NULL,
  criteria_json       TEXT NOT NULL DEFAULT '[]',
  location            TEXT NOT NULL,
  work_mode           TEXT NOT NULL CHECK(work_mode IN ('onsite','hybrid','remote')),
  contract_type       TEXT NOT NULL CHECK(contract_type IN ('stage','cdd','cdi','alternance','freelance','interim','autre')),
  employer_type       TEXT NOT NULL CHECK(employer_type IN ('techzone','partner')),
  partner_name        TEXT,
  status              TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','closed','archived')),
  urgent              INTEGER NOT NULL DEFAULT 0,
  application_deadline TEXT,
  image_media_id      INTEGER,
  sender_display_name TEXT,
  signature_html      TEXT,
  reply_to            TEXT,
  published_at        TEXT,
  closed_at           TEXT,
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_recruitment_jobs_public
  ON recruitment_jobs(status, application_deadline);

CREATE TABLE IF NOT EXISTS recruitment_applications (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  public_id          TEXT NOT NULL UNIQUE,
  job_id             INTEGER NOT NULL REFERENCES recruitment_jobs(id) ON DELETE CASCADE,
  full_name          TEXT NOT NULL,
  email              TEXT NOT NULL,
  normalized_email   TEXT NOT NULL,
  phone              TEXT NOT NULL,
  candidate_location TEXT,
  portfolio_url      TEXT,
  consent_at         TEXT NOT NULL,
  processing_status  TEXT NOT NULL DEFAULT 'queued' CHECK(processing_status IN ('received','queued','processing','analysis_ready','analysis_failed')),
  hr_decision        TEXT NOT NULL DEFAULT 'to_review' CHECK(hr_decision IN ('to_review','selected','rejected','withdrawn')),
  analysis_json      TEXT,
  analysis_model     TEXT,
  analysis_attempts  INTEGER NOT NULL DEFAULT 0,
  analysis_error     TEXT,
  processing_started_at TEXT,
  analyzed_at        TEXT,
  decided_at         TEXT,
  decided_by         TEXT,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(job_id, normalized_email)
);

CREATE INDEX IF NOT EXISTS idx_recruitment_applications_queue
  ON recruitment_applications(processing_status, analysis_attempts, created_at);

CREATE TABLE IF NOT EXISTS recruitment_files (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  kind           TEXT NOT NULL CHECK(kind IN ('cv','cover_letter')),
  original_name  TEXT NOT NULL,
  mime_type      TEXT NOT NULL,
  size_bytes     INTEGER NOT NULL,
  sha256         TEXT NOT NULL,
  encrypted_path TEXT NOT NULL UNIQUE,
  iv             TEXT NOT NULL,
  auth_tag       TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(application_id, kind)
);

CREATE TABLE IF NOT EXISTS recruitment_emails (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id  INTEGER NOT NULL REFERENCES recruitment_applications(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL UNIQUE,
  recipient       TEXT NOT NULL,
  subject         TEXT NOT NULL,
  html_body       TEXT NOT NULL,
  text_body       TEXT NOT NULL,
  status          TEXT NOT NULL CHECK(status IN ('sending','sent','failed')),
  smtp_message_id TEXT,
  error_message   TEXT,
  created_by      TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at         TEXT
);

CREATE TABLE IF NOT EXISTS recruitment_events (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  application_id INTEGER REFERENCES recruitment_applications(id) ON DELETE SET NULL,
  event_type     TEXT NOT NULL,
  actor          TEXT NOT NULL,
  details_json   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
