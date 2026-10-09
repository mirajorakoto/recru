import { cleanup, render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { buildIcs, CandidatePortal } from "./portal";
import { RecruitmentPublicRoutes } from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.pushState({}, "", "/"); });

const account = { id: 1, email: "aina@mail.mg", full_name: "Aina Rakoto", phone: "034", candidate_location: "Tana" };
function stub(handler) {
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    const path = String(url).replace("/api/recrutement", "");
    const result = handler(path, options);
    if (result === 401) return { ok: false, status: 401, json: async () => ({ error: "Authentification requise" }) };
    return { ok: true, status: 200, json: async () => result };
  }));
}

test("shows login and registration when there is no session", async () => {
  stub(() => 401);
  render(<CandidatePortal pathname="/candidat" />);
  expect(await screen.findByRole("heading", { name: "Votre espace candidat" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("tab", { name: "Créer un compte" }));
  expect(screen.getByLabelText(/Nom complet/)).toBeInTheDocument();
  expect(screen.getByText(/Au moins 10 caractères/)).toBeInTheDocument();
});

test("shows the applications tracker, interviews and unread notifications", async () => {
  stub((path) => ({
    "/compte/moi": { compte: account },
    "/compte/candidatures": { candidatures: [{ id: 1, public_id: "abc123", pipeline_status: "preselectionnee", processing_status: "analysis_ready", hr_decision: "to_review", created_at: "2026-10-01 08:00:00", job_title: "Développeur web", job_slug: "dev-web" }] },
    "/compte/entretiens": { entretiens: [{ id: 5, application_id: 1, scheduled_at: new Date(Date.now() + 86400000).toISOString(), duration_min: 45, mode: "visio", location: "https://meet.example/x", status: "planned", job_title: "Développeur web" }] },
    "/compte/notifications": { notifications: [{ id: 9, title: "Candidature enregistrée", body: "Bien reçue", read_at: null, created_at: "2026-10-01 08:00:00" }], unread: 1 }
  }[path] || {}));
  render(<CandidatePortal pathname="/candidat/candidatures" />);
  expect(await screen.findByText("Développeur web")).toBeInTheDocument();
  expect(screen.getByRole("list", { name: "Progression de la candidature" })).toBeInTheDocument();
  expect(screen.getAllByText("Présélectionnée").length).toBeGreaterThan(0);
  expect(screen.getByRole("button", { name: /Retirer ma candidature/ })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Notifications/ })).toHaveTextContent("1");
});

test("builds a valid calendar file for an interview", () => {
  const ics = buildIcs({ id: 5, scheduled_at: "2026-10-12T07:00:00.000Z", duration_min: 30, mode: "visio", location: "https://meet.example/x", job_title: "Dev, web" });
  expect(ics).toContain("BEGIN:VEVENT");
  expect(ics).toContain("DTSTART:20261012T070000Z");
  expect(ics).toContain("DTEND:20261012T073000Z");
  expect(ics).toContain("SUMMARY:Entretien — Dev\\, web");
});

test("routes /candidat inside the public site shell with the account navigation link", async () => {
  stub(() => 401);
  window.history.pushState({}, "", "/candidat");
  render(<RecruitmentPublicRoutes />);
  expect(await screen.findByRole("heading", { name: "Votre espace candidat" })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Espace candidat" }).length).toBeGreaterThan(0);
});

const job = { offre: { public_id: "p1", slug: "dev-web", title: "Développeur web", criteria: [] } };

test("applying is only possible with an account: visitors are sent to create one, and come back", async () => {
  stub((path) => (path === "/compte/moi" ? 401 : path === "/offres/dev-web" ? job : {}));
  window.history.pushState({}, "", "/recrutement/dev-web/postuler");
  render(<RecruitmentPublicRoutes />);
  expect(await screen.findByRole("heading", { name: "Créez votre compte pour postuler" })).toBeInTheDocument();
  expect(screen.queryByLabelText(/Nom complet/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Créer mon compte/ }).getAttribute("href")).toBe("/candidat?mode=inscription&retour=%2Frecrutement%2Fdev-web%2Fpostuler");
});

test("an incomplete profile must be completed before applying", async () => {
  stub((path) => (path === "/compte/moi" ? { compte: { ...account, phone: "" } } : path === "/offres/dev-web" ? job : {}));
  window.history.pushState({}, "", "/recrutement/dev-web/postuler");
  render(<RecruitmentPublicRoutes />);
  expect(await screen.findByRole("heading", { name: "Complétez votre profil" })).toBeInTheDocument();
  expect(screen.getByText(/téléphone/)).toBeInTheDocument();
});

test("a complete account only uploads the CV; the identity comes from the account and the real reference is shown", async () => {
  const calls = [];
  stub((path, options) => {
    if (path === "/compte/moi") return { compte: account };
    if (path === "/offres/dev-web") return job;
    if (path === "/offres/p1/candidatures") { calls.push(options.body); return { application_id: "u-1", reference: "TZR-2026-00042", status: "queued" }; }
    return {};
  });
  window.history.pushState({}, "", "/recrutement/dev-web/postuler");
  render(<RecruitmentPublicRoutes />);
  expect(await screen.findByText("aina@mail.mg")).toBeInTheDocument();
  expect(screen.queryByLabelText(/Adresse e-mail/)).not.toBeInTheDocument();
  expect(screen.getByText("Identifiant (e-mail)")).toBeInTheDocument();
  const cv = new File(["%PDF-1.4 %%EOF"], "cv.pdf", { type: "application/pdf" });
  fireEvent.change(document.querySelector('input[type="file"][name="cv"]'), { target: { files: [cv] } });
  fireEvent.click(document.querySelector('input[name="consent"]'));
  fireEvent.click(screen.getByRole("button", { name: /Envoyer ma candidature/ }));
  await waitFor(() => expect(calls.length).toBe(1));
  expect([...calls[0].keys()].sort()).toEqual(["consent", "cv"]);
  await waitFor(() => expect(window.location.search).toContain("success=TZR-2026-00042"));
});

test("the candidate list shows each application's reference", async () => {
  stub((path) => ({
    "/compte/moi": { compte: account },
    "/compte/candidatures": { candidatures: [{ id: 1, public_id: "abc", reference: "TZR-2026-00042", pipeline_status: "nouvelle", processing_status: "queued", hr_decision: "to_review", created_at: "2026-10-01 08:00:00", job_title: "Développeur web", job_slug: "dev-web" }] },
    "/compte/entretiens": { entretiens: [] }, "/compte/notifications": { notifications: [], unread: 0 }
  }[path] || {}));
  render(<CandidatePortal pathname="/candidat/candidatures" />);
  expect(await screen.findByText("TZR-2026-00042")).toBeInTheDocument();
  expect(screen.getByText(/Identifiant : aina@mail.mg/)).toBeInTheDocument();
});
