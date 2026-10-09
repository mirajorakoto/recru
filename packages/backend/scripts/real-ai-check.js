// Validation script ONLY — never a production or demo entrypoint.
// Confirms that a real OPENAI_API_KEY works against the real Responses API
// using createOpenAiService, on a synthetic candidate file.
//
// Per docs/1-reprise-projet.md and the S1-01 ticket scope, real candidate
// documents must never be used in testing. This script only ever sends a
// fake, non-personal PDF generated in memory — never a real CV.
//
// NOTE: this file is intentionally NOT named test-*.js or *.test.js —
// node --test auto-discovers files matching those patterns, which would
// make it run automatically (and make a real, billed OpenAI call) on
// every `npm test` / `npm run verify`. Do not rename it back.
//
// Usage:
//   node packages/backend/scripts/real-ai-check.js

const { loadEnvFile } = require("../src/config");
const { createOpenAiService } = require("../src/ai");

loadEnvFile();

if (!process.env.OPENAI_API_KEY) {
  console.error(
    "OPENAI_API_KEY is not set in the root .env file. " +
    "Add the real key provided by the TechZone project lead before running this script."
  );
  process.exit(1);
}

// Synthetic, non-personal PDF content — never a real candidate document.
// Minimal but structurally valid PDF (empty single page), not just a
// %PDF- header. OpenAI actually parses the file, unlike our own
// security.js validation which only checks the header bytes.
const syntheticPdf = Buffer.from(
  `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 58 >>
stream
BT /F1 12 Tf 20 100 Td (Candidat synthetique de test) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
0
%%EOF`,
  "ascii"
);

const syntheticJob = {
  title: "Stagiaire développeur web (offre synthétique de test)",
  criteria: [
    { label: "Bases solides en JavaScript", required: true },
    { label: "Connaissance de React", required: false }
  ]
};

const syntheticApplication = {
  full_name: "Candidat Synthétique de Test"
};

async function main() {
  const aiService = createOpenAiService({
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || "gpt-5.4-nano-2026-03-17",
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS) || 45000
  });

  console.log(`Appel du modèle ${aiService.model} avec un document synthétique...`);

  const result = await aiService.analyzeApplication({
    application: syntheticApplication,
    job: syntheticJob,
    files: [
      {
        original_name: "cv-synthetique.pdf",
        mime_type: "application/pdf",
        buffer: syntheticPdf
      }
    ]
  });

  console.log("\n--- Résultat de l'analyse ---");
  console.log(JSON.stringify(result, null, 2));

  if (result.human_review_notice !== true) {
    console.error("\nATTENTION: human_review_notice n'est pas true — schéma inattendu.");
    process.exit(1);
  }

  console.log("\nL'intégration OpenAI réelle fonctionne correctement.");
}

main().catch((error) => {
  console.error("\nÉchec de l'appel réel à l'API OpenAI :");
  console.error(error.message);
  process.exit(1);
});
