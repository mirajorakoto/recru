import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { ApplicationForm, AtsResources, CandidatePortal } from "./index";

afterEach(() => vi.unstubAllGlobals());

function mockApi(routes) {
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    const key = `${options.method || "GET"} ${String(url).replace("/api/recrutement", "").split("?")[0]}`;
    const handler = routes[key];
    if (!handler) return { ok: false, status: 404, json: async () => ({ error: `route ${key}` }) };
    const result = typeof handler === "function" ? handler(options) : handler;
    return { ok: result.status ? result.status < 400 : true, status: result.status || 200, json: async () => result.body ?? result };
  }));
}

test("explains ATS compatibility without presenting it as a file format", () => {
  render(<AtsResources />);
  expect(screen.getByText(/n’est pas un format de fichier/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /modèle docx/i })).toHaveAttribute("download");
});

test("anonymous visitors get the login form and can switch to registration", async () => {
  mockApi({ "GET /compte/moi": { status: 401, body: { error: "Connexion requise." } } });
  render(<CandidatePortal />);
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Créer un compte" }));
  expect(screen.getByRole("heading", { name: "Créer mon compte" })).toBeInTheDocument();
  expect(screen.getByText(/J'accepte que mes données/)).toBeInTheDocument();
});

test("a signed-in candidate follows applications, interviews and unread notifications", async () => {
  mockApi({
    "GET /compte/moi": { compte: { id: 1, email: "a@x.mg", full_name: "Aina R", phone: "034" } },
    "GET /compte/notifications": { notifications: [{ id: 1, title: "Entretien programmé", body: "Le 10 octobre", created_at: new Date().toISOString(), read_at: null }], unread: 1 },
    "GET /compte/candidatures": { candidatures: [{ public_id: "c1c1c1c1-0000", job_title: "Dev", pipeline_status: "entretien", created_at: new Date().toISOString(), hr_decision: "to_review" }] },
    "GET /compte/entretiens": { entretiens: [{ id: 1, job_title: "Dev", scheduled_at: new Date(Date.now() + 864e5).toISOString(), duration_min: 45, mode: "visio", location: "https://meet.x/abc", status: "planned" }] }
  });
  render(<CandidatePortal />);
  expect(await screen.findByText("Bonjour Aina R")).toBeInTheDocument();
  expect(await screen.findByText("Entretien programmé", { selector: "strong" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retirer ma candidature" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Mes entretiens" }));
  expect(await screen.findByText(/Visioconférence/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: /Notifications/ })).toHaveTextContent("1"));
});

test("the application form is attached to the account and skips the captcha when signed in", async () => {
  mockApi({
    "GET /compte/moi": { compte: { id: 1, email: "a@x.mg", full_name: "Aina R", phone: "034 11" } },
    "GET /offres/dev": { offre: { public_id: "p1", slug: "dev", title: "Développeur", summary: "s", description: "d", criteria: [] } }
  });
  render(<ApplicationForm apiBaseUrl="/api/recrutement" slug="dev" turnstileSiteKey="site-key" />);
  expect(await screen.findByText(/Connecté\(e\) en tant que/)).toBeInTheDocument();
  const email = document.getElementById("email");
  expect(email).toHaveValue("a@x.mg");
  expect(email).toHaveAttribute("readonly");
  expect(document.getElementById("phone")).toHaveValue("034 11");
  expect(screen.queryByLabelText("Vérification anti-robot")).toBeNull();
  expect(screen.getByRole("button", { name: /Envoyer ma candidature/ })).toBeEnabled();
});
