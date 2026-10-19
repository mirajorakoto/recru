const fs = require("node:fs");
const path = require("node:path");
const express = require("express");
const Database = require("better-sqlite3");
const { createRecruitmentModule } = require("./src");
const { createOpenAiService, createTestAiService } = require("./src/ai");
const { loadEnvFile, loadConfig, ConfigValidationError } = require("./src/config");
const { createMailer } = require("./src/mailer");

// Explicitly load the repository-root .env before reading any variable.
// Real environment variables (CI, container, hosting platform) always win.
loadEnvFile();

let config;
try {
  config = loadConfig();
} catch (error) {
  if (error instanceof ConfigValidationError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const dbPath = config.dbPath;
// A fresh clone does not contain ignored runtime directories.
fs.mkdirSync(path.dirname(dbPath), { recursive: true, mode: 0o700 });
const db = new Database(dbPath);
db.pragma("foreign_keys = ON");
const fileKey = config.fileKey;

// Sans OPENAI_API_KEY dans .env, on utilise le service de test déterministe du module :
// il produit un profil, un score explicable (« incertain » partout), des questions d'entretien
// et un brouillon d'email, pour que toute la démo fonctionne hors ligne. Avec une vraie clé,
// c'est le vrai service OpenAI (même code qu'en production).
const demoAiService = createTestAiService();

const aiService = config.openai.apiKey
  ? createOpenAiService({
    apiKey: config.openai.apiKey,
    model: config.openai.model,
    timeoutMs: config.openai.timeoutMs
  })
  : demoAiService;

if (config.openai.apiKey) {
  console.log(`[demo] OPENAI_API_KEY détectée : analyse IA réelle activée (modèle ${config.openai.model}).`);
} else {
  console.log("[demo] Pas d'OPENAI_API_KEY : analyse IA factice (toujours \"uncertain\"). Ajoute la clé dans .env pour une vraie analyse.");
}

// Banc d'essai : l'utilisateur RH est choisi au démarrage (RECRUITMENT_DEMO_USER) parmi le personnel
// de démonstration ci-dessous, pour essayer les rôles admin / recruteur / lecteur.
// Une seule personne : à la fois administrateur et recruteur.
const DEMO_STAFF = [
  { email: "rrabe6402@gmail.com", role: "admin", display_name: "RH Démo (admin et recruteur)" }
];
const demoUser = DEMO_STAFF.find((member) => member.email === process.env.RECRUITMENT_DEMO_USER) || DEMO_STAFF[0];
if (process.env.RECRUITMENT_DEMO_USER && demoUser.email !== process.env.RECRUITMENT_DEMO_USER) {
  console.warn(`[demo] RECRUITMENT_DEMO_USER inconnu, utilisateur par défaut : ${demoUser.email}`);
}

// Avec SMTP_* renseignés dans le .env, la démo envoie de VRAIS e-mails ; sinon ils sont simulés dans la console.
const mailer = createMailer(config);
void mailer.verify();

const moduleInstance = createRecruitmentModule({
  db,
  requireAdminSession(req, res, next) {
    req.adminUser = { id: 1, email: demoUser.email, display_name: demoUser.display_name };
    next();
  },
  transporter: mailer.transporter,
  aiService,
  config: {
    storageDir: config.storageDir,
    fileKey,
    retentionDays: config.retentionDays,
    maxFileMb: config.maxFileMb,
    bypassTurnstile: config.turnstile.bypassAllowed,
    smtpFrom: config.smtp.from,
    publicBaseUrl: config.publicBaseUrl,
    cookieSecure: false
  }
});

for (const member of DEMO_STAFF) {
  if (!moduleInstance.repository.getStaff(member.email)) {
    moduleInstance.repository.upsertStaff({ email: member.email, role: member.role, active: true });
  }
}
console.log(`[demo] Utilisateur RH : ${demoUser.email} (rôle ${demoUser.role}). Changez-en avec RECRUITMENT_DEMO_USER.`);

if (moduleInstance.repository.listJobs().length === 0) {
  moduleInstance.repository.createJob({
    slug: "stage-developpeur-web",
    title: "Stagiaire développeur web",
    summary: "Contribuez à des produits web utiles avec un accompagnement technique.",
    description: "Vous participerez au développement, aux tests et à la documentation de fonctionnalités web.",
    department: "Technique",
    required_diploma: "bac+2",
    required_experience: "0–1 an",
    seniority: "junior",
    languages: ["Français", "Anglais"],
    criteria: [
      { label: "Bases solides en JavaScript", required: true, category: "competence" },
      { label: "Capacité à expliquer un projet réalisé", required: true, category: "autre" },
      { label: "Connaissance de React", required: false, category: "competence" },
      { label: "Bac+2 en informatique", required: true, category: "formation" }
    ],
    location: "Fianarantsoa",
    work_mode: "hybrid",
    contract_type: "stage",
    employer_type: "techzone",
    status: "published",
    urgent: true
  });
  moduleInstance.repository.createJob({
    slug: "responsable-operations",
    title: "Responsable opérations",
    summary: "Pilotez les opérations et accompagnez la croissance de nos activités.",
    description: "Vous coordonnerez les équipes opérationnelles et suivrez les indicateurs clés de performance au quotidien.",
    department: "Opérations",
    required_diploma: "bac+3",
    required_experience: "3 ans",
    seniority: "confirme",
    languages: ["Français"],
    criteria: [
      { label: "Organisation", required: true, category: "competence" },
      { label: "Leadership", required: true, category: "competence" },
      { label: "Amélioration continue", required: false, category: "autre" }
    ],
    location: "Antananarivo",
    work_mode: "onsite",
    contract_type: "cdi",
    employer_type: "partner",
    partner_name: "Partenaire TechZone",
    status: "published",
    urgent: false
  });
  moduleInstance.repository.createJob({
    slug: "support-client",
    title: "Support client",
    summary: "Accompagnez nos utilisateurs et contribuez à leur satisfaction.",
    description: "Vous traiterez les demandes entrantes et assurerez le suivi des dossiers jusqu’à leur résolution.",
    department: "Relation client",
    required_diploma: "bac",
    required_experience: "0–2 ans",
    seniority: "junior",
    languages: ["Français", "Malgache"],
    criteria: [
      { label: "Communication", required: true, category: "competence" },
      { label: "Résolution de problèmes", required: true, category: "competence" },
      { label: "Sens du service", required: false, category: "autre" }
    ],
    location: "Antananarivo",
    work_mode: "onsite",
    contract_type: "cdd",
    employer_type: "techzone",
    status: "published",
    urgent: false
  });
}

const app = express();
app.use(express.json({ limit: "1mb" }));
app.get("/api/health", (req, res) => res.json({ ok: true, mode: "recruitment-demo" }));
app.post("/api/admin/recrutement/auth/logout", (req, res) => res.json({ ok: true, demo: true }));
app.use("/api/recrutement", moduleInstance.publicRouter);
app.use("/api/admin/recrutement", moduleInstance.adminRouter);
app.use((error, req, res, next) => {
  if (error?.code === "LIMIT_FILE_SIZE") return res.status(400).json({ error: `Le fichier dépasse ${config.maxFileMb || 10} Mo.` });
  if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "Corps de requête JSON invalide." });
  console.error("Erreur HTTP recrutement du banc d’essai.");
  res.status(500).json({ error: "Erreur serveur du banc d’essai." });
});

const port = config.port;
// LISTEN_HOST vaut 127.0.0.1 par défaut ; 0.0.0.0 dans un conteneur Docker (voir deploy/docker-compose.ci.yml).
const server = app.listen(port, config.listenHost, () => {
  console.log(`TechZone recruitment demo API: http://${config.listenHost}:${port}`);
  moduleInstance.start();
});

function shutdown() {
  moduleInstance.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
