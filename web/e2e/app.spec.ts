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

// Embedding stand-in: one-hot vectors keyed by a hash of the text, so only identical text counts as a paraphrase.
const mockEmbed = () => {
  (window as unknown as { __ocEmbedMock: unknown }).__ocEmbedMock = async (texts: string[]) => texts.map((t) => {
    let h = 0;
    for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const v = new Float32Array(4096);
    v[h % 4096] = 1;
    return v;
  });
};

/** Override what the server reports in /api/config (feature flags) for one test. Later routes win. */
const serverConfig = (page: Page, patch: Record<string, unknown>) =>
  page.route("**/api/config", async (r) => r.fulfill({ json: { ...(await (await r.fetch()).json()), ...patch } }));

test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text()}`); });
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`); });
  await page.addInitScript(mockAi);
  await page.addInitScript(mockEmbed);
  await serverConfig(page, { aiLikelihood: true }); // the AI signal is off by default on a real server
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

/* ---------- server-backed features (external APIs mocked at the browser boundary) ---------- */

const sse = (events: [string, unknown][]) => events.map(([e, d]) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`).join("");
const AZURE = readFileSync(`${EX}references/azure.txt`, "utf8");

test("Run all sources streams a status per source and adds what it found", async ({ page }) => {
  let sent: { queries: string[]; groups: string[] } | null = null;
  await page.route("**/api/search", async (r) => {
    sent = r.request().postDataJSON();
    const ev = (source: string, label: string, status: string, results: unknown[] = [], error?: string) =>
      ["source", { source, label, status, ms: 120, queries: sent!.queries.length, results, ...(error ? { error } : {}) }] as [string, unknown];
    await r.fulfill({ contentType: "text/event-stream", body: sse([
      ["start", { sources: [["wikipedia-en", "Wikipedia"], ["crossref", "Crossref"], ["semantic-scholar", "Semantic Scholar"], ["arxiv", "arXiv"], ["brave", "Brave Search"]]
        .map(([id, label]) => ({ id, label })), queries: sent!.queries.length }],
      ev("wikipedia-en", "Wikipedia", "success", [{ title: "Azure Database for PostgreSQL", snippet: "", url: "https://en.wikipedia.org/wiki/Azure", authors: ["Wikipedia contributors"], source: "wikipedia-en", text: AZURE }]),
      ev("crossref", "Crossref", "no results"),
      ev("semantic-scholar", "Semantic Scholar", "rate-limited", [], "HTTP 429"),
      ev("arxiv", "arXiv", "failed", [], "timeout"),
      ev("brave", "Brave Search", "not configured", [], "BRAVE_API_KEY is not set"),
      ["done", { ms: 900 }],
    ]) });
  });
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("docDrop-input").setInputFiles(`${EX}draft.docx`);
  await expect(page.locator("[data-card=similarity]")).toContainText("Add sources to run this check");
  await page.locator("#runAll").click();
  await expect(page.locator("#privacyServices li").first()).toBeVisible();
  await page.locator("#privacyOk").click();
  for (const [id, status] of [["wikipedia-en", "success"], ["crossref", "no results"], ["semantic-scholar", "rate-limited"], ["arxiv", "failed"], ["brave", "not configured"]])
    await expect(page.locator(`tr[data-source="${id}"]`).first()).toHaveAttribute("data-status", status);
  await expect(page.locator("#simRing text")).toHaveText(/^\d+%$/, { timeout: 30_000 });
  // only short query chunks leave the browser, never the document
  expect(sent!.queries.length).toBeGreaterThan(0);
  for (const q of sent!.queries) expect(q.split(" ").length).toBeLessThanOrEqual(16);
});

test("turning an input off removes its sources from the check", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#simRing text")).toHaveText("47%", { timeout: 30_000 });
  await page.locator("summary", { hasText: "add more" }).click();
  await page.locator('[data-toggle="files-no"]:visible').click();
  await expect(page.locator("[data-card=similarity]")).toContainText("Add sources to run this check");
  await page.locator('[data-toggle="files-yes"]:visible').click();
  await expect(page.locator("#simRing text")).toHaveText("47%");
});

test("Check externally copies the text and opens the site without sending anything", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await context.route("https://www.copykiller.com/**", (r) => r.fulfill({ body: "<title>CopyKiller</title>" }));
  await upload(page);
  await expect(page.locator("#simRing text")).toHaveText("47%", { timeout: 30_000 });
  await page.locator("#externalCheck summary").click();
  const popup = page.waitForEvent("popup");
  await page.locator('[data-site="copykiller"]').click();
  expect((await popup).url()).toContain("copykiller.com");
  await expect(page.locator("#externalCheck [role=status]")).toContainText("Paste it into CopyKiller yourself");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("Azure Database for PostgreSQL");
});

test("grammar is English-only and says so for Korean text", async ({ page }) => {
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Paste text instead" }).click();
  await page.getByLabel("Document text").fill("이 문서는 한국어로 작성되었습니다. ".repeat(20));
  await page.locator("#usePaste").click();
  await page.getByRole("tab", { name: "Grammar" }).click();
  await expect(page.locator("#englishOnly")).toContainText("English-only");
  await expect(page.locator("#englishOnly")).toContainText("CopyKiller");
});

test("the AI signal stays off unless the server enables it", async ({ page }) => {
  await serverConfig(page, { aiLikelihood: false });
  await upload(page);
  await expect(page.locator("#grammarRing text")).toHaveText(/^\d+$/, { timeout: 30_000 });
  await page.getByRole("tab", { name: "AI indicator" }).click();
  await expect(page.locator("#aiOff")).toBeVisible();
});

test("Improve my writing shows a diff, applies accepted changes and labels the export", async ({ page }) => {
  await serverConfig(page, { improve: "anthropic" });
  let sentText = "";
  await page.route("**/api/improve", async (r) => {
    sentText = r.request().postDataJSON().text;
    await r.fulfill({ json: { revised: sentText.replace(/^(\S+)/, "IMPROVED"), provider: "anthropic", model: "claude-opus-5-5" } });
  });
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Paste text instead" }).click();
  const original = "Our team found that the results was very clear in the end. Second paragraph stays the same.";
  await page.getByLabel("Document text").fill(original);
  await page.locator("#usePaste").click();
  await page.getByRole("tab", { name: "Grammar" }).click();
  await expect(page.locator("#improve")).toBeVisible();
  // select the first sentence in the document
  await page.locator("#gDoc").evaluate((el) => {
    const r = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const first = walker.nextNode()!;
    r.setStart(first, 0);
    r.setEnd(first, Math.min(first.textContent!.length, 8));
    getSelection()!.removeAllRanges();
    getSelection()!.addRange(r);
  });
  await page.locator("#improveRun").click();
  await expect(page.locator("#privacyServices")).toContainText("Anthropic");
  await page.locator("#privacyOk").click();
  await expect(page.locator("#improveDiff [data-change]").first()).toBeVisible();
  expect(original.startsWith(sentText)).toBe(true); // only the selection was sent
  await page.locator("#improveApply").click();
  await expect(page.locator("#gDoc")).toContainText("IMPROVED");
  await expect(page.locator("#gDoc")).toContainText("Second paragraph stays the same.");
  const report = page.waitForEvent("download");
  await page.locator("#dlReport").click();
  expect(readFileSync(await (await report).path(), "utf8")).toContain("AI-assisted");
});

test("each tool in the sidebar has its own page and opens on its tab", async ({ page }) => {
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  for (const [id, title] of [["similarity", "Plagiarism check"], ["grammar", "Grammar check"], ["ai", "AI indicator"], ["rewrite", "Rewrite"]]) {
    await page.locator(`[data-nav="${id}"]:visible, [data-nav-mobile="${id}"]:visible`).first().click();
    await expect(page.locator("#toolIntro h1")).toHaveText(title);
  }
  await page.locator('[data-nav="grammar"]:visible, [data-nav-mobile="grammar"]:visible').first().click();
  await page.getByRole("button", { name: "Paste text instead" }).click();
  await page.getByLabel("Document text").fill("This sentence have a error in it. ".repeat(5));
  await page.locator("#usePaste").click();
  await expect(page.getByRole("tab", { name: "Grammar" })).toHaveAttribute("aria-selected", "true");
});

test("Rewrite points to Settings when no AI provider is set, and Settings shows keys without values", async ({ page }) => {
  await serverConfig(page, { improve: null });
  await upload(page);
  await page.getByRole("tab", { name: "Rewrite" }).click();
  await expect(page.locator("#rwDoc")).toContainText("Azure Database for PostgreSQL");
  await expect(page.locator("#improveOff")).toBeVisible();
  await page.locator("#improveSetup").click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.locator("#sPara")).toBeVisible(); // check options moved here
  await expect(page.locator('[data-status="ANTHROPIC_API_KEY"]')).toHaveText(/Set|Not set/);
  await expect(page.locator("#settingsReadOnly")).toContainText("production mode"); // e2e runs next start
  await expect(page.locator("#saveSettings")).toBeDisabled();
});
