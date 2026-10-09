import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
let server;
const API = "http://127.0.0.1:5996/api";
const apply = async (jobPublicId, name, email) => {
  const reg = await fetch(`${API}/recrutement/compte/inscription`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: "motdepasse12", full_name: name, phone: "034", consent: true }) });
  const cookie = reg.headers.get("set-cookie").split(";")[0];
  const form = new FormData();
  form.append("consent", "true"); form.append("phone", "034");
  form.append("cv", new Blob([Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF\n")], { type: "application/pdf" }), "cv.pdf");
  const res = await fetch(`${API}/recrutement/offres/${jobPublicId}/candidatures`, { method: "POST", headers: { cookie }, body: form });
  if (res.status !== 202) throw new Error("seed " + res.status + await res.text());
};
export async function setup() {
  const dir = mkdtempSync(path.join(tmpdir(), "e2e-"));
  server = spawn("node", ["demo-server.js"], { cwd: "../backend", stdio: "ignore", env: { ...process.env, NODE_ENV: "development", PORT: "5996", PRIVACY_CONTACT_EMAIL: "rh@example.mg", DB_PATH: path.join(dir, "db.sqlite"), RECRUITMENT_STORAGE_DIR: path.join(dir, "files") } });
  for (let i = 0; i < 40; i += 1) { try { if ((await fetch(`${API}/health`, { signal: AbortSignal.timeout(1000) })).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
  const jobs = (await (await fetch(`${API}/recrutement/offres`)).json()).offres;
  await apply(jobs[0].public_id, "Aina Rakoto", "aina@example.mg");
  await apply(jobs[0].public_id, "Hery Randria", "hery@example.mg");
  // Offre avec date limite future : les convocations doivent rester verrouillées.
  const created = await fetch(`${API}/admin/recrutement/offres`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ slug: "offre-verrouillee", title: "Offre verrouillée", summary: "s", description: "d", location: "Tana", status: "published", application_deadline: new Date(Date.now() + 20 * 864e5).toISOString(), criteria: [{ label: "Java", required: true }] }) });
  const locked = (await created.json()).offre;
  await apply(locked.public_id, "Lova Andry", "lova@example.mg");
  for (let i = 0; i < 60; i += 1) {
    const list = (await (await fetch(`${API}/admin/recrutement/candidatures`)).json()).candidatures || [];
    if (list.length === 3 && list.every((item) => item.processing_status === "analysis_ready")) break;
    await new Promise((r) => setTimeout(r, 500));
  }
}
export async function teardown() { server?.kill(); }
