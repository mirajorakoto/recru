/**
 * Tests d'intégration (CDC §33) : API HTTP réelle + SQLite en mémoire.
 * Lancer : node --test test/recruitment-cdc.integration.test.js
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");
const Database = require("better-sqlite3");
const nodemailer = require("nodemailer");
const { createRepository } = require("../src/repository");
const { createRouters } = require("../src/routes");
const { buildAnalysis, createTestAiService } = require("../src/ai");
const { runMigrations } = require("../src/migrations/runner");

const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const future = () => new Date(Date.now() + 30 * 864e5).toISOString();

async function boot() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db); // migrations réelles du module
  const repository = createRepository(db);
  const outbox = [];
  const transporter = { async sendMail(message) { outbox.push(message); return { messageId: `m${outbox.length}` }; } };
  const aiService = createTestAiService();
  const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "rec-"));
  const config = { storageDir, maxFileMb: 5, bypassTurnstile: true, smtpFrom: "TZ <rh@example.mg>", applicationRateLimit: 100, authRateLimit: 100 };
  const routers = createRouters({ repository, config, encryptionKey: Buffer.alloc(32, 7), aiService, transporter });
  const app = express();
  app.use(express.json());
  app.use("/pub", routers.publicRouter);
  app.use("/adm", (req, res, next) => { req.adminUser = { email: req.get("x-user") || "admin@example.mg" }; next(); }, routers.adminRouter);
  app.use((error, req, res, next) => res.status(500).json({ error: error.message }));
  const server = await new Promise((resolve) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (prefix, method, url, { body, user, cookie, form } = {}) => {
    const headers = {};
    if (user) headers["x-user"] = user;
    if (cookie) headers.cookie = cookie;
    if (body) headers["content-type"] = "application/json";
    const response = await fetch(`${base}/${prefix}${url}`, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
    const text = await response.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    return { status: response.status, json, headers: response.headers };
  };
  return { db, repository, outbox, aiService, storageDir, call, close: () => server.close() };
}

function cvForm(fields) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append("cv", new Blob([PDF], { type: "application/pdf" }), "cv.pdf");
  return form;
}

async function analyze(ctx) {
  const claimed = ctx.repository.claimNextAnalysis();
  assert.ok(claimed, "une candidature doit être en file d'analyse");
  const application = ctx.repository.getApplicationById(claimed.id);
  const job = ctx.repository.getJobById(application.job_id);
  const analysis = await ctx.aiService.analyzeApplication({ application, job, files: [] });
  ctx.repository.completeAnalysis(application.id, analysis, ctx.aiService.model);
  return application.id;
}

test("parcours complet de la soutenance (CDC §37)", async (t) => {
  const ctx = await boot();
  t.after(() => ctx.close());
  const { call } = ctx;

  // 1. Le recruteur crée et publie une offre complète (§9)
  const job = await call("adm", "POST", "/offres", { body: {
    slug: "dev-fullstack-junior", title: "Développeur Full Stack Junior", summary: "Rejoignez l'équipe", description: "Description détaillée",
    location: "Antananarivo", status: "published", application_deadline: future(), department: "Technique", required_diploma: "bac+3",
    required_experience: "0–2 ans", seniority: "junior", languages: ["Français", "Anglais"],
    criteria: [{ label: "Java", required: true, category: "competence" }, { label: "SQL", required: true, category: "competence" }, { label: "React", required: false, category: "competence" }]
  } });
  assert.equal(job.status, 201, JSON.stringify(job.json));
  const publicId = job.json.offre.public_id;
  const listed = await call("pub", "GET", "/offres");
  assert.equal(listed.json.offres[0].department, "Technique");

  // 2. Le candidat crée son compte, se déconnecte, se reconnecte (§8)
  const weak = await call("pub", "POST", "/compte/inscription", { body: { email: "aina@example.mg", password: "court", full_name: "Aina R", consent: true } });
  assert.equal(weak.status, 400);
  const registered = await call("pub", "POST", "/compte/inscription", { body: { email: "aina@example.mg", password: "motdepasse12", full_name: "Aina R", phone: "+261 34 00 000 00", consent: true } });
  assert.equal(registered.status, 201);
  assert.ok(!("password_hash" in registered.json.compte), "le hash ne doit jamais sortir");
  const duplicate = await call("pub", "POST", "/compte/inscription", { body: { email: "AINA@example.mg", password: "motdepasse12", full_name: "Aina", consent: true } });
  assert.equal(duplicate.status, 409);
  assert.equal((await call("pub", "POST", "/compte/connexion", { body: { email: "aina@example.mg", password: "mauvais" } })).status, 401);
  const login = await call("pub", "POST", "/compte/connexion", { body: { email: "aina@example.mg", password: "motdepasse12" } });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.ok(/HttpOnly/i.test(login.headers.get("set-cookie")));
  assert.equal((await call("pub", "GET", "/compte/moi", { cookie })).json.compte.email, "aina@example.mg");
  assert.equal((await call("pub", "GET", "/compte/moi")).status, 401);

  // 3. Il dépose son CV et postule (§12), une notification est enregistrée (§24)
  const applied = await call("pub", "POST", `/offres/${publicId}/candidatures`, { cookie, form: cvForm({ phone: "+261 34 00 000 00", consent: "true" }) });
  assert.equal(applied.status, 202, JSON.stringify(applied.json));
  const notifications = await call("pub", "GET", "/compte/notifications", { cookie });
  assert.equal(notifications.json.notifications[0].title, "Candidature enregistrée");
  assert.equal(notifications.json.unread, 1);
  assert.equal((await call("pub", "POST", "/compte/notifications/lues", { cookie, body: {} })).json.changed, 1);
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(ctx.outbox.some((mail) => /Candidature enregistrée/.test(mail.subject) && /jusqu'au/.test(mail.text)), "accusé de réception automatique, avec la date limite");
  const mine = await call("pub", "GET", "/compte/candidatures", { cookie });
  assert.equal(mine.json.candidatures.length, 1);

  // Un CV invalide est refusé
  const badForm = new FormData();
  badForm.append("consent", "true"); badForm.append("full_name", "X"); badForm.append("email", "x@example.mg"); badForm.append("phone", "1");
  badForm.append("cv", new Blob(["pas un pdf"], { type: "application/pdf" }), "cv.pdf");
  assert.equal((await call("pub", "POST", `/offres/${publicId}/candidatures`, { form: badForm })).status, 400);

  // 4. L'IA analyse ; le recruteur consulte le dossier et le score explicable (§15-17)
  const applicationId = await analyze(ctx);
  const detail = await call("adm", "GET", `/candidatures/${applicationId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.candidature.processing_status, "analysis_ready");
  assert.ok(detail.json.candidature.analysis.score.components.length >= 1);
  assert.ok(Number.isFinite(detail.json.candidature.analysis.score.total));
  assert.ok(!("analysis_json" in detail.json.candidature));
  assert.equal(detail.json.fichiers.length, 1);
  assert.ok(!("encrypted_path" in detail.json.fichiers[0]));

  // 5. Questions d'entretien (§18) et note RH
  const questions = await call("adm", "POST", `/candidatures/${applicationId}/interview-questions`);
  assert.equal(questions.status, 200);
  assert.ok(questions.json.questions.technical.length >= 1);
  await call("adm", "POST", `/candidatures/${applicationId}/notes`, { body: { text: "Profil à approfondir" } });
  const withNote = await call("adm", "GET", `/candidatures/${applicationId}`);
  assert.equal(withNote.json.candidature.notes[0].text, "Profil à approfondir");

  // 6. Pipeline et décision humaine (§11)
  assert.equal((await call("adm", "PATCH", `/candidatures/${applicationId}/pipeline`, { body: { status: "n'importe quoi" } })).status, 400);
  const pre = await call("adm", "PATCH", `/candidatures/${applicationId}/pipeline`, { body: { status: "preselectionnee" } });
  assert.equal(pre.json.candidature.pipeline_status, "preselectionnee");
  const afterPipeline = await call("pub", "GET", "/compte/notifications", { cookie });
  assert.ok(afterPipeline.json.notifications.some((n) => n.title === "Candidature présélectionnée"));

  // 7. Entretien (§20) : bloqué tant que la date limite de dépôt n'est pas passée
  const slot = new Date(Date.now() + 5 * 864e5).toISOString();
  const locked = await call("adm", "POST", "/entretiens", { body: { application_id: applicationId, scheduled_at: slot, interviewer_email: "rh@example.mg" } });
  assert.equal(locked.status, 409);
  assert.match(locked.json.error, /date limite/);
  assert.equal(locked.json.interviews_unlocked, false);
  assert.equal((await call("adm", "GET", `/candidatures/${applicationId}`)).json.candidature.interviews_unlocked, false);
  // La date limite passe (ou l'offre est clôturée) : la planification se débloque.
  assert.equal((await call("adm", "PATCH", `/offres/${job.json.offre.id}`, { body: { status: "closed" } })).status, 200);
  const interview = await call("adm", "POST", "/entretiens", { body: { application_id: applicationId, scheduled_at: slot, duration_min: 45, mode: "visio", location: "https://meet.example/abc", interviewer_email: "rh@example.mg" } });
  assert.equal(interview.status, 201, JSON.stringify(interview.json));
  assert.equal((await call("adm", "POST", "/entretiens", { body: { application_id: applicationId, scheduled_at: slot, interviewer_email: "rh@example.mg" } })).status, 409);
  const convocations = await call("pub", "GET", "/compte/entretiens", { cookie });
  assert.equal(convocations.json.entretiens.length, 1);
  assert.ok((await call("pub", "GET", "/compte/notifications", { cookie })).json.notifications.some((n) => n.type === "interview"));
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.ok(ctx.outbox.some((mail) => /Entretien programmé/.test(mail.subject)), "la convocation part aussi par email");
  const moved = await call("adm", "PATCH", `/entretiens/${interview.json.entretien.id}`, { body: { scheduled_at: new Date(Date.now() + 6 * 864e5).toISOString() } });
  assert.equal(moved.status, 200);

  // 8. Évaluation (§21)
  const bad = await call("adm", "POST", `/candidatures/${applicationId}/evaluations`, { body: { technical: 11, communication: 3, motivation: 3, experience: 3, adaptability: 3 } });
  assert.equal(bad.status, 400);
  const evaluation = await call("adm", "POST", `/candidatures/${applicationId}/evaluations`, { body: { technical: 8, communication: 8, motivation: 9, experience: 7, adaptability: 8, recommendation: "favorable", comment: "Solide", interview_id: interview.json.entretien.id } });
  assert.equal(evaluation.status, 201);
  assert.equal(evaluation.json.evaluation.total, 40, "score d'entretien /50");
  assert.equal((await call("adm", "GET", `/candidatures/${applicationId}`)).json.candidature.pipeline_status, "evaluation");

  // 9. Recherche multicritère (§23), tableau de bord (§22)
  const search = await call("adm", "GET", "/candidatures/recherche?skills=java,sql&limit=10");
  assert.equal(search.status, 200);
  assert.equal(search.json.total >= 0, true);
  const dash = await call("adm", "GET", "/tableau-de-bord");
  assert.equal(dash.json.totals.candidatures, 1);
  assert.equal(dash.json.totals.entretiens, 1);

  // 10. Décision finale humaine
  assert.equal((await call("adm", "PATCH", `/candidatures/${applicationId}/pipeline`, { body: { status: "acceptee" } })).status, 200);

  // 11. Journal d'audit réservé à l'administrateur (§30-31)
  const audit = await call("adm", "GET", "/audit?limit=100");
  const types = audit.json.events.map((event) => event.event_type);
  for (const expected of ["application_received", "hr_viewed", "interview_scheduled", "evaluation_submitted", "pipeline_status_changed"]) {
    assert.ok(types.includes(expected), `événement manquant : ${expected}`);
  }
});

test("rôles et permissions (CDC §7, §30)", async (t) => {
  const ctx = await boot();
  t.after(() => ctx.close());
  const { call } = ctx;
  // Amorçage : tant qu'aucun admin n'existe, l'admin hôte a tous les droits.
  assert.equal((await call("adm", "POST", "/equipe", { body: { email: "admin@example.mg", role: "admin" } })).status, 201);
  await call("adm", "POST", "/equipe", { body: { email: "rec@example.mg", role: "recruteur" } });
  await call("adm", "POST", "/equipe", { body: { email: "lect@example.mg", role: "lecteur" } });
  await call("adm", "POST", "/equipe", { body: { email: "off@example.mg", role: "recruteur", active: false } });

  assert.equal((await call("adm", "GET", "/moi", { user: "lect@example.mg" })).json.role, "lecteur");
  assert.equal((await call("adm", "GET", "/offres", { user: "lect@example.mg" })).status, 200);
  assert.equal((await call("adm", "POST", "/offres", { user: "lect@example.mg", body: {} })).status, 403);
  assert.equal((await call("adm", "GET", "/audit", { user: "rec@example.mg" })).status, 403);
  assert.equal((await call("adm", "GET", "/equipe", { user: "rec@example.mg" })).status, 403);
  assert.equal((await call("adm", "GET", "/audit", { user: "admin@example.mg" })).status, 200);
  assert.equal((await call("adm", "GET", "/offres", { user: "off@example.mg" })).status, 403);
  // Le dernier administrateur ne peut pas être retiré.
  const last = await call("adm", "POST", "/equipe", { user: "admin@example.mg", body: { email: "admin@example.mg", role: "lecteur" } });
  assert.equal(last.status, 409);
});

test("mot de passe oublié, changement de mot de passe, effacement (CDC §8, §31)", async (t) => {
  const ctx = await boot();
  t.after(() => ctx.close());
  const { call } = ctx;
  const reg = await call("pub", "POST", "/compte/inscription", { body: { email: "n@example.mg", password: "motdepasse12", full_name: "N", consent: true } });
  const cookie = reg.headers.get("set-cookie").split(";")[0];

  const unknown = await call("pub", "POST", "/compte/mot-de-passe-oublie", { body: { email: "inconnu@example.mg" } });
  assert.equal(unknown.status, 202);
  assert.equal(ctx.outbox.length, 0, "aucun email pour un compte inexistant");
  assert.equal((await call("pub", "POST", "/compte/mot-de-passe-oublie", { body: { email: "n@example.mg" } })).status, 202);
  const token = /token=([\w-]+)/.exec(ctx.outbox[0].text)[1];
  assert.equal((await call("pub", "POST", "/compte/reinitialisation", { body: { token: "faux", password: "nouveaumdp123" } })).status, 400);
  assert.equal((await call("pub", "POST", "/compte/reinitialisation", { body: { token, password: "nouveaumdp123" } })).status, 200);
  assert.equal((await call("pub", "POST", "/compte/reinitialisation", { body: { token, password: "autremdp12345" } })).status, 400, "le lien ne sert qu'une fois");
  assert.equal((await call("pub", "GET", "/compte/moi", { cookie })).status, 401, "les anciennes sessions sont révoquées");
  const relog = await call("pub", "POST", "/compte/connexion", { body: { email: "n@example.mg", password: "nouveaumdp123" } });
  assert.equal(relog.status, 200);
  const cookie2 = relog.headers.get("set-cookie").split(";")[0];

  assert.equal((await call("pub", "POST", "/compte/mot-de-passe", { cookie: cookie2, body: { current_password: "faux", new_password: "encoreunautre1" } })).status, 403);
  assert.equal((await call("pub", "PATCH", "/compte/moi", { cookie: cookie2, body: { phone: "034 11 222 33" } })).json.compte.phone, "034 11 222 33");
  assert.equal((await call("pub", "DELETE", "/compte", { cookie: cookie2, body: { password: "faux" } })).status, 403);
  assert.equal((await call("pub", "DELETE", "/compte", { cookie: cookie2, body: { password: "nouveaumdp123" } })).status, 204);
  assert.equal((await call("pub", "POST", "/compte/connexion", { body: { email: "n@example.mg", password: "nouveaumdp123" } })).status, 401);
});

test("administration : dépôt par un recruteur, effacement, désactivation de compte", async (t) => {
  const ctx = await boot();
  t.after(() => ctx.close());
  const { call } = ctx;
  const job = await call("adm", "POST", "/offres", { body: { slug: "support", title: "Support", summary: "s", description: "d", location: "Tana", status: "published", application_deadline: future(), criteria: [{ label: "Communication", required: true }] } });
  const form = cvForm({ job_id: String(job.json.offre.id), full_name: "Hery", email: "hery@example.mg", phone: "034", consent: "true" });
  const created = await call("adm", "POST", "/candidatures", { form });
  assert.equal(created.status, 201, JSON.stringify(created.json));
  assert.equal((await call("adm", "POST", "/candidatures", { form: cvForm({ job_id: String(job.json.offre.id), full_name: "Hery", email: "h2@example.mg" }) })).status, 400, "consentement obligatoire");
  const id = created.json.candidature.id;
  assert.equal((await call("adm", "DELETE", `/candidatures/${id}`)).status, 204);
  assert.equal((await call("adm", "GET", `/candidatures/${id}`)).status, 404);
  assert.deepEqual(fs.readdirSync(ctx.storageDir), [], "les CV chiffrés sont supprimés avec le dossier");

  const reg = await call("pub", "POST", "/compte/inscription", { body: { email: "c@example.mg", password: "motdepasse12", full_name: "C", consent: true } });
  const cookie = reg.headers.get("set-cookie").split(";")[0];
  const accountId = reg.json.compte.id;
  assert.equal((await call("adm", "POST", `/comptes/${accountId}/desactiver`)).json.compte.active, false);
  assert.equal((await call("pub", "GET", "/compte/moi", { cookie })).status, 401, "un compte désactivé perd sa session");
  assert.equal((await call("adm", "POST", `/comptes/${accountId}/activer`)).json.compte.active, true);
});

test("score explicable : CV fictifs forte / moyenne / faible / informations manquantes (CDC §16, §33)", () => {
  const job = { criteria: [
    { label: "Java", required: true, category: "competence" }, { label: "Spring Boot", required: true, category: "competence" },
    { label: "SQL", required: true, category: "competence" }, { label: "React", required: false, category: "competence" },
    { label: "Bac+3", required: true, category: "formation" }, { label: "Anglais", required: false, category: "langue" }
  ] };
  const profile = (years, level) => ({ skills: [], technologies: [], languages: [], certifications: [], education: [], highest_education_level: level, experience_years: years, experiences: [] });
  const make = (assessments, years, level) => buildAnalysis({
    summary: "s", profile: profile(years, level),
    criteria: job.criteria.map((item) => ({ criterion: item.label, assessment: assessments[item.label] || "not_found", evidence: "x", source: "cv" })),
    missing_information: [], uncertainties: []
  }, job);
  const strong = make({ Java: "supported", "Spring Boot": "supported", SQL: "supported", React: "supported", "Bac+3": "supported", Anglais: "supported" }, 2, "bac+3");
  const medium = make({ Java: "supported", "Spring Boot": "supported", "Bac+3": "supported" }, 1, "bac+3");
  const weak = make({ Anglais: "supported" }, 0, "bac");
  const unknown = make(Object.fromEntries(job.criteria.map((c) => [c.label, "uncertain"])), null, "non_precise");
  assert.ok(strong.score.total > medium.score.total && medium.score.total > weak.score.total);
  assert.ok(strong.score.total >= 80 && weak.score.total <= 40);
  assert.ok(unknown.score.total > weak.score.total && unknown.score.total < strong.score.total, "l'incertitude vaut moins qu'une preuve");
  assert.equal(strong.recommendation === "strong_match" || strong.recommendation === "match", true);
  for (const analysis of [strong, medium, weak, unknown]) {
    const sum = analysis.score.components.reduce((total, c) => total + c.points, 0);
    assert.ok(Math.abs(sum - analysis.score.total) <= 1.01, "le total est la somme des composantes");
    assert.ok(analysis.score.disclaimer || analysis.human_review_notice !== false);
  }
});

test("score final /170 (IA /100 + entretien /50 + note RH /20) et classement par offre", async (t) => {
  const ctx = await boot();
  t.after(() => ctx.close());
  const { call } = ctx;
  const job = await call("adm", "POST", "/offres", { body: { slug: "dev-classement", title: "Dev", summary: "s", description: "d", location: "Tana", status: "published", application_deadline: future(), criteria: [{ label: "Java", required: true }, { label: "SQL", required: true }] } });
  const jobId = job.json.offre.id;
  const publicId = job.json.offre.public_id;
  const applicants = [["Alice", "alice@example.mg"], ["Bruno", "bruno@example.mg"], ["Carla", "carla@example.mg"]];
  const ids = [];
  for (const [name, email] of applicants) {
    const applied = await call("pub", "POST", `/offres/${publicId}/candidatures`, { form: cvForm({ full_name: name, email, phone: "034", consent: "true" }) });
    assert.equal(applied.status, 202, JSON.stringify(applied.json));
    ids.push(await analyze(ctx));
  }
  // Scores IA contrôlés : Alice 60, Bruno 90, Carla 75.
  const aiScores = [60, 90, 75];
  ids.forEach((id, index) => { ctx.db.prepare("UPDATE recruitment_applications SET match_score = ? WHERE id = ?").run(aiScores[index], id); ctx.repository.recomputeScores(id); });

  // Classement après l'analyse IA : meilleur score d'abord, rang attribué.
  let ranking = await call("adm", "GET", `/offres/${jobId}/classement`);
  assert.deepEqual(ranking.json.rows.map((row) => row.full_name), ["Bruno", "Carla", "Alice"]);
  assert.deepEqual(ranking.json.rows.map((row) => row.rank), [1, 2, 3]);
  assert.deepEqual(ranking.json.maxima, { ai: 100, interview: 50, hr: 20, final: 170 });
  assert.equal(ranking.json.rows[0].scores.final, 90);
  assert.equal(ranking.json.rows[0].scores.stage, "ia");
  assert.equal(ranking.json.offre.interviews_unlocked, false);

  // Note RH /20 : validation puis recalcul du score final.
  const [alice, bruno, carla] = [ids[0], ids[1], ids[2]];
  assert.equal((await call("adm", "PATCH", `/candidatures/${alice}/score-rh`, { body: { score: 21 } })).status, 400);
  assert.equal((await call("adm", "PATCH", `/candidatures/${alice}/score-rh`, { body: { score: 20 } })).json.candidature.scores.final, 80);
  assert.equal((await call("adm", "PATCH", `/candidatures/${bruno}/score-rh`, { body: { score: 5 } })).json.candidature.scores.final, 95);

  // Convocation groupée : bloquée avant la date limite, puis débloquée par la clôture de l'offre.
  const body = { application_ids: [bruno, alice, carla], start_at: new Date(Date.now() + 4 * 864e5).toISOString(), duration_min: 30, gap_min: 10, mode: "visio", location: "https://meet.example/x", interviewer_email: "rh@example.mg" };
  const blocked = await call("adm", "POST", `/offres/${jobId}/convocations`, { body });
  assert.equal(blocked.status, 409);
  assert.match(blocked.json.error, /date limite/);
  await call("adm", "PATCH", `/offres/${jobId}`, { body: { status: "closed" } });
  assert.equal((await call("adm", "POST", `/offres/${jobId}/convocations`, { body: { ...body, application_ids: [] } })).status, 400);
  const sent = await call("adm", "POST", `/offres/${jobId}/convocations`, { body });
  assert.equal(sent.status, 201, JSON.stringify(sent.json));
  assert.equal(sent.json.created.length, 3);
  // Un créneau par candidat, dans l'ordre de la sélection, sans chevauchement (30 min + 10 min de pause).
  const times = sent.json.created.map((item) => new Date(item.scheduled_at).getTime());
  assert.deepEqual(times.map((time, index) => index && time - times[index - 1]), [0, 40 * 60000, 40 * 60000]);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const convocations = ctx.outbox.filter((mail) => /Entretien programmé/.test(mail.subject));
  assert.equal(convocations.length, 3, "un email de convocation automatique par candidat");
  // Les questions d'entretien sont préparées automatiquement par l'IA.
  for (const id of [alice, bruno, carla]) {
    const detail = await call("adm", "GET", `/candidatures/${id}`);
    assert.ok(detail.json.candidature.interview_questions?.technical?.length >= 1, "questions générées à la convocation");
    assert.equal(detail.json.candidature.pipeline_status, "entretien");
  }
  // Re-convoquer les mêmes candidats est refusé proprement.
  const again = await call("adm", "POST", `/offres/${jobId}/convocations`, { body: { ...body, application_ids: [bruno] } });
  assert.equal(again.json.skipped[0].reason, "Déjà convoqué(e).");

  // Évaluations /50 : le score d'entretien est la moyenne des totaux ; le score final cumule les trois.
  const interviewOf = async (id) => (await call("adm", "GET", `/entretiens?application_id=${id}`)).json.entretiens[0].id;
  const evaluate = async (id, marks) => call("adm", "POST", `/candidatures/${id}/evaluations`, { body: { technical: marks, communication: marks, motivation: marks, experience: marks, adaptability: marks, interview_id: await interviewOf(id), recommendation: "favorable" } });
  assert.equal((await evaluate(alice, 10)).json.evaluation.total, 50);
  assert.equal((await evaluate(bruno, 4)).json.evaluation.total, 20);
  assert.equal((await evaluate(carla, 8)).json.evaluation.total, 40);
  ranking = await call("adm", "GET", `/offres/${jobId}/classement`);
  const byName = Object.fromEntries(ranking.json.rows.map((row) => [row.full_name, row]));
  assert.equal(byName.Alice.scores.final, 60 + 50 + 20);   // 130
  assert.equal(byName.Bruno.scores.final, 90 + 20 + 5);    // 115
  assert.equal(byName.Carla.scores.final, 75 + 40);        // 115 (note RH manquante : provisoire)
  assert.equal(byName.Alice.scores.complete, true);
  assert.equal(byName.Carla.scores.complete, false);
  assert.equal(ranking.json.rows[0].full_name, "Alice", "le classement final est trié par score final");
  assert.deepEqual([byName.Bruno.rank, byName.Carla.rank], [2, 2], "ex æquo : même rang");

  // La recherche peut aussi trier par score final.
  const search = await call("adm", "GET", "/candidatures/recherche?sort=final&limit=10");
  assert.equal(search.json.rows[0].full_name, "Alice");
});

test("les anciennes évaluations (/25) sont converties en /50 sans perte (schéma existant)", () => {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  db.exec(`
    CREATE TABLE recruitment_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, interview_id INTEGER NOT NULL, application_id INTEGER NOT NULL, evaluator TEXT NOT NULL,
      technical INTEGER NOT NULL CHECK (technical BETWEEN 1 AND 5), communication INTEGER NOT NULL CHECK (communication BETWEEN 1 AND 5),
      motivation INTEGER NOT NULL CHECK (motivation BETWEEN 1 AND 5), experience INTEGER NOT NULL CHECK (experience BETWEEN 1 AND 5),
      adaptability INTEGER NOT NULL CHECK (adaptability BETWEEN 1 AND 5), total INTEGER NOT NULL,
      recommendation TEXT NOT NULL DEFAULT 'reserve', comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')), UNIQUE (interview_id, evaluator));
    INSERT INTO recruitment_jobs (public_id, slug, title, summary, description, criteria_json, location, work_mode, contract_type, employer_type, status)
      VALUES ('j', 'j', 'J', 's', 'd', '[]', 'l', 'onsite', 'cdi', 'techzone', 'published');
    INSERT INTO recruitment_applications (public_id, job_id, full_name, email, normalized_email, phone, consent_at, processing_status)
      VALUES ('a', 1, 'Old', 'o@x.mg', 'o@x.mg', '1', datetime('now'), 'analysis_ready');
    INSERT INTO recruitment_evaluations (interview_id, application_id, evaluator, technical, communication, motivation, experience, adaptability, total)
      VALUES (1, 1, 'rh', 4, 4, 5, 3, 4, 20);
  `);
  const repository = createRepository(db); // met le schéma à niveau
  const [evaluation] = repository.listEvaluations(1);
  assert.equal(evaluation.total, 40);
  assert.equal(evaluation.technical, 8);
  assert.equal(repository.getApplicationById(1).final_score, 40, "score final recalculé à la mise à niveau");
  assert.doesNotThrow(() => repository.upsertEvaluation({ interview_id: 2, application_id: 1, evaluator: "rh", technical: 10, communication: 10, motivation: 10, experience: 10, adaptability: 10 }));
});
