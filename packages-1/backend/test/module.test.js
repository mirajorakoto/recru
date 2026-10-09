const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");
const express = require("express");
const request = require("supertest");
const { createRecruitmentModule, runMigrations } = require("../src");
const { createOpenAiService } = require("../src/ai");
const { encryptDocument, validateCandidateDocument } = require("../src/security");
const { createAnalysisWorker, createPurgeScheduler, purgeExpiredApplications } = require("../src/worker");

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "techzone-recruitment-"));
const db = new Database(path.join(tempDir, "test.sqlite"));
db.pragma("foreign_keys = ON");
const sentEmails = [];
const aiService = {
  model: "test-analysis-model",
  async analyzeApplication({ job, files }) {
    assert.ok(files[0].buffer.toString("ascii").startsWith("%PDF-"));
    return {
      summary: "Dossier à vérifier par un humain.",
      criteria: job.criteria.map((item) => ({
        criterion: item.label,
        required: item.required,
        assessment: "supported",
        evidence: "Preuve synthétique",
        source: "cv"
      })),
      missing_information: [],
      uncertainties: [],
      recommendation: "match",
      human_review_notice: true
    };
  },
  async draftSelectionEmail({ application, job }) {
    return {
      subject: `Suite — ${job.title}`,
      html: `<p>Bonjour <strong>${application.full_name}</strong></p><script>alert(1)</script>`
    };
  }
};

const moduleInstance = createRecruitmentModule({
  db,
  requireAdminSession(req, res, next) {
    if (req.get("x-test-admin") !== "yes") return res.status(401).json({ error: "Authentification admin requise." });
    req.adminUser = { email: "rh-test@techzone.lat" };
    next();
  },
  transporter: {
    async sendMail(message) {
      sentEmails.push(message);
      return { messageId: `test-${sentEmails.length}` };
    }
  },
  aiService,
  config: {
    storageDir: path.join(tempDir, "storage"),
    fileKey: Buffer.alloc(32, 9).toString("base64"),
    bypassTurnstile: true,
    applicationRateLimit: 50,
    smtpFrom: "TECH ZONE Test <contact@techzone.lat>"
  }
});

const app = express();
app.use(express.json());
app.use("/api/recrutement", moduleInstance.publicRouter);
app.use("/api/admin/recrutement", moduleInstance.adminRouter);
app.use((error, req, res, next) => {
  res.status(error.code === "LIMIT_FILE_SIZE" ? 400 : 500).json({ error: error.message });
});

const publishedJob = moduleInstance.repository.createJob({
  slug: "developpeur-test",
  title: "Développeur test",
  summary: "Offre synthétique",
  description: "Description synthétique sans donnée personnelle.",
  criteria: [{ label: "JavaScript", required: true }],
  location: "Fianarantsoa",
  work_mode: "hybrid",
  contract_type: "cdi",
  employer_type: "techzone",
  status: "published",
  urgent: false
});
moduleInstance.repository.createJob({
  slug: "brouillon-cache",
  title: "Brouillon caché",
  summary: "Invisible",
  description: "Invisible au public",
  criteria: [],
  location: "Fianarantsoa",
  work_mode: "onsite",
  contract_type: "stage",
  employer_type: "techzone",
  status: "draft"
});

const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF", "ascii");

