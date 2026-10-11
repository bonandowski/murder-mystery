import { expect, test, type Browser, type Page } from "@playwright/test";

// Richiede Supabase locale e LLM_PROVIDER=mock.
const SHOTS = process.env.E2E_SHOTS ?? "test-results/shots";

const consoleErrors: string[] = [];

async function newPlayer(browser: Browser) {
  const context = await browser.newContext({ ...test.info().project.use });
  context.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  const page = await context.newPage();
  return { context, page };
}

// caret "initial": evita che Playwright inietti stili prima dell'idratazione.
const shot = (page: Page, name: string, fullPage = false) =>
  page.screenshot({ path: `${SHOTS}/${name}`, fullPage, caret: "initial" });

async function ackPopups(page: Page) {
  const ack = page.getByTestId("popup-ack");
  for (let i = 0; i < 5 && (await ack.isVisible().catch(() => false)); i++) {
    await ack.click();
    await page.waitForTimeout(200);
  }
}

test("serata completa con 4 telefoni e una TV", async ({ browser }) => {
  const host = await newPlayer(browser);
  await host.page.goto("/");
  await shot(host.page, "01-home.png", true);
  await host.page.locator("form").filter({ hasText: "Organizza una cena" }).getByPlaceholder("Es. Giulia").fill("Leo");
  await host.page.getByRole("button", { name: "Crea partita" }).click();
  const code = (await host.page.getByTestId("game-code").textContent())!.trim();
  expect(code).toMatch(/^[A-Z0-9]{6}$/);

  const players = [];
  for (const name of ["Giulia", "Marco", "Sara"]) {
    const p = await newPlayer(browser);
    await p.page.goto(`/join/${code}`);
    await p.page.getByPlaceholder("Es. Giulia").fill(name);
    await p.page.getByRole("button", { name: "Entra" }).click();
    await expect(p.page.getByText("Invitati")).toBeVisible();
    players.push(p);
  }
  const tv = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tvPage = await tv.newPage();
  await tvPage.goto(`/tv?code=${code}`);
  await tvPage.getByRole("button", { name: "Collega schermo" }).click();
  await expect(tvPage.getByText("Invitati (4)")).toBeVisible();
  await shot(tvPage, "02-tv-lobby.png");

  await expect(host.page.getByText("4/10")).toBeVisible();
  await host.page.getByRole("button", { name: "60′" }).click();
  await shot(host.page, "03-host-lobby.png", true);
  await host.page.getByRole("button", { name: /Genera la storia/ }).click();

  for (const p of [host, ...players]) await expect(p.page.getByText("Il mistero di stasera")).toBeVisible({ timeout: 30_000 });
  await shot(players[0].page, "04-briefing.png", true);
  await expect(tvPage.getByText("Stasera, a cena…")).toBeVisible();

  await host.page.getByRole("button", { name: "Inizia la serata" }).click();
  for (const p of [host, ...players]) {
    await expect(p.page.getByTestId("phase-title")).toHaveText("Prologo", { timeout: 15_000 });
  }
  await expect(players[0].page.getByRole("dialog")).toBeVisible();
  await shot(players[0].page, "05-popup.png");
  for (const p of [host, ...players]) await ackPopups(p.page);

  // Esattamente un assassino tra i telefoni.
  let killers = 0;
  for (const p of [host, ...players]) {
    await p.page.getByTestId("tab-sheet").click();
    if (await p.page.getByTestId("killer-banner").isVisible()) killers++;
  }
  expect(killers).toBe(1);
  await shot(players[1].page, "06-scheda.png", true);

  // Regia: prologo → atto I
  await host.page.getByTestId("tab-host").click();
  await shot(host.page, "07-regia.png", true);
  await host.page.getByTestId("host-next").click();
  for (const p of [host, ...players]) await expect(p.page.getByTestId("phase-title")).toContainText("Atto I", { timeout: 15_000 });
  await expect(tvPage.getByTestId("tv-phase")).toContainText("Atto I");
  await shot(tvPage, "08-tv-atto.png");

  // Telefono "bloccato": la pagina si chiude e si riapre → stesso giocatore, nessun dato perso.
  const sara = players[2];
  const url = sara.page.url();
  await sara.page.close();
  await ackPopups(host.page);
  await host.page.getByTestId("host-next").click(); // atto I → votazione mentre Sara è via
  sara.page = await sara.context.newPage();
  await sara.page.goto(url);
  await expect(sara.page.getByTestId("phase-title")).toHaveText(/Votazione/, { timeout: 15_000 });
  for (const p of [host, ...players]) await ackPopups(p.page);

  // Votazione: tutti votano la prima opzione disponibile.
  for (const p of [host, ...players]) {
    await p.page.getByTestId("tab-now").click();
    await p.page.getByTestId("vote-option").first().click();
  }
  await expect(host.page.getByText("Esito della votazione")).toBeVisible({ timeout: 15_000 });
  await shot(host.page, "09-esito.png", true);
  await shot(tvPage, "10-tv-esito.png");

  // Fine partita dalla regia.
  await ackPopups(host.page);
  await host.page.getByTestId("tab-host").click();
  host.page.once("dialog", (d) => d.accept());
  await host.page.getByRole("button", { name: "Termina e rivela la soluzione" }).click();
  for (const p of [host, ...players]) {
    await ackPopups(p.page);
    await p.page.getByTestId("tab-now").click();
    await expect(p.page.getByText("Classifica")).toBeVisible({ timeout: 15_000 });
  }
  await expect(host.page.getByTestId("score-row")).toHaveCount(4);
  await shot(players[0].page, "11-epilogo.png", true);
  await expect(tvPage.getByText("Classifica")).toBeVisible();
  await shot(tvPage, "12-tv-epilogo.png", true);
  expect(consoleErrors, consoleErrors.join("\n")).toEqual([]);
});
