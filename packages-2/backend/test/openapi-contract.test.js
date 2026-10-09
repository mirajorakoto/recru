const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const routesPath = path.resolve(__dirname, "../src/routes.js");
// docs/6-openapi.yaml est la source ; à défaut, le fichier généré (scripts/generate-openapi-paths.js).
const openApiCandidates = ["../../../docs/6-openapi.yaml", "../../../docs/6-openapi.generated-paths.yaml"].map((file) => path.resolve(__dirname, file));
const openApiPath = openApiCandidates.find((file) => fs.existsSync(file));

function escapeRegExp(value) {
  return value.replaceAll("\\", "\\\\").replace(/[.()+*?^$|[\]{}]/g, "\\$&");
}

function toOpenApiPath(prefix, route) {
  return (prefix + route).replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

test("OpenAPI documents every public and RH Express route with its method and RH security", () => {
  const source = fs.readFileSync(routesPath, "utf8").replace(/\r\n/g, "\n");
  const openApi = fs.readFileSync(openApiPath, "utf8").replace(/\r\n/g, "\n");
  const routePattern = /(publicRouter|adminRouter)\.(get|post|put|patch|delete)\(\s*["']([^"']+)/g;
  const discovered = [...source.matchAll(routePattern)].map((match) => ({
    isAdmin: match[1] === "adminRouter",
    method: match[2],
    path: toOpenApiPath(match[1] === "adminRouter" ? "/api/admin/recrutement" : "/api/recrutement", match[3])
  }));

  assert.ok(discovered.length >= 15, "La fixture doit suivre toutes les routes Express du module.");
  for (const route of discovered) {
    const blockPattern = "^  " + escapeRegExp(route.path) + ":\\n([\\s\\S]*?)(?=^  /api/|^components:|(?![\\s\\S]))";
    const pathBlock = openApi.match(new RegExp(blockPattern, "m"))?.[1];
    assert.ok(pathBlock, "Route OpenAPI manquante : " + route.path);
    assert.match(pathBlock, new RegExp("^    " + route.method + ":", "m"), "Méthode OpenAPI manquante : " + route.method.toUpperCase() + " " + route.path);
    if (route.isAdmin) {
      assert.match(pathBlock, /security: \[\{ adminSession: \[\] \}\]/, "Sécurité RH manquante : " + route.path);
    }
  }
});