function validDocxBuffer({ macro = false } = {}) {
  const names = ["[Content_Types].xml", "word/document.xml"];
  if (macro) names.push("word/vbaProject.bin");
  const centralEntries = [];
  let localOffset = 0;
  const localEntries = names.map((name) => {
    const fileName = Buffer.from(name);
    const body = Buffer.from("<document/>");
    const local = Buffer.alloc(30 + fileName.length + body.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(fileName.length, 26);
    fileName.copy(local, 30);
    body.copy(local, 30 + fileName.length);
    const central = Buffer.alloc(46 + fileName.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(0x14, 4);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(body.length, 24);
    central.writeUInt16LE(fileName.length, 28);
    central.writeUInt32LE(localOffset, 42);
    fileName.copy(central, 46);
    centralEntries.push(central);
    localOffset += local.length;
    return local;
  });
  const centralDirectory = Buffer.concat(centralEntries);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(localOffset, 16);
  return Buffer.concat([...localEntries, centralDirectory, end]);
}

let applicationId;

test.after(() => {
  moduleInstance.stop();
  db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("migrations are idempotent and public listing excludes drafts", async () => {
  runMigrations(db);
  runMigrations(db);
  const response = await request(app).get("/api/recrutement/offres");
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.total, 1);
  assert.equal(response.body.offres[0].slug, "developpeur-test");
});

test("all admin routes reuse the injected session middleware", async () => {
  const adminRequests = [
    request(app).get("/api/admin/recrutement/offres"),
    request(app).post("/api/admin/recrutement/offres").send({}),
    request(app).patch("/api/admin/recrutement/offres/1").send({}),
    request(app).delete("/api/admin/recrutement/offres/1"),
    request(app).get("/api/admin/recrutement/candidatures"),
    request(app).get("/api/admin/recrutement/candidatures/1"),
    request(app).get("/api/admin/recrutement/candidatures/1/events"),
    request(app).get("/api/admin/recrutement/candidatures/1/fichiers/1"),
    request(app).post("/api/admin/recrutement/candidatures/1/retry-analysis"),
    request(app).patch("/api/admin/recrutement/candidatures/1/decision").send({ decision: "selected" }),
    request(app).post("/api/admin/recrutement/candidatures/1/email-draft"),
    request(app).post("/api/admin/recrutement/candidatures/1/emails/send").send({})
  ];
  const anonymousResponses = await Promise.all(adminRequests);
  assert.ok(anonymousResponses.every((response) => response.statusCode === 401));
  const authenticated = await request(app).get("/api/admin/recrutement/offres").set("x-test-admin", "yes");
  assert.equal(authenticated.statusCode, 200);
});

test("a published offer cannot be created without objective criteria", async () => {
  const response = await request(app)
    .post("/api/admin/recrutement/offres")
    .set("x-test-admin", "yes")
    .send({
      slug: "invalid-published",
      title: "Invalide",
      summary: "Sans critère",
      description: "Ne doit pas être publiée.",
      location: "Fianarantsoa",
      work_mode: "onsite",
      contract_type: "stage",
      employer_type: "techzone",
      status: "published",
      criteria: []
    });
  assert.equal(response.statusCode, 400);
});

test("offer lifecycle forbids reopening after closure", async () => {
  const job = moduleInstance.repository.createJob({
    slug: "lifecycle-offer",
    title: "Cycle de vie",
    summary: "Offre de test",
    description: "Une description synthétique.",
    criteria: [{ label: "Critère", required: true }],
    location: "Fianarantsoa",
    work_mode: "onsite",
    contract_type: "stage",
    employer_type: "techzone",
    status: "draft",
    urgent: false
  });
  const publish = await request(app)
    .patch(`/api/admin/recrutement/offres/${job.id}`)
    .set("x-test-admin", "yes")
    .send({ status: "published" });
  assert.equal(publish.statusCode, 200);
  const close = await request(app)
    .patch(`/api/admin/recrutement/offres/${job.id}`)
    .set("x-test-admin", "yes")
    .send({ status: "closed" });
  assert.equal(close.statusCode, 200);
  const reopen = await request(app)
    .patch(`/api/admin/recrutement/offres/${job.id}`)
    .set("x-test-admin", "yes")
    .send({ status: "published" });
  assert.equal(reopen.statusCode, 400);
  assert.equal(moduleInstance.repository.getJobById(job.id).status, "closed");
});

test("deleting an absent offer returns 404 instead of a lifecycle conflict", async () => {
  const response = await request(app)
    .delete("/api/admin/recrutement/offres/999999")
    .set("x-test-admin", "yes");
  assert.equal(response.statusCode, 404);
});

test("expired ISO deadlines are absent from public routes and reject applications", async () => {
  const expired = moduleInstance.repository.createJob({
    slug: "expired-offer",
    title: "Offre expirée",
    summary: "Offre de test",
    description: "Une description synthétique.",
    criteria: [{ label: "Critère", required: true }],
    location: "Fianarantsoa",
    work_mode: "onsite",
    contract_type: "stage",
    employer_type: "techzone",
    status: "published",
    application_deadline: "2020-01-01T00:00:00.000Z",
    urgent: false
  });
  const list = await request(app).get("/api/recrutement/offres");
  assert.ok(!list.body.offres.some((job) => job.public_id === expired.public_id));
  assert.equal((await request(app).get(`/api/recrutement/offres/${expired.slug}`)).statusCode, 404);
  const application = await request(app)
    .post(`/api/recrutement/offres/${expired.public_id}/candidatures`)
    .field("full_name", "Candidate Expiré")
    .field("email", "expired@example.test")
    .field("phone", "000")
    .field("consent", "true")
    .attach("cv", pdfBuffer, { filename: "cv.pdf", contentType: "application/pdf" });
  assert.equal(application.statusCode, 410);
});

test("offer validation rejects malformed deadline, slug and optional fields", async () => {
  const response = await request(app)
    .post("/api/admin/recrutement/offres")
    .set("x-test-admin", "yes")
    .send({
      slug: "Invalid slug",
      title: "Offre invalide",
      summary: "Résumé",
      description: "Description",
      criteria: [{ label: "Critère", required: true }],
      location: "Fianarantsoa",
      work_mode: "onsite",
      contract_type: "stage",
      employer_type: "techzone",
      status: "published",
      application_deadline: "pas-une-date",
      reply_to: "not-an-email",
      urgent: "false"
    });
  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /slug/i);
});

test("DOCX inspection accepts a bounded structure and rejects a corrupt directory", () => {
  const valid = validDocxBuffer();
  assert.equal(
    validateCandidateDocument({ originalname: "cv.docx", buffer: valid }, 1024),
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  const corrupt = Buffer.from(valid);
  corrupt.writeUInt32LE(0, corrupt.length - 22);
  assert.throws(
    () => validateCandidateDocument({ originalname: "cv.docx", buffer: corrupt }, 1024),
    /corrompu/i
  );
});

test("candidate upload requires consent and rejects macro-enabled office files", async () => {
  const noConsent = await request(app)
    .post(`/api/recrutement/offres/${publishedJob.public_id}/candidatures`)
    .field("full_name", "Candidate Sans Consentement")
    .field("email", "no-consent@example.test")
    .field("phone", "000")
    .attach("cv", pdfBuffer, { filename: "cv.pdf", contentType: "application/pdf" });
  assert.equal(noConsent.statusCode, 400);

  const macro = await request(app)
    .post(`/api/recrutement/offres/${publishedJob.public_id}/candidatures`)
    .field("full_name", "Candidate Macro")
    .field("email", "macro@example.test")
    .field("phone", "000")
    .field("consent", "true")
    .attach("cv", validDocxBuffer({ macro: true }), { filename: "cv.docx", contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
  assert.equal(macro.statusCode, 400);
  assert.match(macro.body.error, /macros/i);

  const fakePdf = await request(app)
    .post(`/api/recrutement/offres/${publishedJob.public_id}/candidatures`)
    .field("full_name", "Candidate Faux PDF")
    .field("email", "fake-pdf@example.test")
    .field("phone", "000")
    .field("consent", "true")
    .attach("cv", Buffer.from("not a pdf"), { filename: "cv.pdf", contentType: "application/pdf" });
  assert.equal(fakePdf.statusCode, 400);
  assert.match(fakePdf.body.error, /PDF valide/i);

  const incompletePdf = await request(app)
    .post(`/api/recrutement/offres/${publishedJob.public_id}/candidatures`)
    .field("full_name", "Candidate PDF incomplet")
    .field("email", "incomplete-pdf@example.test")
    .field("phone", "000")
    .field("consent", "true")
    .attach("cv", Buffer.from("%PDF-1.4\ntruncated", "ascii"), { filename: "cv.pdf", contentType: "application/pdf" });
  assert.equal(incompletePdf.statusCode, 400);

  const unsafeUrl = await request(app)
    .post(`/api/recrutement/offres/${publishedJob.public_id}/candidatures`)
    .field("full_name", "Candidate URL invalide")
    .field("email", "unsafe-url@example.test")
    .field("phone", "000")
    .field("portfolio_url", "javascript:alert(1)")
    .field("consent", "true")
    .attach("cv", pdfBuffer, { filename: "cv.pdf", contentType: "application/pdf" });
  assert.equal(unsafeUrl.statusCode, 400);

  assert.throws(
    () => validateCandidateDocument({ originalname: "large.pdf", mimetype: "application/pdf", size: 20, buffer: pdfBuffer }, 10),
    /taille autorisée/i
  );
});

test("valid application is encrypted, analyzed asynchronously, and downloadable only by admin", async () => {
  const response = await request(app)
    .post(`/api/recrutement/offres/${publishedJob.public_id}/candidatures`)
    .field("full_name", "Candidate Synthétique")
    .field("email", "candidate@example.test")
    .field("phone", "+261 00 000 00")
    .field("consent", "true")
    .attach("cv", pdfBuffer, { filename: "cv-synthetique.pdf", contentType: "application/pdf" });
  assert.equal(response.statusCode, 202);
  applicationId = moduleInstance.repository.listApplications()[0].id;
  const storedFile = moduleInstance.repository.listFiles(applicationId)[0];
  assert.notEqual(fs.readFileSync(storedFile.encrypted_path).subarray(0, 5).toString("ascii"), "%PDF-");
  await moduleInstance.worker.runOnce();
  const analyzed = moduleInstance.repository.getApplicationById(applicationId);
  assert.equal(analyzed.processing_status, "analysis_ready");
  assert.equal(analyzed.hr_decision, "to_review");
  assert.equal(analyzed.analysis.human_review_notice, true);
  assert.equal(Object.hasOwn(analyzed.analysis, "accepted"), false);

  const duplicate = await request(app)
    .post(`/api/recrutement/offres/${publishedJob.public_id}/candidatures`)
    .field("full_name", "Candidate Synthétique")
    .field("email", "CANDIDATE@example.test")
    .field("phone", "+261 00 000 00")
    .field("consent", "true")
    .attach("cv", pdfBuffer, { filename: "cv-synthetique.pdf", contentType: "application/pdf" });
  assert.equal(duplicate.statusCode, 409);

  const anonymousDownload = await request(app).get(`/api/admin/recrutement/candidatures/${applicationId}/fichiers/${storedFile.id}`);
  assert.equal(anonymousDownload.statusCode, 401);
  const adminDownload = await request(app)
    .get(`/api/admin/recrutement/candidatures/${applicationId}/fichiers/${storedFile.id}`)
    .set("x-test-admin", "yes");
  assert.equal(adminDownload.statusCode, 200);
  assert.equal(adminDownload.body.subarray(0, 5).toString("ascii"), "%PDF-");
  assert.equal(adminDownload.headers["cache-control"], "private, no-store");
});

test("a file id belonging to a different application cannot be downloaded", async () => {
  const otherApplication = moduleInstance.repository.createApplication(publishedJob.id, {
    full_name: "Autre Candidat",
    email: "autre-candidat@example.test",
    phone: "000"
  });
  // Keep this application out of the analysis queue: leaving it "queued"
  // would make claimNextAnalysis() pick it up ahead of applications created
  // later by other tests (it orders by created_at ASC), breaking their
  // assertions about which application the worker processed.
  db.prepare("UPDATE recruitment_applications SET processing_status='analysis_ready' WHERE id=?").run(otherApplication.id);

  const ownFile = moduleInstance.repository.listFiles(applicationId)[0];
  const crossedRequest = await request(app)
    .get(`/api/admin/recrutement/candidatures/${otherApplication.id}/fichiers/${ownFile.id}`)
    .set("x-test-admin", "yes");
  assert.equal(crossedRequest.statusCode, 404);
});

test("a decryption failure never leaks the server storage path", async () => {
  const brokenApplication = moduleInstance.repository.createApplication(publishedJob.id, {
    full_name: "Candidat Fichier Corrompu",
    email: "corrompu@example.test",
    phone: "000"
  });
  // Keep out of the analysis queue for the same reason as above.
  db.prepare("UPDATE recruitment_applications SET processing_status='analysis_ready' WHERE id=?").run(brokenApplication.id);

  const encrypted = encryptDocument({
    buffer: pdfBuffer,
    storageDir: path.join(tempDir, "storage"),
    key: Buffer.alloc(32, 9),
    applicationPublicId: brokenApplication.public_id,
    kind: "cv"
  });
  const storedFile = moduleInstance.repository.addFile(brokenApplication.id, {
    kind: "cv",
    original_name: "cv-corrompu.pdf",
    mime_type: "application/pdf",
    size_bytes: pdfBuffer.length,
    ...encrypted
  });
  // Corrupt the ciphertext so decryption fails at the crypto layer, the
  // same failure mode as a missing key or a damaged file on disk.
  fs.writeFileSync(encrypted.encrypted_path, Buffer.from("corrupted-ciphertext"));

  const response = await request(app)
    .get(`/api/admin/recrutement/candidatures/${brokenApplication.id}/fichiers/${storedFile.id}`)
    .set("x-test-admin", "yes");
  assert.equal(response.statusCode, 500);
  assert.ok(
    !JSON.stringify(response.body).includes(tempDir),
    "error response must never contain the server storage path"
  );
});

test("candidature event history is available to admins and requires a session", async () => {
  const anonymous = await request(app).get(`/api/admin/recrutement/candidatures/${applicationId}/events`);
  assert.equal(anonymous.statusCode, 401);

  const response = await request(app)
    .get(`/api/admin/recrutement/candidatures/${applicationId}/events`)
    .set("x-test-admin", "yes");
  assert.equal(response.statusCode, 200);
  const types = response.body.evenements.map((event) => event.event_type);
  assert.ok(types.includes("application_received"));
  assert.ok(!JSON.stringify(response.body).match(/\.enc/), "event history must never leak file paths");
});

test("retry requests are recorded without sensitive event data", async () => {
  db.prepare("UPDATE recruitment_applications SET processing_status='analysis_failed' WHERE id=?").run(applicationId);
  const response = await request(app)
    .post(`/api/admin/recrutement/candidatures/${applicationId}/retry-analysis`)
    .set("x-test-admin", "yes")
    .send({});
  assert.equal(response.statusCode, 202);
  const events = await request(app)
    .get(`/api/admin/recrutement/candidatures/${applicationId}/events`)
    .set("x-test-admin", "yes");
  const retry = events.body.evenements.find((event) => event.event_type === "analysis_retry_requested");
  assert.ok(retry);
  assert.equal(retry.details, null);
  db.prepare("UPDATE recruitment_applications SET processing_status='analysis_ready' WHERE id=?").run(applicationId);

  const incompatible = await request(app)
    .post(`/api/admin/recrutement/candidatures/${applicationId}/retry-analysis`)
    .set("x-test-admin", "yes")
    .send({});
  assert.equal(incompatible.statusCode, 409);
});

test("selection email is sanitized, manually confirmed, and idempotent", async () => {
  const rejectedDraft = await request(app)
    .post(`/api/admin/recrutement/candidatures/${applicationId}/email-draft`)
    .set("x-test-admin", "yes")
    .send({});
  assert.equal(rejectedDraft.statusCode, 409);

  const decision = await request(app)
    .patch(`/api/admin/recrutement/candidatures/${applicationId}/decision`)
    .set("x-test-admin", "yes")
    .send({ decision: "selected" });
  assert.equal(decision.statusCode, 200);

  const draft = await request(app)
    .post(`/api/admin/recrutement/candidatures/${applicationId}/email-draft`)
    .set("x-test-admin", "yes")
    .send({});
  assert.equal(draft.statusCode, 200);
  assert.doesNotMatch(draft.body.draft.html, /script/i);

  const payload = {
    confirmed: true,
    idempotency_key: "application-selection-v1",
    subject: draft.body.draft.subject,
    html: `${draft.body.draft.html}<img src=x onerror=alert(1)>`
  };
  const unconfirmed = await request(app)
    .post(`/api/admin/recrutement/candidatures/${applicationId}/emails/send`)
    .set("x-test-admin", "yes")
    .send({ ...payload, confirmed: false });
  assert.equal(unconfirmed.statusCode, 409);

  const [first, second] = await Promise.all([
    request(app).post(`/api/admin/recrutement/candidatures/${applicationId}/emails/send`).set("x-test-admin", "yes").send(payload),
    request(app).post(`/api/admin/recrutement/candidatures/${applicationId}/emails/send`).set("x-test-admin", "yes").send(payload)
  ]);
  const statuses = [first.statusCode, second.statusCode].sort();
  assert.ok(
    JSON.stringify(statuses) === JSON.stringify([200, 200]) ||
      JSON.stringify(statuses) === JSON.stringify([200, 409])
  );
  assert.equal(sentEmails.length, 1);
  assert.doesNotMatch(sentEmails[0].html, /img|onerror/i);
});

test("Responses API uses direct files, store false, and a strict human-review schema", async () => {
  const calls = [];
  const service = createOpenAiService({
    model: "gpt-5.4-nano-2026-03-17",
    client: { responses: { async create(payload) {
      calls.push(payload);
      return { output_text: JSON.stringify({
        summary: "Preuves à revoir.",
        criteria: [{ criterion: "JavaScript", required: true, assessment: "uncertain", evidence: "", source: "none" }],
        missing_information: ["Expérience non prouvée"],
        uncertainties: ["Document synthétique"],
        recommendation: "uncertain",
        human_review_notice: true
      }) };
    } } }
  });
  const result = await service.analyzeApplication({
    application: { full_name: "Candidate Test" },
    job: { title: "Développeur", criteria: [{ label: "JavaScript", required: true }] },
    files: [{ original_name: "cv.pdf", mime_type: "application/pdf", buffer: pdfBuffer }]
  });
  assert.equal(result.human_review_notice, true);
  assert.equal(calls[0].store, false);
  assert.equal(calls[0].input[1].content[1].type, "input_file");
  assert.match(calls[0].input[0].content[0].text, /untrusted data/i);
  assert.equal(calls[0].text.format.strict, true);
  assert.equal(Object.hasOwn(calls[0].text.format.schema.properties, "decision"), false);
});

test("analysis failures retry at most three times and never change the HR decision", async () => {
  const retryApplication = moduleInstance.repository.createApplication(publishedJob.id, {
    full_name: "Candidate Erreur IA",
    email: "retry@example.test",
    phone: "000"
  });
  const failingWorker = createAnalysisWorker({
    repository: moduleInstance.repository,
    aiService: { model: "failing-test-model", async analyzeApplication() { throw new Error("timeout pour candidate-private@example.test"); } },
    encryptionKey: Buffer.alloc(32, 9)
  });
  await failingWorker.runOnce();
  await failingWorker.runOnce();
  await failingWorker.runOnce();
  const failed = moduleInstance.repository.getApplicationById(retryApplication.id);
  assert.equal(failed.processing_status, "analysis_failed");
  assert.equal(failed.analysis_attempts, 3);
  assert.equal(failed.hr_decision, "to_review");
  assert.equal(failed.analysis_error, "L'analyse n'a pas pu être effectuée. Une vérification RH est requise.");
  assert.equal(JSON.stringify(moduleInstance.repository.listEvents(retryApplication.id).at(-1).details).includes("candidate-private@example.test"), false);
});

test("only one worker claims an application when workers run concurrently", async () => {
  const job = moduleInstance.repository.createJob({
    slug: "concurrent-analysis",
    title: "Analyse concurrente",
    summary: "Offre de test",
    description: "Une description synthétique.",
    criteria: [{ label: "Critère", required: true }],
    location: "Fianarantsoa",
    work_mode: "onsite",
    contract_type: "stage",
    employer_type: "techzone",
    status: "published",
    urgent: false
  });
  const application = moduleInstance.repository.createApplication(job.id, {
    full_name: "Candidat concurrence",
    email: "concurrency@example.test",
    phone: "000"
  });
  let calls = 0;
  const concurrentAi = {
    model: "concurrency-test",
    async analyzeApplication() {
      calls += 1;
      await new Promise((resolve) => setImmediate(resolve));
      return {
        summary: "À vérifier.",
        criteria: [],
        missing_information: [],
        uncertainties: [],
        recommendation: "uncertain",
        human_review_notice: true
      };
    }
  };
  const first = createAnalysisWorker({ repository: moduleInstance.repository, aiService: concurrentAi, encryptionKey: Buffer.alloc(32, 9) });
  const second = createAnalysisWorker({ repository: moduleInstance.repository, aiService: concurrentAi, encryptionKey: Buffer.alloc(32, 9) });
  await Promise.all([first.runOnce(), second.runOnce()]);
  assert.equal(calls, 1);
  assert.equal(moduleInstance.repository.getApplicationById(application.id).analysis_attempts, 1);
});

test("candidate lists are paginated, filtered, and exclude private analysis fields", async () => {
  const applications = ["one", "two", "three"].map((suffix) =>
    moduleInstance.repository.createApplication(publishedJob.id, {
      full_name: `Candidat pagination ${suffix}`,
      email: `pagination-${suffix}@example.test`,
      phone: "000"
    })
  );
  for (const application of applications) {
    db.prepare("UPDATE recruitment_applications SET processing_status='analysis_ready' WHERE id=?").run(application.id);
  }
  const first = await request(app)
    .get("/api/admin/recrutement/candidatures?limit=2&job_id=" + publishedJob.id + "&processing_status=analysis_ready")
    .set("x-test-admin", "yes");
  assert.equal(first.statusCode, 200);
  assert.equal(first.body.candidatures.length, 2);
  assert.equal(first.body.pagination.limit, 2);
  assert.ok(first.body.pagination.next_cursor);
  assert.ok(first.body.candidatures.every((item) => !Object.hasOwn(item, "analysis")));
  assert.ok(first.body.candidatures.every((item) => !Object.hasOwn(item, "phone")));

  const second = await request(app)
    .get(`/api/admin/recrutement/candidatures?limit=2&cursor=${encodeURIComponent(first.body.pagination.next_cursor)}`)
    .set("x-test-admin", "yes");
  assert.equal(second.statusCode, 200);
  assert.ok(second.body.candidatures.every((item) => !first.body.candidatures.some((firstItem) => firstItem.id === item.id)));

  const invalid = await request(app)
    .get("/api/admin/recrutement/candidatures?limit=101")
    .set("x-test-admin", "yes");
  assert.equal(invalid.statusCode, 400);
});

test("retention purge deletes data and encrypted files after 180 days", () => {
  const oldJob = moduleInstance.repository.createJob({
    slug: "old-closed-job",
    title: "Ancienne offre",
    summary: "Offre de purge",
    description: "Donnée synthétique",
    criteria: [{ label: "Test", required: true }],
    location: "Fianarantsoa",
    work_mode: "onsite",
    contract_type: "stage",
    employer_type: "techzone",
    status: "closed"
  });
  db.prepare("UPDATE recruitment_jobs SET closed_at=datetime('now','-181 days') WHERE id=?").run(oldJob.id);
  const oldApplication = moduleInstance.repository.createApplication(oldJob.id, {
    full_name: "Ancien candidat synthétique",
    email: "old@example.test",
    phone: "000"
  });
  const purged = purgeExpiredApplications({ repository: moduleInstance.repository, retentionDays: 180 });
  assert.equal(purged, 1);
  assert.equal(moduleInstance.repository.getApplicationById(oldApplication.id), null);
});

test("scheduled retention purge is started once, observable, and stoppable", () => {
  const oldJob = moduleInstance.repository.createJob({
    slug: "scheduled-old-job",
    title: "Purge programmée",
    summary: "Offre de purge",
    description: "Donnée synthétique",
    criteria: [{ label: "Test", required: true }],
    location: "Fianarantsoa",
    work_mode: "onsite",
    contract_type: "stage",
    employer_type: "techzone",
    status: "closed"
  });
  db.prepare("UPDATE recruitment_jobs SET closed_at=datetime('now','-181 days') WHERE id=?").run(oldJob.id);
  const oldApplication = moduleInstance.repository.createApplication(oldJob.id, {
    full_name: "Candidat planifié",
    email: "scheduled-old@example.test",
    phone: "000"
  });
  let scheduled;
  let cleared = false;
  const scheduler = createPurgeScheduler({
    repository: moduleInstance.repository,
    retentionDays: 180,
    intervalMs: 1,
    setIntervalImpl(callback) {
      scheduled = callback;
      return { unref() {} };
    },
    clearIntervalImpl() { cleared = true; }
  });
  const result = scheduler.start();
  assert.equal(result.purged, 1);
  assert.equal(moduleInstance.repository.getApplicationById(oldApplication.id), null);
  scheduled();
  assert.equal(scheduler.getLastResult().error, null);
  scheduler.stop();
  assert.equal(cleared, true);
});
