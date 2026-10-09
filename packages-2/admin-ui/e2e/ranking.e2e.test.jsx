import { fireEvent, render, screen, waitFor, within, act } from "@testing-library/react";
import { expect, test } from "vitest";
import { RecruitmentAdminPanel } from "../src/index";

const go = async (hash) => { await act(async () => { window.location.hash = hash; window.dispatchEvent(new HashChangeEvent("hashchange")); }); await new Promise((r) => setTimeout(r, 700)); };
const pickOffer = async (title) => {
  const select = await screen.findByLabelText("Offre");
  const option = [...select.querySelectorAll("option")].find((o) => o.textContent === title);
  fireEvent.change(select, { target: { value: option.value } });
};

test("classement, note RH, score final et convocations groupées contre le vrai backend", async () => {
  render(<RecruitmentAdminPanel apiBaseUrl="http://127.0.0.1:5996/api/admin/recrutement" />);
  expect(await screen.findByText("Aina Rakoto", {}, { timeout: 8000 })).toBeInTheDocument();
  await go("#/ranking");
  await pickOffer("Stagiaire développeur web");
  expect(await screen.findByText("Hery Randria", {}, { timeout: 6000 })).toBeInTheDocument();
  expect(screen.getByText(/Aucune date limite : vous pouvez convoquer/)).toBeInTheDocument();
  // Note RH /20 saisie dans le classement
  const hr = screen.getByLabelText("Note RH de Aina Rakoto, sur 20");
  fireEvent.change(hr, { target: { value: "18" } });
  fireEvent.blur(hr);
  await waitFor(() => expect(screen.getAllByText("provisoire").length).toBeGreaterThan(0), { timeout: 5000 });
  // Sélection des 2 premiers puis convocation groupée
  fireEvent.click(screen.getByRole("button", { name: "Sélectionner" }));
  const send = await screen.findByRole("button", { name: /Convoquer \(2\)/ });
  expect(send).toBeEnabled();
  fireEvent.click(send);
  const dialog = await screen.findByRole("dialog", { name: "Convoquer à un entretien" });
  const start = new Date(Date.now() + 2 * 864e5); start.setMinutes(0, 0, 0);
  fireEvent.change(within(dialog).getByLabelText("Premier entretien"), { target: { value: new Date(start.getTime() - start.getTimezoneOffset() * 60000).toISOString().slice(0, 16) } });
  fireEvent.click(within(dialog).getByRole("button", { name: /Envoyer 2 convocations/ }));
  expect(await within(dialog).findByText(/2 entretiens planifiés|2 entretien planifié/, {}, { timeout: 6000 })).toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "Fermer" }));
  // Les candidats convoqués ne sont plus sélectionnables
  await waitFor(() => expect(screen.getByLabelText("Convoquer Aina Rakoto")).toBeDisabled(), { timeout: 5000 });

  // Offre dont la date limite n'est pas passée : bouton grisé
  await pickOffer("Offre verrouillée");
  expect(await screen.findByText("Lova Andry", {}, { timeout: 6000 })).toBeInTheDocument();
  expect(screen.getByText(/Les dépôts sont ouverts jusqu'au/)).toBeInTheDocument();
  const locked = screen.getByRole("button", { name: /Convocations verrouillées/ });
  expect(locked).toBeDisabled();

  // Fiche candidat : les trois composantes et le score final
  fireEvent.click(screen.getAllByRole("button", { name: "Dossier" })[0]);
  await waitFor(() => expect(document.querySelector('[aria-label="Score final"]')).not.toBeNull(), { timeout: 6000 });
  const tiles = document.querySelector('[aria-label="Score final"]');
  expect(tiles.textContent).toMatch(/Analyse IA/);
  expect(tiles.textContent).toMatch(/\/170/);
}, 90000);
