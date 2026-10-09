import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";
import { RecruitmentAdminPanel } from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function mount(open) {
  const rows = [
    { rank: 1, id: 2, full_name: "Bea Rabe", job_title: "Dev", processing_status: "analysis_ready", pipeline_status: "evaluation", match_score: 70, interview_score: 40, hr_score: 15, final_score: 125, final_complete: true, hr_decision: "to_review" },
    { rank: 2, id: 1, reference: "TZR-2026-00001", full_name: "Aina Rakoto", job_title: "Dev", processing_status: "analysis_ready", pipeline_status: "cv_analyse", match_score: 82, interview_score: null, hr_score: null, final_score: 82, final_complete: false, hr_decision: "to_review" }
  ];
  const job = { id: 1, title: "Dev", status: "published", criteria: [], interviews_open: open, interviews_opens_at: open ? null : "2030-01-10T10:00:00.000Z" };
  const routes = {
    "/moi": { email: "rh@x.mg", display_name: "RH", role: "recruteur" },
    "/offres": { offres: [job] },
    "/candidatures?limit=100": { candidatures: [], pagination: {} },
    "/offres/1/classement": { offre: { id: 1, title: "Dev", interviews_open: open, interviews_opens_at: job.interviews_opens_at }, candidatures: rows, maximums: { final: 170 } }
  };
  vi.stubGlobal("fetch", vi.fn(async (url) => ({ ok: true, status: 200, json: async () => routes[String(url).replace("/api/admin/recrutement", "")] || {} })));
  window.location.hash = "#/matching";
  render(<RecruitmentAdminPanel />);
}

test("locks the interview invitation button until the offer deadline has passed", async () => {
  mount(false);
  fireEvent.change(await screen.findByLabelText("Offre"), { target: { value: "1" } });
  expect(await screen.findByText("Bea Rabe")).toBeInTheDocument();
  expect(screen.getByText(/Invitations aux entretiens verrouillées/)).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Sélectionner Aina Rakoto"));
  expect(screen.getByRole("button", { name: /Inviter à l'entretien/ })).toBeDisabled();
});

test("shows the ranking by final score and enables invitations once the offer is open", async () => {
  mount(true);
  fireEvent.change(await screen.findByLabelText("Offre"), { target: { value: "1" } });
  await screen.findByText("Bea Rabe");
  const names = screen.getAllByRole("row").slice(1).map((row) => row.textContent);
  expect(names[0]).toContain("Bea Rabe");
  expect(names[0]).toContain("125");
  expect(screen.getByText("TZR-2026-00001")).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText("Sélectionner Aina Rakoto"));
  await waitFor(() => expect(screen.getByRole("button", { name: /Inviter à l'entretien \(1\)/ })).toBeEnabled());
});
