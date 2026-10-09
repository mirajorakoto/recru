const { expect, test } = require("@playwright/test");

async function tabUntilFocused(page, locator, max = 15) {
  for (let index = 0; index < max; index += 1) {
    await page.keyboard.press("Tab");
    // eslint-disable-next-line no-await-in-loop
    if (await locator.evaluate((element) => element === document.activeElement)) return true;
  }
  return false;
}

test("the public list and direct job page expose the required job information", async ({ page }) => {
  await page.goto("/recrutement");
  await expect(page.getByRole("heading", { name: "Offres en cours" })).toBeVisible();
  await expect(page.getByText("Stagiaire développeur web")).toBeVisible();
  await expect(page.locator(".tz-job-card").filter({ hasText: "Stagiaire développeur web" }).getByText("Fianarantsoa")).toBeVisible();

  await page.goto("/recrutement/stage-developpeur-web");
  await expect(page.getByRole("heading", { name: "Stagiaire développeur web" })).toBeVisible();
  await expect(page.getByText("Hybride").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Postuler" })).toBeVisible();
});

test("an unknown public job remains understandable and navigable", async ({ page }) => {
  await page.goto("/recrutement/introuvable");
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(page.getByRole("link", { name: "Voir les offres en cours" })).toBeVisible();
});

test("the job list can be filtered by location, contract and free text search", async ({ page }) => {
  await page.goto("/recrutement");
  await expect(page.locator(".tz-job-card")).toHaveCount(3);

  await page.getByLabel("Filtrer par localisation").selectOption("Antananarivo");
  await expect(page.locator(".tz-job-card")).toHaveCount(2);
  await expect(page.getByText("Stagiaire développeur web")).toHaveCount(0);
  await page.getByLabel("Filtrer par localisation").selectOption("");

  await page.getByLabel("Rechercher un poste, une compétence").fill("support");
  await expect(page.locator(".tz-job-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Support client" })).toBeVisible();
});

test("an invalid CV is rejected client-side before it can be submitted", async ({ page }) => {
  await page.goto("/recrutement/stage-developpeur-web/postuler");
  await page.getByLabel("CV").setInputFiles({
    name: "cv.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("hello")
  });
  await expect(page.locator(".tz-file-chip.is-rejected")).toBeVisible();
  await expect(page.getByText("Format de fichier non accepté. Utilisez un fichier PDF ou DOCX.")).toBeVisible();
});

test("a synthetic candidate can submit a complete public application", async ({ page }) => {
  await page.goto("/recrutement/stage-developpeur-web/postuler");
  await page.getByLabel("Nom complet").fill("Candidate E2E");
  await page.getByLabel("Adresse e-mail").fill(`candidate-e2e-${Date.now()}@example.test`);
  await page.getByLabel("Téléphone").fill("000000000");
  await page.getByLabel("CV").setInputFiles({
    name: "cv-synthetique.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF", "ascii")
  });
  await page.getByLabel(/J’accepte le traitement/).check();
  await page.getByRole("button", { name: "Envoyer ma candidature" }).click();
  await expect(page.getByRole("heading", { name: "Candidature envoyée" })).toBeVisible();
  await expect(page.getByText("Référence de dépôt")).toBeVisible();
  await expect(page.getByText(/^TZR-\d{4}-[0-9A-F]{4}$/)).toBeVisible();
});

test("the local RH cockpit is available without a second login", async ({ page }) => {
  await page.goto("/admin/recrutement");
  await expect(page.getByRole("heading", { name: "Vue d’ensemble" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Navigation du recrutement" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Pipeline de candidatures" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "À traiter aujourd’hui" })).toBeVisible();

  await page.getByRole("button", { name: /Offres/ }).click();
  await expect(page.getByRole("heading", { name: "Publications" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Nouvelle offre", exact: true })).toBeVisible();
});

test("the public interface has no horizontal overflow at mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/recrutement");
  await expect(page.getByRole("heading", { name: "Offres en cours" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("the mobile menu toggle reveals the recruitment and RH links", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/recrutement");
  const panel = page.locator(".tz-header-mobile-panel");
  await expect(panel).not.toHaveClass(/is-open/);
  await page.getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(panel).toHaveClass(/is-open/);
  await expect(panel.getByRole("link", { name: "Espace RH" })).toBeVisible();
});

test("public keyboard navigation keeps focus visible and opens an offer", async ({ page }) => {
  await page.goto("/recrutement");
  const offerLink = page.getByRole("link", { name: "Voir l’offre" }).first();
  expect(await tabUntilFocused(page, offerLink)).toBe(true);
  await expect.poll(() => offerLink.evaluate((element) => getComputedStyle(element).boxShadow !== "none")).toBe(true);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Stagiaire développeur web" })).toBeVisible();
});

test("public form labels and RH tabs stay keyboard-accessible", async ({ page }) => {
  await page.goto("/recrutement/stage-developpeur-web/postuler");
  const fullName = page.getByLabel("Nom complet");
  expect(await tabUntilFocused(page, fullName)).toBe(true);
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Adresse e-mail")).toBeFocused();

  await page.goto("/admin/recrutement");
  const dashboardTab = page.getByRole("button", { name: "Tableau de bord" });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: /tableau de bord/i })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dashboardTab).toBeFocused();
  await expect.poll(() => dashboardTab.evaluate((element) => getComputedStyle(element).boxShadow !== "none")).toBe(true);
  await page.keyboard.press("Tab");
  const offersTab = page.getByRole("button", { name: "Offres" });
  await expect(offersTab).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Publications" })).toBeVisible();
});

test("public layouts remain contained at tablet and desktop widths", async ({ page }) => {
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/recrutement");
    // eslint-disable-next-line no-await-in-loop
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test("RH controls remain reachable at mobile, tablet and desktop widths", async ({ page }) => {
  for (const width of [320, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/admin/recrutement");
    // eslint-disable-next-line no-await-in-loop
    await expect(page.getByRole("button", { name: /Offres/ })).toBeVisible();
    // eslint-disable-next-line no-await-in-loop
    await page.getByRole("button", { name: /Offres/ }).click();
    // eslint-disable-next-line no-await-in-loop
    await expect(page.getByRole("button", { name: "Nouvelle offre", exact: true })).toBeVisible();
    // eslint-disable-next-line no-await-in-loop
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
