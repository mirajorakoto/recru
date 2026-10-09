const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");
const express = require("express");
const request = require("supertest");
const { createRecruitmentModule } = require("../src");
const { createTestAiService } = require("../src/ai");
const { ensureRecruitmentSchema } = require("../src/schema");

const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF", "ascii");
const rh = { "x-e2e-rh-session": "ok" };
const DAY = 24 * 3600 * 1000;

function harness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "techzone-scoring-"));
  const db = new Database(path.join(root, "r.sqlite"));
  db.pragma("foreign_keys = ON");
  const mails = [];
  const recruitment = createRecruitmentModule({
    db,
    requireAdminSession(req, res, next) {
      if (req.get("x-e2e-rh-session") !== "ok") return res.status(401).json({ error: "Session RH requise." });
      req.adminUser = { id: 1, email: "rh@example.test", display_name: "RH" };
      next();
    },
    transporter: { async sendMail(message) { mails.push(message); return {}; } },
    aiService: createTestAiService(),
    config: { storageDir: path.join(root, "files"), fileKey: Buffer.alloc(32, 9).toString("base64"), bypassTurnstile: true, smtpFrom: "T <t@example.test>", publicBaseUrl: "https://rh.example.test" }
  });
  const app = express();
  app.use(express.json());
  app.use("/api/recrutement", recruitment.publicRouter);
  app.use("/api/admin/recrutement", recruitment.adminRouter);
  t.after(() => { recruitment.stop(); db.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { api: request(app), app, db, recruitment, mails };
}

async function createJob(h, deadline) {
  const response = await h.api.post("/api/admin/recrutement/offres").set(rh).send({
    slug: `dev-${Math.random().toString(36).slice(2, 8)}`, title: "Développeur", summary: "Offre de test.", description: "Description de test.",
    criteria: [{ label: "JavaScript", required: true }], location: "Tana", work_mode: "hybrid", contract_type: "stage", employer_type: "techzone",
    status: "published", application_deadline: deadline
  });
  assert.equal(response.statusCode, 201, JSON.stringify(response.body));
  return response.body.offre;
}

// Postuler exige un compte candidat complet (identifiant = e-mail) : on s'inscrit puis on postule avec la session.
async function apply(h, job, name) {
  const email = `${name.toLowerCase().replace(/\W/g, "")}@example.test`;
  const agent = request.agent(h.app);
  const signup = await agent.post("/api/recrutement/compte/inscription").send({ email, password: "MotDePasse2026", full_name: name, phone: "0340000000", candidate_location: "Antananarivo", consent: true });
  assert.equal(signup.statusCode, 201, JSON.stringify(signup.body));
  const response = await agent.post(`/api/recrutement/offres/${job.public_id}/candidatures`)
    .field("consent", "true")
    .attach("cv", pdf, { filename: "cv.pdf", contentType: "application/pdf" });
  assert.equal(response.statusCode, 202, JSON.stringify(response.body));
  assert.match(response.body.reference, /^TZR-\d{4}-\d{5}$/);
  while (await h.recruitment.worker.runOnce()) { /* analyse toutes les candidatures en file */ }
  return h.recruitment.repository.listApplications().find((a) => a.full_name === name);
}

test("interview invitations stay locked until the offer deadline, then open", async (t) => {
  const h = harness(t);
  const job = await createJob(h, new Date(Date.now() + 3 * DAY).toISOString());
  const a = await apply(h, job, "Aina Rakoto");
  const body = { application_ids: [a.id], start_at: new Date(Date.now() + 5 * DAY).toISOString(), interviewer_email: "rh@example.test" };

  const ranking = await h.api.get(`/api/admin/recrutement/offres/${job.id}/classement`).set(rh);
  assert.equal(ranking.body.offre.interviews_open, false);
  assert.ok(ranking.body.offre.interviews_opens_at);

  const locked = await h.api.post(`/api/admin/recrutement/offres/${job.id}/entretiens-groupes`).set(rh).send(body);
  assert.equal(locked.statusCode, 409);
  assert.match(locked.body.error, /après la date limite/);
  const single = await h.api.post("/api/admin/recrutement/entretiens").set(rh).send({ application_id: a.id, scheduled_at: body.start_at, interviewer_email: "rh@example.test" });
  assert.equal(single.statusCode, 409);

  h.db.prepare("UPDATE recruitment_jobs SET application_deadline = ? WHERE id = ?").run(new Date(Date.now() - DAY).toISOString(), job.id);
  const open = await h.api.get(`/api/admin/recrutement/offres/${job.id}/classement`).set(rh);
  assert.equal(open.body.offre.interviews_open, true);
  const ok = await h.api.post(`/api/admin/recrutement/offres/${job.id}/entretiens-groupes`).set(rh).send(body);
  assert.equal(ok.statusCode, 201);
  assert.equal(ok.body.created.length, 1);
});

test("bulk invitation staggers slots, notifies candidates and prepares interview questions", async (t) => {
  const h = harness(t);
  const job = await createJob(h, null);
  const apps = [await apply(h, job, "Candidat Un"), await apply(h, job, "Candidat Deux"), await apply(h, job, "Candidat Trois")];
  const start = new Date(Date.now() + 2 * DAY);
  start.setMilliseconds(0);
  const response = await h.api.post(`/api/admin/recrutement/offres/${job.id}/entretiens-groupes`).set(rh).send({
    application_ids: [apps[0].id, apps[1].id, apps[2].id, 999999], start_at: start.toISOString(), duration_min: 30, gap_min: 10, mode: "visio", location: "https://meet.example/x", interviewer_email: "rh@example.test"
  });
  assert.equal(response.statusCode, 201, JSON.stringify(response.body));
  assert.equal(response.body.created.length, 3);
  assert.equal(response.body.skipped.length, 1);
  const times = response.body.created.map((c) => new Date(c.entretien.scheduled_at).getTime());
  assert.deepEqual(times.map((v) => (v - times[0]) / 60000), [0, 40, 80]);

  const again = await h.api.post(`/api/admin/recrutement/offres/${job.id}/entretiens-groupes`).set(rh).send({ application_ids: [apps[0].id], start_at: start.toISOString(), interviewer_email: "rh@example.test" });
  assert.match(again.body.skipped[0].reason, /déjà planifié/);

  await new Promise((resolve) => setTimeout(resolve, 80));
  for (const app of apps) {
    const fresh = h.recruitment.repository.getApplicationById(app.id);
    assert.equal(fresh.pipeline_status, "entretien");
    assert.ok(fresh.interview_questions?.technical?.length, "questions générées à partir de l'offre et du CV");
  }
  assert.ok(h.mails.filter((m) => /Invitation à un entretien/.test(m.subject)).length >= 3);
});

test("final score = AI score (/100) + interview score (/50) + HR score (/20), ranked per offer", async (t) => {
  const h = harness(t);
  const job = await createJob(h, null);
  const first = await apply(h, job, "Premier Candidat");
  const second = await apply(h, job, "Second Candidat");
  const ai = first.match_score;
  assert.ok(Number.isFinite(ai));

  const plan = await h.api.post(`/api/admin/recrutement/offres/${job.id}/entretiens-groupes`).set(rh).send({
    application_ids: [first.id, second.id], start_at: new Date(Date.now() + DAY).toISOString(), interviewer_email: "rh@example.test"
  });
  const interviewId = plan.body.created.find((c) => c.application_id === second.id).entretien.id;

  const tooHigh = await h.api.post(`/api/admin/recrutement/candidatures/${second.id}/evaluations`).set(rh)
    .send({ interview_id: interviewId, technical: 11, communication: 5, motivation: 5, experience: 5, adaptability: 5 });
  assert.equal(tooHigh.statusCode, 400);

  const evaluation = await h.api.post(`/api/admin/recrutement/candidatures/${second.id}/evaluations`).set(rh)
    .send({ interview_id: interviewId, technical: 9, communication: 8, motivation: 8, experience: 7, adaptability: 8, recommendation: "favorable" });
  assert.equal(evaluation.statusCode, 201);
  assert.equal(evaluation.body.evaluation.total, 40);

  assert.equal((await h.api.patch(`/api/admin/recrutement/candidatures/${second.id}/score-rh`).set(rh).send({ score: 21 })).statusCode, 400);
  const scored = await h.api.patch(`/api/admin/recrutement/candidatures/${second.id}/score-rh`).set(rh).send({ score: 15, comment: "Très motivé" });
  assert.equal(scored.statusCode, 200);
  assert.equal(scored.body.candidature.hr_score, 15);
  assert.equal(scored.body.candidature.interview_score, 40);
  assert.equal(scored.body.candidature.final_score, ai + 40 + 15);
  assert.equal(scored.body.candidature.final_complete, true);

  const ranking = await h.api.get(`/api/admin/recrutement/offres/${job.id}/classement`).set(rh);
  assert.deepEqual(ranking.body.candidatures.map((c) => c.rank), [1, 2]);
  assert.equal(ranking.body.candidatures[0].id, second.id);
  assert.equal(ranking.body.candidatures[0].final_score, ai + 55);
  assert.equal(ranking.body.candidatures[1].final_score, ai);
  assert.deepEqual(ranking.body.maximums, { ia: 100, entretien: 50, rh: 20, final: 170 });

  const reader = await h.api.patch(`/api/admin/recrutement/candidatures/${second.id}/score-rh`).send({ score: 3 });
  assert.equal(reader.statusCode, 401);
});

test("legacy /25 evaluations are migrated to the /50 scale and scores are recomputed", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE recruitment_jobs (id INTEGER PRIMARY KEY, slug TEXT);
    CREATE TABLE recruitment_applications (id INTEGER PRIMARY KEY, job_id INTEGER, match_score INTEGER, processing_status TEXT, analysis_json TEXT);
    CREATE TABLE recruitment_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, interview_id INTEGER NOT NULL, application_id INTEGER NOT NULL, evaluator TEXT NOT NULL,
      technical INTEGER NOT NULL CHECK (technical BETWEEN 1 AND 5), communication INTEGER NOT NULL CHECK (communication BETWEEN 1 AND 5),
      motivation INTEGER NOT NULL CHECK (motivation BETWEEN 1 AND 5), experience INTEGER NOT NULL CHECK (experience BETWEEN 1 AND 5),
      adaptability INTEGER NOT NULL CHECK (adaptability BETWEEN 1 AND 5), total INTEGER NOT NULL,
      recommendation TEXT NOT NULL DEFAULT 'reserve', comment TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (interview_id, evaluator));
    INSERT INTO recruitment_jobs VALUES (1, 'x');
    INSERT INTO recruitment_applications (id, job_id, match_score) VALUES (1, 1, 70);
    INSERT INTO recruitment_evaluations (interview_id, application_id, evaluator, technical, communication, motivation, experience, adaptability, total) VALUES (1, 1, 'a', 4, 4, 3, 5, 4, 20);
  `);
  ensureRecruitmentSchema(db);
  ensureRecruitmentSchema(db); // idempotent
  const evaluation = db.prepare("SELECT * FROM recruitment_evaluations").get();
  assert.equal(evaluation.technical, 8);
  assert.equal(evaluation.total, 40);
  assert.doesNotThrow(() => db.prepare("UPDATE recruitment_evaluations SET technical = 10").run());
  const application = db.prepare("SELECT interview_score, final_score FROM recruitment_applications").get();
  assert.equal(application.interview_score, 40);
  assert.equal(application.final_score, 110);
  db.close();
});

test("applying requires a complete candidate account; the reference is shown everywhere", async (t) => {
  const h = harness(t);
  const job = await createJob(h, null);
  const cv = (r) => r.attach("cv", pdf, { filename: "cv.pdf", contentType: "application/pdf" }).field("consent", "true");

  const anonymous = await cv(h.api.post(`/api/recrutement/offres/${job.public_id}/candidatures`));
  assert.equal(anonymous.statusCode, 401);
  assert.equal(anonymous.body.code, "account_required");

  const incomplete = await h.api.post("/api/recrutement/compte/inscription").send({ email: "x@example.test", password: "MotDePasse2026", full_name: "X", consent: true });
  assert.equal(incomplete.statusCode, 400);
  assert.match(incomplete.body.error, /téléphone/i);

  const agent = request.agent(h.app);
  await agent.post("/api/recrutement/compte/inscription").send({ email: "Aina@Example.Test", password: "MotDePasse2026", full_name: "Aina Rakoto", phone: "034", candidate_location: "Tana", consent: true });
  // Un profil vidé n'autorise plus à postuler.
  h.db.prepare("UPDATE recruitment_accounts SET phone = NULL").run();
  const blocked = await cv(agent.post(`/api/recrutement/offres/${job.public_id}/candidatures`));
  assert.equal(blocked.statusCode, 409);
  assert.equal(blocked.body.code, "profile_incomplete");
  assert.equal((await agent.patch("/api/recrutement/compte/moi").send({ phone: "" })).statusCode, 400);
  assert.equal((await agent.patch("/api/recrutement/compte/moi").send({ phone: "0341234567" })).statusCode, 200);

  const posted = await cv(agent.post(`/api/recrutement/offres/${job.public_id}/candidatures`).field("full_name", "Autre Nom").field("email", "autre@example.test"));
  assert.equal(posted.statusCode, 202, JSON.stringify(posted.body));
  const reference = posted.body.reference;
  assert.match(reference, /^TZR-\d{4}-\d{5}$/);

  const mine = await agent.get("/api/recrutement/compte/candidatures");
  assert.equal(mine.body.candidatures[0].reference, reference);
  const list = await h.api.get("/api/admin/recrutement/candidatures").set(rh);
  assert.equal(list.body.candidatures[0].reference, reference);
  assert.equal(list.body.candidatures[0].email.toLowerCase(), "aina@example.test", "l’identité du compte fait foi");
  const search = await h.api.get(`/api/admin/recrutement/candidatures/recherche?q=${reference}`).set(rh);
  assert.equal(search.body.total, 1);
  const mail = h.mails.find((m) => /Candidature enregistrée/.test(m.subject));
  assert.ok(mail.subject.includes(reference) && mail.text.includes(reference));
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.ok(h.mails.some((m) => /Bienvenue/.test(m.subject) && m.text.toLowerCase().includes("aina@example.test")), "e-mail de bienvenue avec l'identifiant");
});

test("legacy applications receive a reference on migration", () => {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE recruitment_jobs (id INTEGER PRIMARY KEY, slug TEXT);
    CREATE TABLE recruitment_applications (id INTEGER PRIMARY KEY, job_id INTEGER, created_at TEXT, processing_status TEXT, analysis_json TEXT);
    INSERT INTO recruitment_jobs VALUES (1, 'x');
    INSERT INTO recruitment_applications (id, job_id, created_at) VALUES (7, 1, '2025-03-02 10:00:00'), (12, 1, '2026-01-05 08:00:00');
  `);
  ensureRecruitmentSchema(db);
  assert.deepEqual(db.prepare("SELECT reference FROM recruitment_applications ORDER BY id").all().map((r) => r.reference), ["TZR-2025-00007", "TZR-2026-00012"]);
  db.close();
});
