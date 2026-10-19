const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const Database = require("better-sqlite3");
const express = require("express");
const request = require("supertest");
const { createRecruitmentModule } = require("../src");

const BASE = "/api/admin/recrutement";
const PASSWORD = "MotDePasse2026";

function createHarness({ sendMail, allowConsolePassword = false } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "techzone-rh-auth-"));
  const db = new Database(path.join(root, "recruitment.sqlite"));
  db.pragma("foreign_keys = ON");
  const mails = [];
  const recruitment = createRecruitmentModule({
    db,
    // Pas de requireAdminSession : le module utilise son authentification RH intégrée.
    transporter: {
      async sendMail(message) {
        if (sendMail) return sendMail(message, mails);
        mails.push(message);
        return { messageId: `m-${mails.length}` };
      }
    },
    aiService: { model: "fixture" },
    config: {
      storageDir: path.join(root, "files"),
      fileKey: Buffer.alloc(32, 7).toString("base64"),
      smtpFrom: "TECH ZONE <rh@example.test>",
      allowConsolePassword,
      rhLoginRateLimit: 100,
      rhForgotRateLimit: 100
    }
  });
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use("/api/recrutement", recruitment.publicRouter);
  app.use(BASE, recruitment.adminRouter);
  return { app, db, mails, recruitment, agent: () => request.agent(app) };
}

const setup = (agent, overrides = {}) => agent.post(`${BASE}/auth/setup`).send({ email: "RH@Example.test", display_name: "Rina RH", password: PASSWORD, ...overrides });

test("sans compte RH, l'espace RH est fermé et demande d'abord la création du compte", async () => {
  const { app } = createHarness();
  const status = await request(app).get(`${BASE}/auth/status`);
  assert.deepEqual(status.body, { configured: false, authenticated: false });
  const moi = await request(app).get(`${BASE}/moi`);
  assert.equal(moi.status, 401);
  assert.equal(moi.body.code, "setup_required");
  const offers = await request(app).get(`${BASE}/offres`);
  assert.equal(offers.status, 401);
  const login = await request(app).post(`${BASE}/auth/login`).send({ email: "rh@example.test", password: PASSWORD });
  assert.equal(login.status, 409);
  assert.equal(login.body.code, "setup_required");
});

