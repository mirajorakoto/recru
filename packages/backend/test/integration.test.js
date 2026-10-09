const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");
const express = require("express");
const request = require("supertest");
const { createRecruitmentModule } = require("../src");
const { purgeExpiredApplications } = require("../src/worker");

const pdfBuffer = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF", "ascii");
const adminHeader = { "x-e2e-rh-session": "fixture-session" };

function createHarness(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "techzone-recruitment-e2e-"));
  const storageDir = path.join(root, "encrypted-files");
  const db = new Database(path.join(root, "recruitment.sqlite"));
  db.pragma("foreign_keys = ON");
  const smtpCalls = [];
  const turnstileTokens = [];
  const recruitment = createRecruitmentModule({
    db,
    requireAdminSession(req, res, next) {
      if (req.get("x-e2e-rh-session") !== "fixture-session") {
        return res.status(401).json({ error: "Session RH requise." });
      }
      req.adminUser = { id: 42, email: "rh.integration@example.test", display_name: "RH intégration" };
      next();
    },
    transporter: {
      async sendMail(message) {
        smtpCalls.push(message);
        return { messageId: `fixture-${smtpCalls.length}` };
      }
    },
    aiService: {
      model: "integration-fixture",
      async analyzeApplication({ job, files }) {
        assert.equal(files.length, 1);
        assert.deepEqual(files[0].buffer, pdfBuffer);
        return {
          summary: "Analyse de test à vérifier par un RH.",
          criteria: job.criteria.map((criterion) => ({
            criterion: criterion.label,
            required: criterion.required,
            assessment: "uncertain",
            evidence: "Fixture de test",
            source: "cv"
          })),
          missing_information: [],
          uncertainties: ["Fixture déterministe"],
          recommendation: "uncertain",
          human_review_notice: true
        };
      },
      async draftSelectionEmail({ job }) {
        return {
          subject: `Suite de votre candidature — ${job.title}`,
          html: "<p>Bonjour <strong>candidate</strong>.</p><script>forbidden()</script>"
        };
      }
    },
    config: {
      storageDir,
      fileKey: Buffer.alloc(32, 9).toString("base64"),
      maxFileMb: 1,
      retentionDays: 180,
      turnstileSecret: "fixture-turnstile-secret",
      allowAnonymousApplications: true,
      fetchImpl: async (_url, options) => {
        const token = new URLSearchParams(options.body).get("response");
        turnstileTokens.push(token);
        return { ok: true, json: async () => ({ success: token === "e2e-turnstile-ok" }) };
      },
      smtpFrom: "TECH ZONE Intégration <integration@example.test>"
    }
  });
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/recrutement", recruitment.publicRouter);
  app.use("/api/admin/recrutement", recruitment.adminRouter);
  app.use((error, _req, res, _next) => {
    if (error?.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: "Le fichier dépasse la taille autorisée." });
    return res.status(500).json({ error: "Erreur serveur de fixture." });
  });
  t.after(() => {
    recruitment.stop();
    db.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { api: request(app), db, recruitment, smtpCalls, storageDir, turnstileTokens };
}

function publishedJobPayload(slug) {
  return {
    slug,
    title: "Développeur intégration",
    summary: "Offre synthétique de test.",
    description: "Cette offre ne contient aucune donnée réelle.",
    criteria: [{ label: "JavaScript", required: true }],
    location: "Fianarantsoa",
    work_mode: "hybrid",
    contract_type: "stage",
    employer_type: "techzone",
    status: "published",
    urgent: false
  };
}

async function createPublishedJob(harness, slug) {
  const response = await harness.api
    .post("/api/admin/recrutement/offres")
    .set(adminHeader)
    .send(publishedJobPayload(slug));
  assert.equal(response.statusCode, 201);
  return response.body.offre;
}

function submitApplication(api, jobPublicId, { email = "candidate@example.test", token = "e2e-turnstile-ok" } = {}) {
  return api
    .post(`/api/recrutement/offres/${jobPublicId}/candidatures`)
    .field("full_name", "Candidate Synthétique")
    .field("email", email)
    .field("phone", "000000000")
    .field("consent", "true")
    .field("turnstile_token", token)
    .attach("cv", pdfBuffer, { filename: "cv-synthetique.pdf", contentType: "application/pdf" });
}

test("isolated end-to-end fixture enforces RH access and completes the candidate lifecycle", async (t) => {
  const harness = createHarness(t);
  const job = await createPublishedJob(harness, "developpeur-integration");

  const anonymous = await harness.api.get("/api/admin/recrutement/offres");
  assert.equal(anonymous.statusCode, 401);

  const publicOffer = await harness.api.get(`/api/recrutement/offres/${job.slug}`);
  assert.equal(publicOffer.statusCode, 200);
  assert.equal(publicOffer.body.offre.employer_type, "techzone");
  assert.equal(Object.hasOwn(publicOffer.body.offre, "id"), false);

  const invalidTurnstile = await submitApplication(harness.api, job.public_id, { token: "invalid-token" });
  assert.equal(invalidTurnstile.statusCode, 400);
  assert.equal(harness.recruitment.repository.listApplications().length, 0);

  const submitted = await submitApplication(harness.api, job.public_id);
  assert.equal(submitted.statusCode, 202);
  assert.equal(submitted.body.status, "queued");
  assert.deepEqual(harness.turnstileTokens, ["invalid-token", "e2e-turnstile-ok"]);

  const application = harness.recruitment.repository.listApplications()[0];
  const encryptedFile = harness.recruitment.repository.listFiles(application.id)[0];
  assert.equal(fs.existsSync(encryptedFile.encrypted_path), true);
  assert.notDeepEqual(fs.readFileSync(encryptedFile.encrypted_path), pdfBuffer);

  assert.equal(await harness.recruitment.worker.runOnce(), true);
  const detail = await harness.api
    .get(`/api/admin/recrutement/candidatures/${application.id}`)
    .set(adminHeader);
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.body.candidature.processing_status, "analysis_ready");
  assert.equal(detail.body.candidature.hr_decision, "to_review");
  assert.equal(detail.body.candidature.analysis.human_review_notice, true);
  assert.equal(Object.hasOwn(detail.body.candidature.analysis, "decision"), false);
  assert.equal(Object.hasOwn(detail.body.fichiers[0], "encrypted_path"), false);

  const download = await harness.api
    .get(`/api/admin/recrutement/candidatures/${application.id}/fichiers/${encryptedFile.id}`)
    .set(adminHeader)
    .buffer(true)
    .parse((response, callback) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => callback(null, Buffer.concat(chunks)));
    });
  assert.equal(download.statusCode, 200);
  assert.deepEqual(download.body, pdfBuffer);
  assert.equal(download.headers["cache-control"], "private, no-store");

  const selected = await harness.api
    .patch(`/api/admin/recrutement/candidatures/${application.id}/decision`)
    .set(adminHeader)
    .send({ decision: "selected" });
  assert.equal(selected.statusCode, 200);

  const draft = await harness.api
    .post(`/api/admin/recrutement/candidatures/${application.id}/email-draft`)
    .set(adminHeader);
  assert.equal(draft.statusCode, 200);
  assert.equal(draft.body.draft.html.includes("script"), false);

  const emailPayload = {
    confirmed: true,
    idempotency_key: "integration-selection-v1",
    subject: draft.body.draft.subject,
    html: draft.body.draft.html
  };
  const [firstEmail, duplicateEmail] = await Promise.all([
    harness.api.post(`/api/admin/recrutement/candidatures/${application.id}/emails/send`).set(adminHeader).send(emailPayload),
    harness.api.post(`/api/admin/recrutement/candidatures/${application.id}/emails/send`).set(adminHeader).send(emailPayload)
  ]);
  assert.ok([200, 409].includes(firstEmail.statusCode));
  assert.ok([200, 409].includes(duplicateEmail.statusCode));
  assert.equal(harness.smtpCalls.length, 1);
  assert.equal(harness.smtpCalls[0].to, "candidate@example.test");

  const events = await harness.api
    .get(`/api/admin/recrutement/candidatures/${application.id}/events`)
    .set(adminHeader);
  assert.equal(events.statusCode, 200);
  assert.ok(events.body.evenements.some((event) => event.event_type === "application_received"));
  assert.ok(events.body.evenements.some((event) => event.event_type === "analysis_completed"));
  assert.ok(events.body.evenements.some((event) => event.event_type === "selection_email_sent"));
  assert.equal(JSON.stringify(events.body).includes(encryptedFile.encrypted_path), false);

  const closed = await harness.api
    .patch(`/api/admin/recrutement/offres/${job.id}`)
    .set(adminHeader)
    .send({ status: "closed" });
  assert.equal(closed.statusCode, 200);
  harness.db.prepare("UPDATE recruitment_jobs SET closed_at=datetime('now', '-181 days') WHERE id=?").run(job.id);
  assert.equal(purgeExpiredApplications({ repository: harness.recruitment.repository, retentionDays: 180 }), 1);
  assert.equal(harness.recruitment.repository.getApplicationById(application.id), null);
  assert.equal(fs.existsSync(encryptedFile.encrypted_path), false);
});

test("isolated fixture keeps failed public submissions free of partial data", async (t) => {
  const harness = createHarness(t);
  const job = await createPublishedJob(harness, "developpeur-validation");

  const noConsent = await harness.api
    .post(`/api/recrutement/offres/${job.public_id}/candidatures`)
    .field("full_name", "Candidate Synthétique")
    .field("email", "candidate@example.test")
    .field("phone", "000000000")
    .field("turnstile_token", "e2e-turnstile-ok")
    .attach("cv", pdfBuffer, { filename: "cv-synthetique.pdf", contentType: "application/pdf" });
  assert.equal(noConsent.statusCode, 400);
  assert.equal(harness.recruitment.repository.listApplications().length, 0);
  assert.equal(fs.existsSync(harness.storageDir), false);

  const first = await submitApplication(harness.api, job.public_id, { email: "Candidate@Example.Test" });
  const duplicate = await submitApplication(harness.api, job.public_id, { email: "candidate@example.test" });
  assert.equal(first.statusCode, 202);
  assert.equal(duplicate.statusCode, 409);
  assert.equal(harness.recruitment.repository.listApplications().length, 1);
});
