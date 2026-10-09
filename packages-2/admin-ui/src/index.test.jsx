import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PIPELINE_STATUSES, RecruitmentAdminPanel, RichEditor, ScorePanel } from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.location.hash = ""; });

test("offers only the approved rich-text controls", () => {
  render(<RichEditor value="<p>Bonjour</p>" onChange={() => {}} />);
  expect(screen.getByRole("button", { name: "G" })).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: /liste/i })).toHaveLength(2);
  expect(screen.getByRole("textbox")).toBeInTheDocument();
});

test("exposes the nine pipeline stages used by the backend", () => {
  expect(PIPELINE_STATUSES.map(([value]) => value)).toEqual([
    "nouvelle", "en_analyse", "cv_analyse", "preselectionnee", "entretien",
    "evaluation", "en_attente", "acceptee", "refusee"
  ]);
});

test("explains the AI score: components, matches, gaps and the human-review notice", () => {
  const analysis = {
    recommendation: "strong_match",
    score: { total: 83, components: [{ category: "competence", points: 36, max: 40 }, { category: "formation", points: 15, max: 15 }], disclaimer: "Indicateur d'aide, vérification humaine nécessaire." },
    criteria: [
      { criterion: "Java", assessment: "supported" },
      { criterion: "React", assessment: "not_found" },
      { criterion: "Docker", assessment: "uncertain" }
    ],
    profile: { experience_years: 2, highest_education_level: "bac+3" }
  };
  render(<ScorePanel analysis={analysis} />);
  expect(screen.getByText("Forte correspondance")).toBeInTheDocument();
  expect(screen.getByText("✓ Java")).toBeInTheDocument();
  expect(screen.getByText("✗ React")).toBeInTheDocument();
  expect(screen.getByText(/Docker \(à confirmer\)/)).toBeInTheDocument();
  expect(screen.getByText("36/40")).toBeInTheDocument();
  expect(screen.getByText(/vérification humaine/i)).toBeInTheDocument();
});

test("shows the login form when the API answers 401", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: "Authentification requise" }) })));
  render(<RecruitmentAdminPanel apiBaseUrl="/api/admin/recrutement" />);
  expect(await screen.findByText("Accès RH")).toBeInTheDocument();
});

test("renders the dashboard and role-based navigation once authenticated", async () => {
  const routes = {
    "/moi": { email: "rh@techzone.lat", display_name: "RH Démo", role: "recruteur" },
    "/offres": { offres: [] },
    "/candidatures?limit=100": { candidatures: [{ id: 1, full_name: "Aina Rakoto", email: "a@x.mg", job_title: "Stagiaire web", pipeline_status: "cv_analyse", processing_status: "analysis_ready", match_score: 82, created_at: "2026-10-01 08:00:00" }], pagination: { next_cursor: null } },
    "/tableau-de-bord": { totals: { offres: 1, offres_publiees: 1, candidatures: 1, entretiens: 0, recrutes: 0, score_moyen: 82 }, alertes: {}, candidatures_par_statut: { cv_analyse: 1 }, candidatures_par_mois: [], candidatures_par_offre: [], competences_frequentes: [] }
  };
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const key = String(url).replace("/api/admin/recrutement", "").split("&status")[0];
    const hit = routes[key] || (key.startsWith("/entretiens") ? { entretiens: [] } : {});
    return { ok: true, status: 200, json: async () => hit };
  }));
  render(<RecruitmentAdminPanel apiBaseUrl="/api/admin/recrutement" />);
  expect(await screen.findByText("Aina Rakoto")).toBeInTheDocument();
  expect(screen.getByText("Recrutement assisté par IA")).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByText("Journal d'audit")).not.toBeInTheDocument());
});

function mockAdminApi(routes) {
  vi.stubGlobal("fetch", vi.fn(async (url) => {
    const path = String(url).replace("/api/admin/recrutement", "").split("?")[0];
    const body = routes[path];
    return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({ error: `route ${path}` }) };
  }));
}

const baseRoutes = {
  "/moi": { email: "rh@x.mg", display_name: "RH", role: "recruteur" },
  "/candidatures": { candidatures: [], pagination: { next_cursor: null } },
  "/tableau-de-bord": { totals: {}, alertes: {} }
};

test("ranking lists applications by final score and greys out convocations before the deadline", async () => {
  const deadline = new Date(Date.now() + 5 * 864e5).toISOString();
  mockAdminApi({
    ...baseRoutes,
    "/offres": { offres: [{ id: 7, title: "Dev", status: "published", criteria: [], application_deadline: deadline, interviews_unlocked: false }] },
    "/offres/7/classement": {
      offre: { id: 7, title: "Dev", status: "published", application_deadline: deadline, interviews_unlocked: false, interviews_unlock_at: deadline },
      maxima: { ai: 100, interview: 50, hr: 20, final: 170 },
      rows: [
        { id: 1, full_name: "Alice", rank: 1, processing_status: "analysis_ready", pipeline_status: "cv_analyse", hr_score: 18, scores: { ai: 90, interview: 45, hr: 18, final: 153, complete: true } },
        { id: 2, full_name: "Bruno", rank: 2, processing_status: "analysis_ready", pipeline_status: "cv_analyse", hr_score: null, scores: { ai: 70, interview: null, hr: null, final: 70, complete: false } }
      ]
    }
  });
  window.location.hash = "#/ranking";
  render(<RecruitmentAdminPanel apiBaseUrl="/api/admin/recrutement" />);
  const select = await screen.findByLabelText("Offre");
  fireEvent.change(select, { target: { value: "7" } });
  expect(await screen.findByText("Alice")).toBeInTheDocument();
  const names = screen.getAllByRole("row").map((row) => row.textContent).filter((text) => /Alice|Bruno/.test(text));
  expect(names[0]).toMatch(/Alice/);
  expect(names[1]).toMatch(/Bruno/);
  expect(screen.getByText("complet")).toBeInTheDocument();
  expect(screen.getByText("provisoire")).toBeInTheDocument();
  expect(screen.getByText(/Les dépôts sont ouverts jusqu'au/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /Convocations verrouillées/ })).toBeDisabled();
});

test("the read-only role gets the ranking without selection or HR score inputs", async () => {
  mockAdminApi({
    ...baseRoutes,
    "/moi": { email: "lect@x.mg", display_name: "Lecteur", role: "lecteur" },
    "/offres": { offres: [{ id: 7, title: "Dev", status: "published", criteria: [] }] },
    "/offres/7/classement": {
      offre: { id: 7, title: "Dev", status: "published", interviews_unlocked: true },
      maxima: { ai: 100, interview: 50, hr: 20, final: 170 },
      rows: [{ id: 1, full_name: "Alice", rank: 1, processing_status: "analysis_ready", scores: { ai: 90, interview: null, hr: 12, final: 102, complete: false } }]
    }
  });
  window.location.hash = "#/ranking";
  render(<RecruitmentAdminPanel apiBaseUrl="/api/admin/recrutement" />);
  fireEvent.change(await screen.findByLabelText("Offre"), { target: { value: "7" } });
  expect(await screen.findByText("Alice")).toBeInTheDocument();
  expect(screen.queryByLabelText(/Note RH de Alice/)).toBeNull();
  expect(screen.queryByLabelText("Convoquer Alice")).toBeNull();
  expect(screen.queryByRole("button", { name: /Convoquer/ })).toBeNull();
});
