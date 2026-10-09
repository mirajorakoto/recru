// Validation script ONLY — never a production or demo entrypoint.
// Confirms that real SMTP credentials work by sending one synthetic
// selection email to a controlled inbox you own.
//
// Per docs/9-recette-livraison.md ("Interdictions de recette"), this must
// NEVER be pointed at a real candidate's email address. Pass your own
// test address as an argument.
//
// NOTE: this file is intentionally NOT named test-*.js or *.test.js —
// node --test auto-discovers files matching those patterns, which would
// make it run automatically (and fail, since it needs a CLI argument) on
// every `npm test` / `npm run verify`. Do not rename it back.
//
// Usage:
//   node packages/backend/scripts/real-email-check.js ton-adresse@example.com

const nodemailer = require("nodemailer");
const { loadEnvFile } = require("../src/config");
const { htmlToText, sanitizeEmailHtml } = require("../src/security");

loadEnvFile();

const recipient = process.argv[2];
if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) {
  console.error(
    "Usage: node packages/backend/scripts/real-email-check.js ton-adresse@example.com\n" +
    "Fournis une adresse que TU contrôles — jamais un vrai candidat."
  );
  process.exit(1);
}

const required = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Variables SMTP manquantes dans .env : ${missing.join(", ")}`);
  process.exit(1);
}

// Synthetic content only — mirrors the shape of a real selection email
// (see routes.js emails/send) without any real candidate data.
const syntheticHtml = sanitizeEmailHtml(
  "<p>Bonjour Candidat Synthétique,</p>" +
  "<p>Ceci est un <strong>email de test</strong> de recette de livraison, " +
  "envoyé pour valider le rendu HTML/texte réel avant mise en production. " +
  "Aucune candidature réelle n'est concernée.</p>" +
  "<p>L'équipe recrutement TECH ZONE</p>"
);

async function main() {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });

  console.log(`Envoi d'un email de test vers ${recipient}...`);

  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM,
    to: recipient,
    subject: "[Test recette] Rendu email TechZone Recrutement",
    html: syntheticHtml,
    text: htmlToText(syntheticHtml)
  });

  console.log(`Email envoyé. Message ID : ${info.messageId}`);
  console.log("Vérifie manuellement dans la boîte de réception : rendu HTML, rendu texte brut, expéditeur affiché.");
}

main().catch((error) => {
  console.error("Échec de l'envoi réel :", error.message);
  process.exit(1);
});
