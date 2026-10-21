import { type Page, expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EX = resolve(process.cwd(), "../example") + "/"; // tests run from web/
const errors: string[] = [];

// Deterministic stand-in for the two AI models, so tests never download them.
const mockAi = () => {
  (window as unknown as { __ocAiMock: unknown }).__ocAiMock = (_text: string, sentences: { start: number; end: number }[]) => ({
    chunks: [{ start: sentences[0].start, end: sentences[sentences.length - 1].end, prob: 0.12 }],
    sentences: sentences.map((s, i) => ({ ...s, ppl: 55 + (i % 5) * 20 })),
  });
};

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.addInitScript(mockAi);
});
test.afterEach(() => expect(errors).toEqual([]));

async function upload(page: Page) {
  await page.goto("./");
  await page.waitForLoadState("networkidle"); // handlers attach on hydration
  await page.getByTestId("srcDrop-input").setInputFiles([`${EX}references/azure.txt`, `${EX}references/ora2pg.pdf`]);
  await expect(page.getByRole("list", { name: "Sources added" }).getByRole("listitem")).toHaveCount(2);
  await page.getByTestId("docDrop-input").setInputFiles(`${EX}draft.docx`);
}

const noSideScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test("uploading runs all three checks automatically and shows their scores", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#simRing text")).toHaveText("47%", { timeout: 30_000 });
  await expect(page.locator("#grammarRing text")).toHaveText(/^\d+$/, { timeout: 30_000 });
  await expect(page.locator("#aiRing text")).toHaveText(/^\d+$/);
  await expect(page.locator("[data-card=ai]")).toContainText(/Low|Unclear|High/);
  await expect(page.locator("#summaryLine")).toContainText("47% similarity");
  await expect(page.locator("#summaryLine")).toContainText(/\d+ grammar suggestions?/);
  await expect(page.locator("#summaryLine")).toContainText(/AI indicator: (Low|Unclear|High)/);
  for (const s of ["Similarity", "Grammar", "AI indicator"]) await expect(page.getByRole("status").getByText(`${s}: done`)).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);

  await page.getByRole("tab", { name: "AI indicator" }).click();
  await expect(page.locator("#aiCaveat")).toContainText("AI detection is unreliable");
  await expect(page.locator("#aiReasons li")).toHaveCount(3);
  await expect(page.locator("#aiHeatmap [data-score]").first()).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
});

test("excluding a source updates the similarity index", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#simRing text")).toHaveText("47%", { timeout: 30_000 });
  await page.locator("#srcRank li", { hasText: "azure.txt" }).getByRole("button", { name: "Exclude source" }).click();
  await expect(page.locator("#simRing text")).toHaveText("21%");
  await page.getByRole("button", { name: "Include again" }).click();
  await expect(page.locator("#simRing text")).toHaveText("47%");
});

test("accepting a grammar suggestion changes the text and updates the score", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#grammarRing text")).toHaveText(/^\d+$/, { timeout: 30_000 });
  await page.getByRole("tab", { name: "Grammar" }).click();
  const issue = page.locator('#gDoc [data-issue][aria-label^="Warning"], #gDoc [data-issue][aria-label^="Error"]').first();
  const flagged = await issue.textContent();
  const countBefore = await page.locator("#gDoc [data-issue]").count();
  const scoreBefore = Number(await page.locator("#grammarRing text").textContent());
  await issue.click();
  const accept = page.locator("#issuePopover [data-accept]").first();
  await expect(accept).toBeVisible();
  await accept.click();
  await expect(page.locator("#gDoc [data-issue]")).not.toHaveCount(countBefore);
  await expect(page.locator("#gDoc")).not.toContainText(flagged!);
  await expect.poll(async () => Number(await page.locator("#grammarRing text").textContent())).toBeGreaterThan(scoreBefore);
});

test("downloads work", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#grammarRing text")).toHaveText(/^\d+$/, { timeout: 30_000 });
  await expect(page.locator("#simRing text")).toHaveText("47%");
  await expect(page.locator("#aiRing text")).toHaveText(/^\d+$/);

  const report = page.waitForEvent("download");
  await page.locator("#dlReport").click();
  const r = await report;
  expect(r.suggestedFilename()).toBe("draft_origincheck_report.html");
  const html = readFileSync(await r.path(), "utf8");
  expect(html).toContain("47%");
  expect(html).toContain("Writing score");
  expect(html).toContain("AI detection is unreliable");

  const docx = page.waitForEvent("download");
  await page.getByRole("button", { name: "Corrected .docx" }).first().click();
  expect((await docx).suggestedFilename()).toBe("draft_corrected.docx");
  const txt = page.waitForEvent("download");
  await page.getByRole("button", { name: "Corrected .txt" }).click();
  const t = await txt;
  expect(t.suggestedFilename()).toBe("draft_corrected.txt");
  expect(readFileSync(await t.path(), "utf8")).toContain("Azure Database for PostgreSQL");
});

test("similarity waits for sources and runs as soon as one is added", async ({ page }) => {
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("docDrop-input").setInputFiles(`${EX}draft.docx`);
  await expect(page.locator("[data-card=similarity]")).toContainText("Add sources to run this check");
  await expect(page.locator("#grammarRing text")).toHaveText(/^\d+$/, { timeout: 30_000 }); // other checks don't wait
  await page.getByTestId("cardSrc-input").setInputFiles([`${EX}references/azure.txt`, `${EX}references/ora2pg.pdf`]);
  await expect(page.locator("#simRing text")).toHaveText("47%", { timeout: 30_000 });
});
