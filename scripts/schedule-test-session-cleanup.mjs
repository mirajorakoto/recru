import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const receiptPath = resolve(root, "deployment/private/recruitment-test-session.json");
const cleanupScript = resolve(root, "scripts/cleanup-test-session.mjs");
const unit = "techzone-recruitment-test-session-cleanup";

if (!existsSync(receiptPath)) throw new Error("Reçu de session temporaire introuvable.");
const receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
const delaySeconds = Math.ceil((new Date(receipt.expiresAt).getTime() - Date.now()) / 1000);
if (!Number.isSafeInteger(delaySeconds) || delaySeconds < 1) throw new Error("La session temporaire est déjà expirée.");

// A replacement session must replace its own old timer, never leave two
// cleanup jobs racing against the shared SQLite session table.
spawnSync("systemctl", ["--user", "stop", `${unit}.timer`], { stdio: "ignore" });
const result = spawnSync("systemd-run", [
  "--user",
  "--unit", unit,
  "--on-active", `${delaySeconds}s`,
  "--collect",
  "--working-directory", root,
  "--setenv=RECRUITMENT_DEPLOY_ENV=deployment/recruitment.test.env",
  process.execPath,
  cleanupScript
], { encoding: "utf8" });
if (result.error || result.status !== 0) {
  throw new Error(`Impossible de programmer la suppression automatique de la session temporaire.${result.stderr ? ` ${result.stderr.trim()}` : ""}`);
}
console.log("Suppression automatique de la session temporaire programmée.");