test("le premier arrivé crée l'unique compte RH ; il entre directement dans l'espace RH", async () => {
  const { agent, db } = createHarness();
  const rh = agent();
  const created = await setup(rh);
  assert.equal(created.status, 201);
  assert.equal(created.body.user.email, "rh@example.test");
  const moi = await rh.get(`${BASE}/moi`);
  assert.equal(moi.status, 200);
  assert.equal(moi.body.email, "rh@example.test");
  assert.equal((await rh.get(`${BASE}/offres`)).status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM recruitment_rh_account").get().n, 1);
  // Le mot de passe n'est jamais stocké en clair ni renvoyé.
  assert.ok(!JSON.stringify(created.body).includes(PASSWORD));
  assert.notEqual(db.prepare("SELECT password_hash FROM recruitment_rh_account").get().password_hash, PASSWORD);
});

test("un second compte RH est impossible tant que le premier existe", async () => {
  const { agent, db } = createHarness();
  assert.equal((await setup(agent())).status, 201);
  const second = await setup(agent(), { email: "autre@example.test" });
  assert.equal(second.status, 409);
  assert.equal(second.body.code, "account_exists");
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM recruitment_rh_account").get().n, 1);
});

test("création refusée si l'e-mail ou le mot de passe est invalide", async () => {
  const { agent } = createHarness();
  assert.equal((await setup(agent(), { email: "pas-un-email" })).status, 400);
  assert.equal((await setup(agent(), { password: "court1" })).status, 400);
  assert.equal((await setup(agent(), { password: "uniquementdeslettres" })).status, 400);
});

test("connexion : mauvais mot de passe ou mauvais e-mail refusés, bon identifiant accepté, déconnexion", async () => {
  const { agent, app } = createHarness();
  await setup(agent());
  const fresh = agent();
  assert.equal((await fresh.get(`${BASE}/offres`)).status, 401);
  assert.equal((await fresh.post(`${BASE}/auth/login`).send({ email: "rh@example.test", password: "MauvaisMdp123" })).status, 401);
  assert.equal((await fresh.post(`${BASE}/auth/login`).send({ email: "intrus@example.test", password: PASSWORD })).status, 401);
  assert.equal((await fresh.post(`${BASE}/auth/login`).send({ email: " RH@example.test ", password: PASSWORD })).status, 200);
  assert.equal((await fresh.get(`${BASE}/offres`)).status, 200);
  await fresh.post(`${BASE}/auth/logout`).send({});
  assert.equal((await fresh.get(`${BASE}/offres`)).status, 401);
  assert.equal((await request(app).get(`${BASE}/auth/status`)).body.configured, true);
});

test("une requête d'écriture venant d'un autre site est refusée", async () => {
  const { agent } = createHarness();
  const rh = agent();
  await setup(rh);
  const response = await rh.post(`${BASE}/auth/logout`).set("Origin", "https://site-malveillant.example").send({});
  assert.equal(response.status, 403);
});

test("suppression du compte RH : exige le mot de passe actuel, puis la première personne recrée un compte", async () => {
  const { agent, db } = createHarness();
  const rh = agent();
  await setup(rh);

  const refused = await rh.delete(`${BASE}/auth/account`).send({ password: "MauvaisMdp123" });
  assert.equal(refused.status, 403);
  const missing = await rh.delete(`${BASE}/auth/account`).send({});
  assert.equal(missing.status, 403);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM recruitment_rh_account").get().n, 1);
  assert.equal((await rh.get(`${BASE}/moi`)).status, 200);

  const removed = await rh.delete(`${BASE}/auth/account`).send({ password: PASSWORD });
  assert.equal(removed.status, 200);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM recruitment_rh_account").get().n, 0);
  const after = await rh.get(`${BASE}/moi`);
  assert.equal(after.status, 401);
  assert.equal(after.body.code, "setup_required");

  // Nouveau compte RH : adresse et mot de passe différents ; l'ancien identifiant ne marche plus.
  const another = agent();
  assert.equal((await setup(another, { email: "nouveau@example.test", password: "AutreMotDePasse77" })).status, 201);
  assert.equal((await another.get(`${BASE}/moi`)).body.email, "nouveau@example.test");
  assert.equal((await agent().post(`${BASE}/auth/login`).send({ email: "rh@example.test", password: PASSWORD })).status, 401);
});

test("la suppression du compte RH conserve les données de recrutement", async () => {
  const { agent, recruitment } = createHarness();
  const rh = agent();
  await setup(rh);
  recruitment.repository.createJob({
    slug: "poste-test", title: "Poste test", summary: "Résumé", description: "Description", location: "Tana",
    work_mode: "onsite", contract_type: "cdi", employer_type: "techzone", status: "draft", urgent: false,
    criteria: [{ label: "Rigueur", required: true, category: "autre" }]
  });
  await rh.delete(`${BASE}/auth/account`).send({ password: PASSWORD });
  assert.equal(recruitment.repository.listJobs().length, 1);
});

test("mot de passe oublié : un nouveau mot de passe est envoyé par e-mail au compte RH et remplace l'ancien", async () => {
  const { agent, mails } = createHarness();
  await setup(agent());
  const visitor = agent();
  const response = await visitor.post(`${BASE}/auth/forgot-password`).send({ email: "rh@example.test" });
  assert.equal(response.status, 202);
  assert.equal(mails.length, 1);
  assert.equal(mails[0].to, "rh@example.test");
  assert.equal(mails[0].from, "TECH ZONE <rh@example.test>");
  const match = /Votre nouveau mot de passe : (\S+)/.exec(mails[0].text);
  assert.ok(match, "le mot de passe doit figurer dans l'e-mail");
  const newPassword = match[1];
  assert.ok(newPassword.length >= 10 && /[A-Za-z]/.test(newPassword) && /\d/.test(newPassword));
  assert.ok(mails[0].html.includes(newPassword));

  assert.equal((await visitor.post(`${BASE}/auth/login`).send({ email: "rh@example.test", password: PASSWORD })).status, 401);
  assert.equal((await visitor.post(`${BASE}/auth/login`).send({ email: "rh@example.test", password: newPassword })).status, 200);
  assert.equal((await visitor.get(`${BASE}/moi`)).status, 200);
});

test("mot de passe oublié : réponse identique et aucun e-mail pour une adresse inconnue", async () => {
  const { agent, mails } = createHarness();
  await setup(agent());
  const response = await agent().post(`${BASE}/auth/forgot-password`).send({ email: "inconnu@example.test" });
  assert.equal(response.status, 202);
  assert.deepEqual(response.body, { status: "sent" });
  assert.equal(mails.length, 0);
  assert.equal((await agent().post(`${BASE}/auth/login`).send({ email: "rh@example.test", password: PASSWORD })).status, 200);
});

test("mot de passe oublié : si l'envoi échoue, l'ancien mot de passe reste valide (pas de verrouillage)", async () => {
  const { agent } = createHarness({ sendMail: async () => { throw Object.assign(new Error("SMTP down"), { code: "ECONNECTION" }); } });
  await setup(agent());
  const originalError = console.error;
  console.error = () => {};
  try {
    const response = await agent().post(`${BASE}/auth/forgot-password`).send({ email: "rh@example.test" });
    assert.equal(response.status, 202);
  } finally {
    console.error = originalError;
  }
  assert.equal((await agent().post(`${BASE}/auth/login`).send({ email: "rh@example.test", password: PASSWORD })).status, 200);
});

test("mot de passe oublié : sans SMTP actif en production, le mot de passe n'est pas modifié", async () => {
  const { agent } = createHarness({ sendMail: async () => ({ simulated: true }), allowConsolePassword: false });
  await setup(agent());
  const originalError = console.error;
  console.error = () => {};
  try {
    assert.equal((await agent().post(`${BASE}/auth/forgot-password`).send({ email: "rh@example.test" })).status, 202);
  } finally {
    console.error = originalError;
  }
  assert.equal((await agent().post(`${BASE}/auth/login`).send({ email: "rh@example.test", password: PASSWORD })).status, 200);
});

test("changement de mot de passe : exige l'actuel, révoque les autres sessions", async () => {
  const { agent } = createHarness();
  const first = agent();
  await setup(first);
  const other = agent();
  await other.post(`${BASE}/auth/login`).send({ email: "rh@example.test", password: PASSWORD });

  assert.equal((await first.post(`${BASE}/auth/password`).send({ current_password: "Faux1234567", new_password: "NouveauMdp2026" })).status, 403);
  assert.equal((await first.post(`${BASE}/auth/password`).send({ current_password: PASSWORD, new_password: "faible" })).status, 400);
  assert.equal((await first.post(`${BASE}/auth/password`).send({ current_password: PASSWORD, new_password: "NouveauMdp2026" })).status, 200);

  assert.equal((await first.get(`${BASE}/moi`)).status, 200); // la session courante reste ouverte
  assert.equal((await other.get(`${BASE}/moi`)).status, 401); // l'autre est révoquée
  assert.equal((await agent().post(`${BASE}/auth/login`).send({ email: "rh@example.test", password: "NouveauMdp2026" })).status, 200);
});

test("plus d'équipe ni de rôles : /equipe n'existe plus et la table des rôles est supprimée", async () => {
  const { agent, db } = createHarness();
  const rh = agent();
  await setup(rh);
  assert.equal((await rh.get(`${BASE}/equipe`)).status, 404);
  assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'recruitment_staff'").get(), undefined);
  // Le RH unique accède aux zones qui étaient réservées à l'administrateur.
  assert.equal((await rh.get(`${BASE}/audit`)).status, 200);
  assert.equal((await rh.get(`${BASE}/comptes`)).status, 200);
});

test("les événements du compte RH sont journalisés sans mot de passe", async () => {
  const { agent, db } = createHarness();
  const rh = agent();
  await setup(rh);
  await rh.delete(`${BASE}/auth/account`).send({ password: PASSWORD });
  const rows = db.prepare("SELECT event_type, actor, details_json FROM recruitment_events ORDER BY id").all();
  assert.deepEqual(rows.map((row) => row.event_type), ["rh_account_created", "rh_account_deleted"]);
  assert.ok(!JSON.stringify(rows).includes(PASSWORD));
});
