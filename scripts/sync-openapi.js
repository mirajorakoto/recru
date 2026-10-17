// Compare les routes Express (packages/backend/src/routes.js) à docs/6-openapi.yaml.
//   node scripts/sync-openapi.js          -> rapport seul
//   node scripts/sync-openapi.js --fix    -> ajoute les blocs manquants (descriptions génériques)
const fs = require("fs"), path = require("path");
const routesFile = path.join(process.cwd(), "packages/backend/src/routes.js");
const yamlFile = path.join(process.cwd(), "docs/6-openapi.yaml");
const fix = process.argv.includes("--fix");
const src = fs.readFileSync(routesFile, "utf8").replace(/\r\n/g, "\n");
const toPath = (prefix, route) => (prefix + route).replace(/:([A-Za-z0-9_]+)/g, "{$1}");
const routes = [...src.matchAll(/(publicRouter|adminRouter)\.(get|post|patch|delete)\(\s*["']([^"']+)/g)].map((m) => ({
  admin: m[1] === "adminRouter", method: m[2],
  path: toPath(m[1] === "adminRouter" ? "/api/admin/recrutement" : "/api/recrutement", m[3])
}));
let lines = fs.readFileSync(yamlFile, "utf8").replace(/\r\n/g, "\n").split("\n");
function documented() {
  const set = new Set(); let cur = null;
  for (const l of lines) {
    const p = l.match(/^  (\/api\/\S+):\s*$/); if (p) { cur = p[1]; continue; }
    if (/^\S/.test(l)) cur = null;
    const m = l.match(/^    (get|post|patch|delete):/); if (m && cur) set.add(m[1] + " " + cur);
  }
  return set;
}
const doc = documented();
const missing = routes.filter((r) => !doc.has(r.method + " " + r.path));
const code = new Set(routes.map((r) => r.method + " " + r.path));
const stale = [...doc].filter((k) => !code.has(k));
console.log(`routes dans le code : ${routes.length} | documentées : ${doc.size}`);
console.log("MANQUANTES dans la documentation :", missing.length ? "" : "aucune");
missing.forEach((r) => console.log("  + " + r.method.toUpperCase() + " " + r.path));
console.log("DOCUMENTÉES mais absentes du code :", stale.length ? "" : "aucune");
stale.forEach((k) => { const [m, ...p] = k.split(" "); console.log("  - " + m.toUpperCase() + " " + p.join(" ")); });
if (!fix || !missing.length) process.exit(0);
function range(p) {
  const i = lines.findIndex((l) => l === `  ${p}:`); if (i < 0) return null;
  let j = i + 1; while (j < lines.length && !/^  \/api\//.test(lines[j]) && !/^\S/.test(lines[j])) j++;
  return [i, j];
}
for (const r of missing) {
  const params = [...r.path.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]);
  const b = [`    ${r.method}:`, `      summary: ${r.method.toUpperCase()} ${r.path}`];
  if (r.admin) b.push("      security: [{ adminSession: [] }]");
  if (params.length) { b.push("      parameters:"); params.forEach((n) => b.push(`        - { name: ${n}, in: path, required: true, schema: { type: string } }`)); }
  b.push("      responses:", '        "200": { description: Succès }', '        "400": { description: Requête invalide }');
  if (r.admin) b.push('        "401": { description: Authentification requise }', '        "403": { description: Rôle insuffisant }');
  const rg = range(r.path);
  if (rg) lines.splice(rg[1], 0, ...b);
  else { let k = lines.findIndex((l) => /^components:/.test(l)); if (k < 0) k = lines.length; lines.splice(k, 0, `  ${r.path}:`, ...b); }
}
fs.writeFileSync(yamlFile, lines.join("\n"), "utf8");
console.log(`${missing.length} bloc(s) ajouté(s) dans docs/6-openapi.yaml`);
