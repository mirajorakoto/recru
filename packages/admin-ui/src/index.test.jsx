import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { PIPELINE_STATUSES, RecruitmentAdminPanel, RichEditor, ScorePanel } from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

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

const jsonResponse = (status, body) => ({ ok: status < 400, status, json: async () => body });

test("shows the login form when the API answers 401 and an RH account exists", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { error: "Connexion RH requise.", code: "login_required" })));
  render(<RecruitmentAdminPanel apiBaseUrl="/api/admin/recrutement" />);
  expect(await screen.findByText("Accès RH")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Mot de passe oublié ?" })).toBeInTheDocument();
  expect(screen.queryByLabelText("Confirmer le mot de passe")).not.toBeInTheDocument();
});

test("the first visitor is asked to create the single RH account", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => jsonResponse(401, { error: "Aucun compte RH", code: "setup_required" })));
  render(<RecruitmentAdminPanel apiBaseUrl="/api/admin/recrutement" />);
  expect(await screen.findByRole("heading", { name: "Créer le compte RH" })).toBeInTheDocument();
  expect(screen.getByLabelText("Confirmer le mot de passe")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Mot de passe oublié ?" })).not.toBeInTheDocument();
});

test("account creation checks that both passwords match before calling the API", async () => {
  const fetchMock = vi.fn(async () => jsonResponse(401, { error: "Aucun compte RH", code: "setup_required" }));
  vi.stubGlobal("fetch", fetchMock);
  render(<RecruitmentAdminPanel apiBaseUrl="/api/admin/recrutement" />);
  await screen.findByRole("heading", { name: "Créer le compte RH" });
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rh@techzone.lat" } });
  fireEvent.change(screen.getByLabelText(/^Mot de passe/), { target: { value: "MotDePasse2026" } });
  fireEvent.change(screen.getByLabelText("Confirmer le mot de passe"), { target: { value: "Different2026" } });
  fireEvent.click(screen.getByRole("button", { name: "Créer le compte RH" }));
  expect(await screen.findByText("Les deux mots de passe ne sont pas identiques.")).toBeInTheDocument();
  expect(fetchMock.mock.calls.some(([url]) => String(url).endsWith("/auth/setup"))).toBe(false);
});

test("forgot password sends the RH e-mail to the API and returns to the login form", async () => {
  const fetchMock = vi.fn(async (url) => (String(url).endsWith("/auth/forgot-password")
    ? jsonResponse(202, { status: "sent" })
    : jsonResponse(401, { error: "Connexion RH requise.", code: "login_required" })));
  vi.stubGlobal("fetch", fetchMock);
  render(<RecruitmentAdminPanel apiBaseUrl="/api/admin/recrutement" />);
  fireEvent.click(await screen.findByRole("button", { name: "Mot de passe oublié ?" }));
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rh@techzone.lat" } });
  fireEvent.click(screen.getByRole("button", { name: "Envoyer un nouveau mot de passe" }));
  expect(await screen.findByText(/un nouveau mot de passe vient de lui être envoyé/i)).toBeInTheDocument();
  const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/auth/forgot-password"));
  expect(JSON.parse(call[1].body)).toEqual({ email: "rh@techzone.lat" });
  expect(screen.getByRole("button", { name: "Se connecter" })).toBeInTheDocument();
});

test("a login attempt while no account exists switches to account creation", async () => {
  vi.stubGlobal("fetch", vi.fn(async (url) => (String(url).endsWith("/auth/login")
    ? jsonResponse(409, { error: "Aucun compte RH", code: "setup_required" })
    : jsonResponse(401, { error: "Connexion RH requise.", code: "login_required" }))));
  render(<RecruitmentAdminPanel apiBaseUrl="/api/admin/recrutement" />);
  await screen.findByText("Accès RH");
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: "rh@techzone.lat" } });
  fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "MotDePasse2026" } });
  fireEvent.click(screen.getByRole("button", { name: "Se connecter" }));
  expect(await screen.findByRole("heading", { name: "Créer le compte RH" })).toBeInTheDocument();
});

test("renders the dashboard once authenticated, with no team or role management", async () => {
  const routes = {
    "/moi": { email: "rh@techzone.lat", display_name: "RH Démo", role: "rh" },
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
  expect(screen.getByText("Responsable RH")).toBeInTheDocument();
  expect(screen.getByText("Compte RH et candidats")).toBeInTheDocument();
  expect(screen.getByText("Journal d'audit")).toBeInTheDocument();
  expect(screen.queryByText("Utilisateurs et rôles")).not.toBeInTheDocument();
});
