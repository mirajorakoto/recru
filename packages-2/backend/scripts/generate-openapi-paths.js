#!/usr/bin/env node
/**
 * Génère les blocs `paths:` OpenAPI de TOUTES les routes Express du module (src/routes.js), au format
 * attendu par test/openapi-contract.test.js, pour les fusionner dans docs/6-openapi.yaml.
 *
 *   node scripts/generate-openapi-paths.js > docs/6-openapi.generated-paths.yaml
 *
 * Les routes RH portent `security: [{ adminSession: [] }]` ; les routes candidat protégées par
 * le cookie de session `rc_session` portent `security: [{ candidateSession: [] }]`.
 */
const fs = require("node:fs");
const path = require("node:path");

const source = fs.readFileSync(path.resolve(__dirname, "../src/routes.js"), "utf8").replace(/\r\n/g, "\n");
const pattern = /(publicRouter|adminRouter)\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g;
const matches = [...source.matchAll(pattern)];

const routes = new Map();
matches.forEach((match, index) => {
  const body = source.slice(match.index, index + 1 < matches.length ? matches[index + 1].index : source.length);
  const isAdmin = match[1] === "adminRouter";
  const openApiPath = (isAdmin ? "/api/admin/recrutement" : "/api/recrutement") + match[3].replace(/:([A-Za-z0-9_]+)/g, "{$1}");
  const usesCandidateSession = !isAdmin && /requireAccount/.test(body.slice(0, 200));
  if (!routes.has(openApiPath)) routes.set(openApiPath, []);
  routes.get(openApiPath).push({ method: match[2], isAdmin, usesCandidateSession, params: [...match[3].matchAll(/:([A-Za-z0-9_]+)/g)].map((item) => item[1]) });
});

const lines = ["# Généré par scripts/generate-openapi-paths.js — à fusionner sous `paths:` dans docs/6-openapi.yaml", "paths:"];
for (const [openApiPath, operations] of [...routes].sort(([a], [b]) => a.localeCompare(b))) {
  lines.push(`  ${openApiPath}:`);
  for (const operation of operations) {
    lines.push(`    ${operation.method}:`);
    lines.push(`      summary: ${operation.method.toUpperCase()} ${openApiPath}`);
    if (operation.params.length) {
      lines.push("      parameters:");
      for (const name of operation.params) {
        lines.push(`        - { name: ${name}, in: path, required: true, schema: { type: string } }`);
      }
    }
    if (operation.isAdmin) lines.push("      security: [{ adminSession: [] }]");
    else if (operation.usesCandidateSession) lines.push("      security: [{ candidateSession: [] }]");
    lines.push("      responses:");
    lines.push("        \"200\": { description: Succès }");
    lines.push("        \"400\": { description: Requête invalide }");
    if (operation.isAdmin || operation.usesCandidateSession) lines.push("        \"401\": { description: Authentification requise }");
    if (operation.isAdmin) lines.push("        \"403\": { description: Rôle insuffisant }");
  }
}
process.stdout.write(lines.join("\n") + "\n");
