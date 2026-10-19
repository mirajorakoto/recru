const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { ensureRecruitmentSchema, recomputeScores, tableExists } = require("./schema");

function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * Les invitations aux entretiens restent verrouillées tant qu'une offre publiée
 * n'a pas atteint sa date limite de dépôt de candidatures.
 */
function interviewGate(job, now = Date.now()) {
  const deadline = job?.application_deadline ? new Date(job.application_deadline).getTime() : null;
  const locked = job?.status === "published" && deadline !== null && !Number.isNaN(deadline) && deadline > now;
  return { open: !locked, opens_at: locked ? job.application_deadline : null };
}

function mapJob(row) {
  if (!row) return null;
  const gate = interviewGate(row);
  return {
    ...row,
    interviews_open: gate.open,
    interviews_opens_at: gate.opens_at,
    urgent: Boolean(row.urgent),
    criteria: parseJson(row.criteria_json, []),
    languages: parseJson(row.languages_json, [])
  };
}

function mapApplication(row) {
  if (!row) return null;
  return {
    ...row,
    analysis: parseJson(row.analysis_json, null),
    interview_questions: parseJson(row.interview_questions_json, null),
    final_complete: row.match_score != null && row.interview_score != null && row.hr_score != null
  };
}

function mapAccount(row, { withSecrets = false } = {}) {
  if (!row) return null;
  const { password_hash, reset_token_hash, reset_expires_at, ...safe } = row;
  const account = { ...safe, active: Boolean(row.active) };
  return withSecrets ? { ...account, password_hash, reset_token_hash, reset_expires_at } : account;
}

function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (char) => `\\${char}`);
}

function extractSkillList(analysis) {
  const raw = [...(analysis?.profile?.skills || []), ...(analysis?.profile?.technologies || [])];
  const skills = raw
    .map((item) => String(item).trim().toLocaleLowerCase("fr"))
    .filter((item) => item.length > 0 && item.length <= 80);
  return [...new Set(skills)].slice(0, 100);
}

function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

const isNum = (value) => value !== undefined && value !== null && value !== "" && Number.isFinite(Number(value));

function unlinkQuietly(paths) {
  for (const filePath of paths) {
    try {
      fs.unlinkSync(filePath);
    } catch (error) {
      if (error.code !== "ENOENT") console.warn(`[recruitment] suppression de fichier chiffré échouée (${error.code || "erreur"})`);
    }
  }
}

