import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { CandidatePortal } from "./index";

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

test("anonymous visitors get the login form and can switch to registration", async () => {
  mockApi({ "GET /compte/moi": { status: 401, body: { error: "Connexion requise." } } });
  render(<CandidatePortal />);
  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Créer un compte" }));
  expect(screen.getByRole("heading", { name: "Créer mon compte" })).toBeInTheDocument();
  expect(screen.getByText(/J'accepte que mes données/)).toBeInTheDocument();
});

test("a signed-in candidate sees applications, interviews and unread notifications", async () => {
  mockApi({
    "GET /compte/moi": { compte: { id: 1, email: "a@x.mg", full_name: "Aina R", phone: "034" } },
    "GET /offres": { offres: [{ public_id: "p1", title: "Dev", summary: "s", department: "Technique", required_diploma: "bac+3", languages: ["Français"] }] },
    "GET /compte/notifications": { notifications: [{ id: 1, title: "Entretien programmé", body: "Le 10 octobre", created_at: new Date().toISOString(), read_at: null }], unread: 1 },
    "GET /compte/candidatures": { candidatures: [{ public_id: "c1", job_title: "Dev", pipeline_status: "entretien", created_at: new Date().toISOString(), hr_decision: "to_review" }] },
    "GET /compte/entretiens": { entretiens: [{ id: 1, job_title: "Dev", scheduled_at: new Date(Date.now() + 864e5).toISOString(), duration_min: 45, mode: "visio", location: "https://meet.x/abc", status: "planned" }] }
  });
  render(<CandidatePortal />);
  expect(await screen.findByText("Bonjour Aina R")).toBeInTheDocument();
  expect(await screen.findByText("Diplôme : bac+3")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Mes candidatures/ }));
  expect(await screen.findByText("Entretien programmé", { selector: "strong" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Retirer ma candidature" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Mes entretiens" }));
  expect(await screen.findByText(/Visioconférence/)).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole("button", { name: /Notifications/ })).toHaveTextContent("1"));
});
