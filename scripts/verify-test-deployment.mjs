import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import dotenv from "dotenv";

const root = resolve(import.meta.dirname, "..");
const envPath = resolve(root, process.env.RECRUITMENT_DEPLOY_ENV || "deployment/recruitment.test.env");
const receiptPath = resolve(root, "deployment/private/recruitment-test-session.json");
const turnstileTestSiteKey = "1x00000000000000000000AA";

function fail(message) {
  console.error("Recette HTTPS en échec : " + message);
  process.exit(1);
}

function requireHeader(response, name, expected) {
  const value = response.headers.get(name) || "";
  if (expected instanceof RegExp ? !expected.test(value) : value !== expected) {
    fail("en-tête " + name + " invalide.");
  }
}

if (!existsSync(envPath) || !existsSync(receiptPath)) fail("fichier de recette ou session temporaire introuvable.");
const env = dotenv.parse(readFileSync(envPath));
const session = JSON.parse(readFileSync(receiptPath));
if (env.RECRUITMENT_TEST_DEPLOYMENT !== "true" || env.CORS_ORIGIN !== "https://recrutement.techzone.lat") {
  fail("environnement isolé invalide.");
}
if (new Date(session.expiresAt).getTime() <= Date.now()) fail("la session temporaire a expiré.");

const base = env.CORS_ORIGIN;
const authorizedHeaders = {
  Cookie: `${session.cookieName}=${session.cookieValue}`,
  Origin: base
};
const [health, anonymous, authorized, runtimeConfig, missingApi, spaRoute, media] = await Promise.all([
  fetch(base + "/api/health"),
  fetch(base + "/api/admin/recrutement/offres"),
  fetch(base + "/api/admin/recrutement/offres", { headers: authorizedHeaders }),
  fetch(base + "/recruitment-config.json"),
  fetch(base + "/api/inconnue"),
  fetch(base + "/recrutement/inconnue"),
  fetch(base + "/media/recrutement/probe")
]);

if (!health.ok || anonymous.status !== 401 || !authorized.ok || missingApi.status !== 404 || !spaRoute.ok || media.status !== 404) {
  fail("codes HTTP inattendus.");
}
if ((await missingApi.json()).error !== "Route API introuvable.") fail("contrat de route API inconnue invalide.");
const config = await runtimeConfig.json();
if (!runtimeConfig.ok || config.turnstileSiteKey !== turnstileTestSiteKey || config.isTestDeployment !== true) {
  fail("configuration Turnstile de recette invalide.");
}
requireHeader(runtimeConfig, "cache-control", /no-store/i);
requireHeader(authorized, "x-content-type-options", "nosniff");
requireHeader(authorized, "x-frame-options", "DENY");
requireHeader(authorized, "referrer-policy", "same-origin");
requireHeader(authorized, "strict-transport-security", /max-age=31536000/i);
if (authorized.headers.has("x-powered-by")) fail("empreinte Express présente.");
const renewedCookie = authorized.headers.get("set-cookie") || "";
if (!/HttpOnly/i.test(renewedCookie) || !/Secure/i.test(renewedCookie) || !/SameSite=Strict/i.test(renewedCookie)) {
  fail("attributs du cookie RH invalides.");
}

console.log("Recette HTTPS OK : health, session RH, Turnstile, headers, API et stockage contrôlés.");