function createRepository(db) {
  // Le schéma doit être complet AVANT de préparer la moindre requête SQL.
  ensureRecruitmentSchema(db);

  const insertJob = db.prepare(`
    INSERT INTO recruitment_jobs (
      public_id, slug, title, summary, description, criteria_json, location,
      work_mode, contract_type, employer_type, partner_name, status, urgent,
      application_deadline, image_media_id, sender_display_name, signature_html,
      reply_to, published_at, closed_at, department, required_diploma,
      required_experience, seniority, languages_json
    ) VALUES (
      @public_id, @slug, @title, @summary, @description, @criteria_json, @location,
      @work_mode, @contract_type, @employer_type, @partner_name, @status, @urgent,
      @application_deadline, @image_media_id, @sender_display_name, @signature_html,
      @reply_to, @published_at, @closed_at, @department, @required_diploma,
      @required_experience, @seniority, @languages_json
    )
  `);

  // ------------------------------------------------------------------ Offres
  function normalizeJob(input, existing = {}) {
    const status = input.status ?? existing.status ?? "draft";
    return {
      public_id: existing.public_id || randomUUID(),
      slug: input.slug ?? existing.slug ?? null,
      title: input.title ?? existing.title ?? null,
      summary: input.summary ?? existing.summary ?? null,
      description: input.description ?? existing.description ?? null,
      criteria_json: JSON.stringify(input.criteria ?? existing.criteria ?? []),
      location: input.location ?? existing.location ?? null,
      work_mode: input.work_mode ?? existing.work_mode ?? "onsite",
      contract_type: input.contract_type ?? existing.contract_type ?? "stage",
      employer_type: input.employer_type ?? existing.employer_type ?? "techzone",
      partner_name: input.partner_name ?? existing.partner_name ?? null,
      status,
      urgent: input.urgent === undefined ? Number(existing.urgent || 0) : Number(Boolean(input.urgent)),
      application_deadline: input.application_deadline ?? existing.application_deadline ?? null,
      image_media_id: input.image_media_id ?? existing.image_media_id ?? null,
      sender_display_name: input.sender_display_name ?? existing.sender_display_name ?? null,
      signature_html: input.signature_html ?? existing.signature_html ?? null,
      reply_to: input.reply_to ?? existing.reply_to ?? null,
      published_at:
        status === "published" ? existing.published_at || new Date().toISOString() : existing.published_at || null,
      closed_at:
        status === "closed" ? existing.closed_at || new Date().toISOString() : existing.closed_at || null,
      department: input.department ?? existing.department ?? null,
      required_diploma: input.required_diploma ?? existing.required_diploma ?? null,
      required_experience: input.required_experience ?? existing.required_experience ?? null,
      seniority: input.seniority ?? existing.seniority ?? null,
      languages_json: JSON.stringify(input.languages ?? existing.languages ?? [])
    };
  }

  function createJob(input) {
    const data = normalizeJob(input);
    const result = insertJob.run(data);
    return getJobById(result.lastInsertRowid);
  }

  function updateJob(id, input) {
    const existing = getJobById(id);
    if (!existing) return null;
    const data = { id: Number(id), ...normalizeJob(input, existing) };
    db.prepare(`
      UPDATE recruitment_jobs SET
        slug=@slug, title=@title, summary=@summary, description=@description,
        criteria_json=@criteria_json, location=@location, work_mode=@work_mode,
        contract_type=@contract_type, employer_type=@employer_type,
        partner_name=@partner_name, status=@status, urgent=@urgent,
        application_deadline=@application_deadline, image_media_id=@image_media_id,
        sender_display_name=@sender_display_name, signature_html=@signature_html,
        reply_to=@reply_to, published_at=@published_at, closed_at=@closed_at,
        department=@department, required_diploma=@required_diploma,
        required_experience=@required_experience, seniority=@seniority,
        languages_json=@languages_json, updated_at=datetime('now')
      WHERE id=@id
    `).run(data);
    return getJobById(id);
  }

  function getJobById(id) {
    return mapJob(db.prepare("SELECT * FROM recruitment_jobs WHERE id = ?").get(Number(id)));
  }

  function getJobByPublicId(publicId) {
    return mapJob(db.prepare("SELECT * FROM recruitment_jobs WHERE public_id = ?").get(publicId));
  }

  function getPublishedJobBySlug(slug) {
    return mapJob(db.prepare(`
      SELECT * FROM recruitment_jobs
      WHERE slug = ? AND status = 'published'
        AND (application_deadline IS NULL OR julianday(application_deadline) >= julianday('now'))
    `).get(slug));
  }

  function listJobs({ publicOnly = false } = {}) {
    const where = publicOnly
      ? "WHERE status='published' AND (application_deadline IS NULL OR julianday(application_deadline) >= julianday('now'))"
      : "";
    return db.prepare(`SELECT * FROM recruitment_jobs ${where} ORDER BY urgent DESC, created_at DESC`).all().map(mapJob);
  }

  function deleteJob(id) {
    return db.prepare(`
      DELETE FROM recruitment_jobs
      WHERE id = ? AND status = 'draft'
        AND NOT EXISTS (
          SELECT 1 FROM recruitment_applications WHERE job_id = recruitment_jobs.id
        )
    `).run(Number(id)).changes > 0;
  }

  // ------------------------------------------------------------ Candidatures
  function deleteApplication(id) {
    return eraseApplication(id);
  }

  const ERASE_TABLES = [
    "recruitment_evaluations", "recruitment_interviews", "recruitment_notifications",
    "recruitment_application_skills", "recruitment_emails", "recruitment_files", "recruitment_events"
  ];

  /** Supprime les lignes en base ; retourne les chemins de fichiers à effacer après commit. */
  function eraseApplicationRows(id) {
    const paths = tableExists(db, "recruitment_files")
      ? db.prepare("SELECT encrypted_path FROM recruitment_files WHERE application_id = ?").all(id).map((row) => row.encrypted_path)
      : [];
    for (const table of ERASE_TABLES) {
      if (tableExists(db, table)) db.prepare(`DELETE FROM ${table} WHERE application_id = ?`).run(id);
    }
    const removed = db.prepare("DELETE FROM recruitment_applications WHERE id = ?").run(id).changes > 0;
    return { removed, paths };
  }

  const eraseApplicationTx = db.transaction((id) => eraseApplicationRows(id));

  /** Effacement complet (droit à l'effacement) : données liées + fichiers chiffrés (supprimés après commit). */
  function eraseApplication(id) {
    const { removed, paths } = eraseApplicationTx(Number(id));
    unlinkQuietly(paths);
    return removed;
  }

  function createApplication(jobId, input) {
    const publicId = randomUUID();
    const result = db.prepare(`
      INSERT INTO recruitment_applications (
        public_id, job_id, full_name, email, normalized_email, phone,
        candidate_location, portfolio_url, consent_at, processing_status, account_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?)
    `).run(
      publicId,
      Number(jobId),
      input.full_name,
      input.email,
      input.email.trim().toLowerCase(),
      input.phone ?? null,
      input.candidate_location || null,
      input.portfolio_url || null,
      new Date().toISOString(),
      input.account_id || null
    );
    const id = Number(result.lastInsertRowid);
    db.prepare("UPDATE recruitment_applications SET reference = ? WHERE id = ?")
      .run(`TZR-${new Date().getUTCFullYear()}-${String(id).padStart(5, "0")}`, id);
    return getApplicationById(id);
  }

  function getApplicationById(id) {
    return mapApplication(db.prepare(`
      SELECT a.*, j.title AS job_title, j.slug AS job_slug,
             j.criteria_json AS job_criteria_json, j.employer_type,
             j.partner_name, j.sender_display_name, j.signature_html, j.reply_to
      FROM recruitment_applications a
      JOIN recruitment_jobs j ON j.id = a.job_id
      WHERE a.id = ?
    `).get(Number(id)));
  }

  function listApplications({ jobId, processingStatus, hrDecision, pipelineStatus, cursor, limit = 25 } = {}) {
    limit = clampInt(limit, 1, 200, 25);
    const conditions = [];
    const params = [];
    if (jobId) {
      conditions.push("a.job_id = ?");
      params.push(jobId);
    }
    if (processingStatus) {
      conditions.push("a.processing_status = ?");
      params.push(processingStatus);
    }
    if (hrDecision) {
      conditions.push("a.hr_decision = ?");
      params.push(hrDecision);
    }
    if (pipelineStatus) {
      conditions.push("a.pipeline_status = ?");
      params.push(pipelineStatus);
    }
    if (cursor) {
      conditions.push("(a.created_at < ? OR (a.created_at = ? AND a.id < ?))");
      params.push(cursor.createdAt, cursor.createdAt, cursor.id);
    }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return db.prepare(`
      SELECT a.*, j.title AS job_title, j.slug AS job_slug
      FROM recruitment_applications a
      JOIN recruitment_jobs j ON j.id = a.job_id
      ${where}
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT ?
    `).all(...params, limit + 1).map(mapApplication);
  }

  /** Recherche multicritère (§23) : nom, compétences, diplôme, expérience, offre, statut, score. */
  function searchApplications({
    q, skills = [], education, minExperience, minScore, jobId, pipelineStatus, hrDecision,
    sort = "recent", limit = 25, offset = 0
  } = {}) {
    const conditions = [];
    const params = [];
    if (q) {
      const like = `%${escapeLike(q)}%`;
      conditions.push("(a.full_name LIKE ? ESCAPE '\\' OR a.email LIKE ? ESCAPE '\\' OR a.reference LIKE ? ESCAPE '\\' OR a.profile_summary LIKE ? ESCAPE '\\')");
      params.push(like, like, like, like);
    }
    for (const skill of [].concat(skills || [])) {
      conditions.push("EXISTS (SELECT 1 FROM recruitment_application_skills s WHERE s.application_id = a.id AND s.skill = ?)");
      params.push(String(skill).trim().toLocaleLowerCase("fr"));
    }
    if (education) { conditions.push("a.education_level = ?"); params.push(education); }
    if (isNum(minExperience)) { conditions.push("a.experience_years >= ?"); params.push(Number(minExperience)); }
    if (isNum(minScore)) { conditions.push("a.match_score >= ?"); params.push(Number(minScore)); }
    if (jobId) { conditions.push("a.job_id = ?"); params.push(jobId); }
    if (pipelineStatus) { conditions.push("a.pipeline_status = ?"); params.push(pipelineStatus); }
    if (hrDecision) { conditions.push("a.hr_decision = ?"); params.push(hrDecision); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    limit = clampInt(limit, 1, 200, 25);
    offset = clampInt(offset, 0, 1000000, 0);
    const orderBy = sort === "final"
      ? "ORDER BY a.final_score IS NULL, a.final_score DESC, a.match_score DESC, a.created_at DESC, a.id DESC"
      : sort === "score"
        ? "ORDER BY a.match_score IS NULL, a.match_score DESC, a.created_at DESC, a.id DESC"
        : "ORDER BY a.created_at DESC, a.id DESC";
    const total = db.prepare(`SELECT COUNT(*) AS n FROM recruitment_applications a ${where}`).get(...params).n;
    const rows = db.prepare(`
      SELECT a.*, j.title AS job_title, j.slug AS job_slug
      FROM recruitment_applications a
      JOIN recruitment_jobs j ON j.id = a.job_id
      ${where} ${orderBy} LIMIT ? OFFSET ?
    `).all(...params, limit, offset).map(mapApplication);
    return { total, rows };
  }

  function setPipelineStatus(id, status) {
    return db.prepare(`
      UPDATE recruitment_applications SET pipeline_status=?, updated_at=datetime('now') WHERE id=?
    `).run(status, Number(id)).changes > 0;
  }

  function addFile(applicationId, file) {
    const result = db.prepare(`
      INSERT INTO recruitment_files (
        application_id, kind, original_name, mime_type, size_bytes, sha256,
        encrypted_path, iv, auth_tag
      ) VALUES (@application_id, @kind, @original_name, @mime_type, @size_bytes,
                @sha256, @encrypted_path, @iv, @auth_tag)
    `).run({ application_id: Number(applicationId), ...file });
    return db.prepare("SELECT * FROM recruitment_files WHERE id = ?").get(result.lastInsertRowid);
  }

  function listFiles(applicationId) {
    return db.prepare("SELECT * FROM recruitment_files WHERE application_id =? ORDER BY kind").all(Number(applicationId));
  }

  function getFile(id) {
    return db.prepare("SELECT * FROM recruitment_files WHERE id = ?").get(Number(id));
  }

  // ------------------------------------------------------------- Analyse IA
  function claimNextAnalysis() {
    const row = db.prepare(`
      UPDATE recruitment_applications
      SET processing_status='processing', processing_started_at=datetime('now'),
          analysis_attempts=analysis_attempts+1, analysis_error=NULL, updated_at=datetime('now'),
          pipeline_status = CASE WHEN pipeline_status='nouvelle' THEN 'en_analyse' ELSE pipeline_status END
      WHERE id = (
        SELECT id FROM recruitment_applications
        WHERE analysis_attempts < 3 AND (
          processing_status = 'queued' OR
          (processing_status = 'processing' AND processing_started_at < datetime('now', '-10 minutes'))
        )
        ORDER BY created_at ASC, id ASC LIMIT 1
      )
      AND analysis_attempts < 3 AND (
        processing_status = 'queued' OR
        (processing_status = 'processing' AND processing_started_at < datetime('now', '-10 minutes'))
      )
      RETURNING id
    `).get();
    if (!row) return null;
    return getApplicationById(row.id);
  }

  const completeAnalysisTx = db.transaction((id, analysis, model) => {
    db.prepare(`
      UPDATE recruitment_applications
      SET processing_status='analysis_ready', analysis_json=?, analysis_model=?,
          analyzed_at=datetime('now'), analysis_error=NULL, updated_at=datetime('now'),
          match_score=?, experience_years=?, education_level=?, profile_summary=?,
          pipeline_status = CASE WHEN pipeline_status IN ('nouvelle','en_analyse') THEN 'cv_analyse' ELSE pipeline_status END
      WHERE id=?
    `).run(
      JSON.stringify(analysis),
      model,
      Number.isFinite(analysis?.score?.total) ? Math.round(analysis.score.total) : null,
      Number.isFinite(analysis?.profile?.experience_years) ? analysis.profile.experience_years : null,
      analysis?.profile?.highest_education_level || null,
      analysis?.summary ? String(analysis.summary).slice(0, 2000) : null,
      id
    );
    db.prepare("DELETE FROM recruitment_application_skills WHERE application_id = ?").run(id);
    const insert = db.prepare("INSERT OR IGNORE INTO recruitment_application_skills (application_id, skill) VALUES (?, ?)");
    for (const skill of extractSkillList(analysis)) insert.run(id, skill);
  });

  function completeAnalysis(id, analysis, model) {
    completeAnalysisTx(Number(id), analysis, model);
    recomputeScores(db, id);
  }

  /** Note RH sur 20 (CDC : composante du score final). */
  function setHrScore(id, { score, comment = null, by }) {
    const changed = db.prepare(`
      UPDATE recruitment_applications SET hr_score=?, hr_score_comment=?, hr_score_by=?,
        hr_score_at=datetime('now'), updated_at=datetime('now') WHERE id=?
    `).run(score, comment, by, Number(id)).changes > 0;
    if (changed) recomputeScores(db, id);
    return changed;
  }

  /** Classement d'une offre : score final décroissant, puis score IA, puis ancienneté. */
  function listRanking(jobId) {
    return db.prepare(`
      SELECT a.*, j.title AS job_title, j.slug AS job_slug,
        (SELECT MIN(i.scheduled_at) FROM recruitment_interviews i WHERE i.application_id = a.id AND i.status = 'planned') AS next_interview_at,
        (SELECT COUNT(*) FROM recruitment_interviews i WHERE i.application_id = a.id AND i.status IN ('planned', 'done')) AS interviews_count
      FROM recruitment_applications a
      JOIN recruitment_jobs j ON j.id = a.job_id
      WHERE a.job_id = ? AND a.hr_decision != 'withdrawn'
      ORDER BY a.final_score IS NULL, a.final_score DESC, a.match_score IS NULL, a.match_score DESC, a.created_at ASC, a.id ASC
    `).all(Number(jobId)).map(mapApplication);
  }

  function hasPlannedInterview(applicationId) {
    return Boolean(db.prepare("SELECT 1 FROM recruitment_interviews WHERE application_id = ? AND status = 'planned' LIMIT 1").get(Number(applicationId)));
  }

  function failAnalysis(id, error, retryable) {
    const current = getApplicationById(id);
    if (!current) return;
    const status = retryable && current.analysis_attempts < 3 ? "queued" : "analysis_failed";
    db.prepare(`
      UPDATE recruitment_applications
      SET processing_status=?, analysis_error=?, updated_at=datetime('now') WHERE id=?
    `).run(status, String(error).slice(0, 1000), Number(id));
  }

  function retryAnalysis(id) {
    return db.prepare(`
      UPDATE recruitment_applications SET processing_status='queued',
        analysis_attempts=0, analysis_error=NULL, updated_at=datetime('now')
      WHERE id=? AND processing_status = 'analysis_failed'
    `).run(Number(id)).changes > 0;
  }

  /** Relance volontaire d'une analyse par un recruteur (analyse terminée ou échouée). */
  function requeueAnalysis(id) {
    return db.prepare(`
      UPDATE recruitment_applications SET processing_status='queued',
        analysis_attempts=0, analysis_error=NULL, updated_at=datetime('now')
      WHERE id=? AND processing_status IN ('analysis_ready', 'analysis_failed')
    `).run(Number(id)).changes > 0;
  }

  function saveInterviewQuestions(id, questions) {
    db.prepare(`
      UPDATE recruitment_applications
      SET interview_questions_json=?, interview_questions_at=datetime('now'), updated_at=datetime('now')
      WHERE id=?
    `).run(JSON.stringify(questions), Number(id));
  }

  function setDecision(id, decision, actor) {
    const changed = db.prepare(`
      UPDATE recruitment_applications SET hr_decision=?, decided_at=datetime('now'),
        decided_by=?, updated_at=datetime('now') WHERE id=?
    `).run(decision, actor, Number(id)).changes;
    return changed ? getApplicationById(id) : null;
  }

  // ------------------------------------------------- Journal / audit (§30-31)
  function recordEvent(applicationId, eventType, actor, details = null) {
    db.prepare(`
      INSERT INTO recruitment_events(application_id, event_type, actor, details_json)
      VALUES (?, ?, ?, ?)
    `).run(applicationId || null, eventType, actor, details ? JSON.stringify(details) : null);
  }

  function listEvents(applicationId) {
    return db.prepare(`
      SELECT id, event_type, actor, details_json, created_at
      FROM recruitment_events
      WHERE application_id = ?
      ORDER BY created_at ASC
    `).all(Number(applicationId)).map((row) => ({
      id: row.id,
      event_type: row.event_type,
      actor: row.actor,
      created_at: row.created_at,
      details: parseJson(row.details_json, null)
    }));
  }

  function listAuditEvents({ eventType, actor, applicationId, beforeId, limit = 50 } = {}) {
    const conditions = [];
    const params = [];
    if (eventType) { conditions.push("event_type = ?"); params.push(eventType); }
    if (actor) { conditions.push("actor = ?"); params.push(actor); }
    if (applicationId) { conditions.push("application_id = ?"); params.push(Number(applicationId)); }
    if (beforeId) { conditions.push("id < ?"); params.push(Number(beforeId)); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const rows = db.prepare(`
      SELECT id, application_id, event_type, actor, details_json, created_at
      FROM recruitment_events ${where} ORDER BY id DESC LIMIT ?
    `).all(...params, limit + 1);
    const hasMore = rows.length > limit;
    const events = rows.slice(0, limit).map((row) => ({
      id: row.id,
      application_id: row.application_id,
      event_type: row.event_type,
      actor: row.actor,
      created_at: row.created_at,
      details: parseJson(row.details_json, null)
    }));
    return { events, next_before_id: hasMore ? events[events.length - 1].id : null };
  }

  // ----------------------------------------------------------- Entretiens §20
  const interviewSelect = `
    SELECT i.*, a.full_name AS candidate_name, a.email AS candidate_email,
           a.job_id AS job_id, j.title AS job_title
    FROM recruitment_interviews i
    JOIN recruitment_applications a ON a.id = i.application_id
    JOIN recruitment_jobs j ON j.id = a.job_id
  `;

  function getInterview(id) {
    return db.prepare(`${interviewSelect} WHERE i.id = ?`).get(Number(id)) || null;
  }

  function createInterview(data) {
    const result = db.prepare(`
      INSERT INTO recruitment_interviews (
        application_id, scheduled_at, duration_min, mode, location,
        interviewer_email, notes, created_by
      ) VALUES (@application_id, @scheduled_at, @duration_min, @mode, @location,
                @interviewer_email, @notes, @created_by)
    `).run({
      application_id: Number(data.application_id),
      scheduled_at: data.scheduled_at,
      duration_min: data.duration_min ?? 45,
      mode: data.mode ?? "onsite",
      location: data.location ?? null,
      interviewer_email: data.interviewer_email,
      notes: data.notes ?? null,
      created_by: data.created_by
    });
    return getInterview(result.lastInsertRowid);
  }

  function updateInterview(id, changes) {
    const existing = getInterview(id);
    if (!existing) return null;
    const merged = { ...existing, ...changes };
    db.prepare(`
      UPDATE recruitment_interviews SET scheduled_at=@scheduled_at, duration_min=@duration_min,
        mode=@mode, location=@location, interviewer_email=@interviewer_email,
        status=@status, notes=@notes, updated_at=datetime('now')
      WHERE id=@id
    `).run({
      id: Number(id),
      scheduled_at: merged.scheduled_at,
      duration_min: merged.duration_min,
      mode: merged.mode,
      location: merged.location ?? null,
      interviewer_email: merged.interviewer_email,
      status: merged.status,
      notes: merged.notes ?? null
    });
    return getInterview(id);
  }

  function listInterviews({ applicationId, status, interviewer, from, to, limit = 100 } = {}) {
    const conditions = [];
    const params = [];
    if (applicationId) { conditions.push("i.application_id = ?"); params.push(Number(applicationId)); }
    if (status) { conditions.push("i.status = ?"); params.push(status); }
    if (interviewer) { conditions.push("i.interviewer_email = ?"); params.push(interviewer); }
    if (from) { conditions.push("julianday(i.scheduled_at) >= julianday(?)"); params.push(from); }
    if (to) { conditions.push("julianday(i.scheduled_at) <= julianday(?)"); params.push(to); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    return db.prepare(`${interviewSelect} ${where} ORDER BY i.scheduled_at ASC LIMIT ?`).all(...params, limit);
  }

  function findInterviewerConflict({ interviewerEmail, startIso, durationMin, excludeId = 0 }) {
    const endIso = new Date(new Date(startIso).getTime() + durationMin * 60000).toISOString();
    return db.prepare(`
      SELECT id FROM recruitment_interviews
      WHERE interviewer_email = ? AND status = 'planned' AND id != ?
        AND julianday(scheduled_at) < julianday(?)
        AND julianday(scheduled_at) + duration_min / 1440.0 > julianday(?)
      LIMIT 1
    `).get(interviewerEmail, Number(excludeId), endIso, startIso) || null;
  }

  function listInterviewsForAccount(accountId) {
    return db.prepare(`
      SELECT i.id, i.application_id, i.scheduled_at, i.duration_min, i.mode, i.location, i.status,
             a.public_id AS application_public_id, j.title AS job_title
      FROM recruitment_interviews i
      JOIN recruitment_applications a ON a.id = i.application_id
      JOIN recruitment_jobs j ON j.id = a.job_id
      WHERE a.account_id = ?
      ORDER BY i.scheduled_at ASC
    `).all(Number(accountId));
  }

  // ---------------------------------------------------------- Évaluations §21
  function upsertEvaluation(data) {
    const total = data.technical + data.communication + data.motivation + data.experience + data.adaptability;
    const params = {
      interview_id: Number(data.interview_id),
      application_id: Number(data.application_id),
      evaluator: data.evaluator,
      technical: data.technical,
      communication: data.communication,
      motivation: data.motivation,
      experience: data.experience,
      adaptability: data.adaptability,
      total,
      recommendation: data.recommendation || "reserve",
      comment: data.comment ?? null
    };
    db.prepare(`
      INSERT INTO recruitment_evaluations (
        interview_id, application_id, evaluator, technical, communication,
        motivation, experience, adaptability, total, recommendation, comment
      ) VALUES (@interview_id, @application_id, @evaluator, @technical, @communication,
                @motivation, @experience, @adaptability, @total, @recommendation, @comment)
      ON CONFLICT(interview_id, evaluator) DO UPDATE SET
        technical=excluded.technical, communication=excluded.communication,
        motivation=excluded.motivation, experience=excluded.experience,
        adaptability=excluded.adaptability, total=excluded.total,
        recommendation=excluded.recommendation, comment=excluded.comment,
        updated_at=datetime('now')
    `).run(params);
    recomputeScores(db, params.application_id);
    return db.prepare("SELECT * FROM recruitment_evaluations WHERE interview_id = ? AND evaluator = ?")
      .get(params.interview_id, params.evaluator);
  }

  function listEvaluations(applicationId) {
    return db.prepare(`
      SELECT * FROM recruitment_evaluations WHERE application_id = ? ORDER BY created_at ASC
    `).all(Number(applicationId));
  }

  // ------------------------------------------------------- Notifications §24
  function addNotification({ application_id, account_id = null, type, title, body }) {
    db.prepare(`
      INSERT INTO recruitment_notifications (application_id, account_id, type, title, body)
      VALUES (?, ?, ?, ?, ?)
    `).run(Number(application_id), account_id, type, title, body);
  }

  function listNotifications(accountId, { unreadOnly = false, limit = 50 } = {}) {
    const unread = unreadOnly ? "AND read_at IS NULL" : "";
    return db.prepare(`
      SELECT id, application_id, type, title, body, read_at, created_at
      FROM recruitment_notifications WHERE account_id = ? ${unread}
      ORDER BY id DESC LIMIT ?
    `).all(Number(accountId), limit);
  }

  function markNotificationsRead(accountId, ids = null) {
    if (!ids) {
      return db.prepare(`
        UPDATE recruitment_notifications SET read_at=datetime('now')
        WHERE account_id=? AND read_at IS NULL
      `).run(Number(accountId)).changes;
    }
    const mark = db.prepare(`
      UPDATE recruitment_notifications SET read_at=datetime('now')
      WHERE account_id=? AND id=? AND read_at IS NULL
    `);
    let changed = 0;
    for (const id of ids) changed += mark.run(Number(accountId), Number(id)).changes;
    return changed;
  }

  // ------------------------------------------------------ Comptes candidats §8
  function createAccount({ email, password_hash, full_name, phone = null, candidate_location = null }) {
    const result = db.prepare(`
      INSERT INTO recruitment_accounts (email, normalized_email, password_hash, full_name, phone, candidate_location)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(email, email.trim().toLowerCase(), password_hash, full_name, phone, candidate_location);
    return getAccountById(result.lastInsertRowid);
  }

  function getAccountById(id, options) {
    return mapAccount(db.prepare("SELECT * FROM recruitment_accounts WHERE id = ?").get(Number(id)), options);
  }

  function getAccountByEmail(email, options) {
    return mapAccount(
      db.prepare("SELECT * FROM recruitment_accounts WHERE normalized_email = ?").get(String(email).trim().toLowerCase()),
      options
    );
  }

  function updateAccountProfile(id, { full_name, phone, candidate_location, portfolio_url }) {
    const existing = getAccountById(id);
    if (!existing) return null;
    db.prepare(`
      UPDATE recruitment_accounts SET full_name=?, phone=?, candidate_location=?, portfolio_url=?,
        updated_at=datetime('now') WHERE id=?
    `).run(
      full_name ?? existing.full_name,
      phone === undefined ? existing.phone : phone,
      candidate_location === undefined ? existing.candidate_location : candidate_location,
      portfolio_url === undefined ? existing.portfolio_url : portfolio_url,
      Number(id)
    );
    return getAccountById(id);
  }

  function setAccountPassword(id, passwordHash) {
    db.prepare(`
      UPDATE recruitment_accounts SET password_hash=?, token_version=token_version+1,
        reset_token_hash=NULL, reset_expires_at=NULL, updated_at=datetime('now') WHERE id=?
    `).run(passwordHash, Number(id));
  }

  function bumpTokenVersion(id) {
    db.prepare("UPDATE recruitment_accounts SET token_version=token_version+1 WHERE id=?").run(Number(id));
    return getAccountById(id);
  }

  function touchLogin(id) {
    db.prepare("UPDATE recruitment_accounts SET last_login_at=datetime('now') WHERE id=?").run(Number(id));
  }

  function setResetToken(id, tokenHash, expiresIso) {
    db.prepare("UPDATE recruitment_accounts SET reset_token_hash=?, reset_expires_at=? WHERE id=?")
      .run(tokenHash, expiresIso, Number(id));
  }

  function findAccountByResetHash(tokenHash) {
    return mapAccount(db.prepare(`
      SELECT * FROM recruitment_accounts
      WHERE reset_token_hash = ? AND julianday(reset_expires_at) > julianday('now')
    `).get(tokenHash));
  }

  function setAccountActive(id, active) {
    const changed = db.prepare(`
      UPDATE recruitment_accounts SET active=?, token_version=token_version+1, updated_at=datetime('now') WHERE id=?
    `).run(active ? 1 : 0, Number(id)).changes;
    return changed ? getAccountById(id) : null;
  }

  function listAccounts({ limit = 50, offset = 0 } = {}) {
    return db.prepare("SELECT * FROM recruitment_accounts ORDER BY id DESC LIMIT ? OFFSET ?")
      .all(limit, offset).map((row) => mapAccount(row));
  }

  function listApplicationsForAccount(accountId) {
    return db.prepare(`
      SELECT a.id, a.public_id, a.reference, a.pipeline_status, a.processing_status, a.hr_decision, a.created_at,
             j.title AS job_title, j.slug AS job_slug
      FROM recruitment_applications a
      JOIN recruitment_jobs j ON j.id = a.job_id
      WHERE a.account_id = ? ORDER BY a.created_at DESC
    `).all(Number(accountId));
  }

  function deleteAccountWithApplications(accountId) {
    const run = db.transaction(() => {
      const ids = db.prepare("SELECT id FROM recruitment_applications WHERE account_id = ?").all(Number(accountId));
      const paths = [];
      for (const row of ids) paths.push(...eraseApplicationRows(row.id).paths);
      db.prepare("DELETE FROM recruitment_notifications WHERE account_id = ?").run(Number(accountId));
      db.prepare("DELETE FROM recruitment_accounts WHERE id = ?").run(Number(accountId));
      return { count: ids.length, paths };
    });
    const { count, paths } = run();
    unlinkQuietly(paths);
    return count;
  }

  // ------------------------------------------------------ Compte RH unique
  // Une seule ligne possible (id = 1, imposé par la base) : administrateur et recruteur à la fois.
  function getRhAccount({ withSecrets = false } = {}) {
    const row = db.prepare(`
      SELECT id, email, display_name, password_hash, token_version, last_login_at, created_at, updated_at
      FROM recruitment_rh_account WHERE id = 1
    `).get();
    if (!row) return null;
    if (withSecrets) return row;
    const { password_hash, ...safe } = row; // eslint-disable-line no-unused-vars
    return safe;
  }

  /** Crée le compte RH. Lève une erreur « RH_ACCOUNT_EXISTS » si un compte existe déjà (course incluse). */
  function createRhAccount({ email, display_name, password_hash }) {
    try {
      db.prepare("INSERT INTO recruitment_rh_account (id, email, display_name, password_hash) VALUES (1, ?, ?, ?)")
        .run(String(email).trim().toLowerCase(), display_name, password_hash);
    } catch (error) {
      if (String(error?.code || "").startsWith("SQLITE_CONSTRAINT")) {
        const conflict = new Error("Un compte RH existe déjà.");
        conflict.code = "RH_ACCOUNT_EXISTS";
        throw conflict;
      }
      throw error;
    }
    return getRhAccount();
  }

  /** Change le mot de passe et révoque toutes les sessions RH ouvertes (token_version + 1). */
  function setRhPassword(passwordHash) {
    db.prepare("UPDATE recruitment_rh_account SET password_hash = ?, token_version = token_version + 1, updated_at = datetime('now') WHERE id = 1")
      .run(passwordHash);
    return getRhAccount();
  }

  function touchRhLogin() {
    db.prepare("UPDATE recruitment_rh_account SET last_login_at = datetime('now') WHERE id = 1").run();
  }

  /** Supprime le compte RH (les offres, candidatures et comptes candidats sont conservés). */
  function deleteRhAccount() {
    return db.prepare("DELETE FROM recruitment_rh_account WHERE id = 1").run().changes > 0;
  }

  // -------------------------------------------------------- Tableau de bord §22
  function dashboardStats() {
    const count = (sql, ...params) => db.prepare(sql).get(...params).n;
    const groups = (sql, key) => Object.fromEntries(db.prepare(sql).all().map((row) => [row[key], row.n]));
    return {
      totals: {
        offres: count("SELECT COUNT(*) AS n FROM recruitment_jobs"),
        offres_publiees: count("SELECT COUNT(*) AS n FROM recruitment_jobs WHERE status='published'"),
        candidatures: count("SELECT COUNT(*) AS n FROM recruitment_applications"),
        comptes_candidats: count("SELECT COUNT(*) AS n FROM recruitment_accounts"),
        entretiens: count("SELECT COUNT(*) AS n FROM recruitment_interviews WHERE status != 'cancelled'"),
        recrutes: count("SELECT COUNT(*) AS n FROM recruitment_applications WHERE pipeline_status='acceptee'"),
        score_moyen: db.prepare("SELECT ROUND(AVG(match_score), 1) AS v FROM recruitment_applications WHERE match_score IS NOT NULL").get().v
      },
      offres_par_statut: groups("SELECT status, COUNT(*) AS n FROM recruitment_jobs GROUP BY status", "status"),
      candidatures_par_statut: groups("SELECT pipeline_status, COUNT(*) AS n FROM recruitment_applications GROUP BY pipeline_status", "pipeline_status"),
      candidatures_par_decision: groups("SELECT hr_decision, COUNT(*) AS n FROM recruitment_applications GROUP BY hr_decision", "hr_decision"),
      candidatures_par_traitement: groups("SELECT processing_status, COUNT(*) AS n FROM recruitment_applications GROUP BY processing_status", "processing_status"),
      candidatures_par_mois: db.prepare(`
        SELECT substr(created_at, 1, 7) AS mois, COUNT(*) AS n
        FROM recruitment_applications
        WHERE created_at >= date('now', 'start of month', '-11 months')
        GROUP BY mois ORDER BY mois
      `).all(),
      candidatures_par_offre: db.prepare(`
        SELECT j.id AS job_id, j.title, COUNT(a.id) AS n, ROUND(AVG(a.match_score), 1) AS score_moyen
        FROM recruitment_jobs j JOIN recruitment_applications a ON a.job_id = j.id
        GROUP BY j.id ORDER BY n DESC LIMIT 10
      `).all(),
      competences_frequentes: db.prepare(`
        SELECT skill, COUNT(*) AS n FROM recruitment_application_skills
        GROUP BY skill ORDER BY n DESC, skill LIMIT 15
      `).all(),
      entretiens_par_statut: groups("SELECT status, COUNT(*) AS n FROM recruitment_interviews GROUP BY status", "status"),
      alertes: {
        nouvelles_24h: count("SELECT COUNT(*) AS n FROM recruitment_applications WHERE created_at >= datetime('now', '-1 day')"),
        a_traiter: count("SELECT COUNT(*) AS n FROM recruitment_applications WHERE pipeline_status IN ('nouvelle','en_analyse','cv_analyse')"),
        analyses_echouees: count("SELECT COUNT(*) AS n FROM recruitment_applications WHERE processing_status='analysis_failed'"),
        entretiens_a_venir: count("SELECT COUNT(*) AS n FROM recruitment_interviews WHERE status='planned' AND julianday(scheduled_at) >= julianday('now')"),
        entretiens_aujourdhui: count("SELECT COUNT(*) AS n FROM recruitment_interviews WHERE status='planned' AND date(scheduled_at) = date('now')")
      }
    };
  }

  return {
    db,
    addFile,
    addNotification,
    bumpTokenVersion,
    claimNextAnalysis,
    completeAnalysis,
    createAccount,
    createApplication,
    createInterview,
    createJob,
    dashboardStats,
    deleteAccountWithApplications,
    deleteApplication,
    deleteJob,
    eraseApplication,
    failAnalysis,
    findAccountByResetHash,
    findInterviewerConflict,
    getAccountByEmail,
    getAccountById,
    getApplicationById,
    hasPlannedInterview,
    interviewGate,
    listRanking,
    setHrScore,
    getFile,
    getInterview,
    getJobById,
    getJobByPublicId,
    getPublishedJobBySlug,
    listAccounts,
    listApplications,
    listApplicationsForAccount,
    listAuditEvents,
    listEvaluations,
    listEvents,
    listFiles,
    listInterviews,
    listInterviewsForAccount,
    listJobs,
    listNotifications,
    markNotificationsRead,
    recordEvent,
    requeueAnalysis,
    retryAnalysis,
    saveInterviewQuestions,
    searchApplications,
    setAccountActive,
    setAccountPassword,
    setDecision,
    setPipelineStatus,
    setResetToken,
    touchLogin,
    updateAccountProfile,
    updateInterview,
    updateJob,
    upsertEvaluation,
    getRhAccount,
    createRhAccount,
    setRhPassword,
    touchRhLogin,
    deleteRhAccount
  };
}

module.exports = { createRepository, mapApplication, mapJob };
