import { render, screen, waitFor, cleanup } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { RecruitmentAdminPanel } from "./index";
const cand = { id: 1, full_name: "Aina Rakoto", email: "a@x.mg", job_id: 1, job_title: "Dev", pipeline_status: "cv_analyse", processing_status: "analysis_ready", match_score: 82, created_at: "2026-10-01 08:00:00" };
const job = { id: 1, title: "Dev", slug: "dev", status: "published", contract_type: "stage", criteria: [{ label: "Java", required: true, category: "competence" }], location: "Tana", urgent: false };
const detail = { candidature: { ...cand, phone: "0", analysis: { summary: "ok", recommendation: "match", score: { total: 82, components: [{ category: "competence", points: 30, max: 40 }] }, criteria: [{ criterion: "Java", assessment: "supported", evidence: "x", category: "competence", required: true, source: "cv" }], profile: { skills: ["java"] } }, notes: [] }, fichiers: [] };
function mock(url) {
  const u = String(url).replace("/api/admin/recrutement", "");
  if (u === "/moi") return { email: "a@b.c", display_name: "Admin", role: "admin" };
  if (u === "/offres") return { offres: [job] };
  if (u.startsWith("/candidatures/recherche")) return { total: 1, rows: [cand] };
  if (u.startsWith("/candidatures?")) return { candidatures: [cand], pagination: {} };
  if (u === "/candidatures/1") return detail;
  if (u.includes("/events")) return { evenements: [] };
  if (u.includes("/evaluations")) return { evaluations: [] };
  if (u.startsWith("/entretiens")) return { entretiens: [] };
  if (u === "/tableau-de-bord") return { totals: {}, alertes: {}, candidatures_par_statut: {}, candidatures_par_mois: [{ mois: "2026-09", n: 3 }], candidatures_par_offre: [], competences_frequentes: [] };
  if (u === "/equipe") return { membres: [{ email: "a@b.c", role: "admin", active: 1 }] };
  if (u.startsWith("/comptes")) return { comptes: [] };
  if (u.startsWith("/audit")) return { events: [{ id: 1, event_type: "job_created", actor: "a", created_at: "2026-10-01 08:00:00" }], next_before_id: null };
  if (u.startsWith("/parametres")) return { parametres: { criteria: {}, options: {} } };
  return {};
}
for (const page of ["dashboard", "offers", "candidates", "pipeline", "matching", "search", "interviews", "reports", "alerts", "team", "journal", "settings", "candidates/1"]) {
  test(`renders ${page}`, async () => {
    window.location.hash = `#/${page}`;
    vi.stubGlobal("fetch", vi.fn(async (url) => ({ ok: true, status: 200, json: async () => mock(url) })));
    const errors = vi.spyOn(console, "error");
    render(<RecruitmentAdminPanel />);
    await screen.findByText("Recrutement assisté par IA");
    await new Promise((r) => setTimeout(r, 120));
    expect(errors.mock.calls.filter((c) => /Warning|Error|Uncaught/.test(String(c[0])))).toEqual([]);
    cleanup(); errors.mockRestore();
  });
}
