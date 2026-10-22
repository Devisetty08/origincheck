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
  // searching on upload is on by default; tests turn it off unless they test it (see "searches automatically")
  await page.addInitScript(() => { if (!sessionStorage.getItem("oc-test")) localStorage.setItem("oc-prefs", JSON.stringify({ autoSearch: false })); });
  await serverConfig(page, { aiLikelihood: true }); // the AI signal is off by default on a real server
});
test.afterEach(() => expect(errors).toEqual([]));

/** Open a tool from the sidebar (desktop) or the bottom bar (mobile). "check" is the overview. */
const openTool = (page: Page, id: string) => page.locator(`[data-nav="${id}"]:visible, [data-nav-mobile="${id}"]:visible`).first().click();

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
  await expect(page.locator("#nextSteps [data-step]")).toHaveCount(4);
  await expect(page.locator("#docLang")).toHaveText("English"); // detected on the device
  await expect(page.locator('#nextSteps [data-step="plagiarism"]')).toContainText("2 passages match your sources (47% similarity)");
  expect(await noSideScroll(page)).toBe(true);

  await page.locator("[data-card=ai]").click(); // score cards open their tool
  await expect(page.locator("#aiCaveat")).toContainText("AI detection is unreliable");
  await expect(page.locator("#aiReasons li")).toHaveCount(3);
  await expect(page.locator("#aiHeatmap [data-score]").first()).toBeVisible();
  expect(await noSideScroll(page)).toBe(true);
});

test("excluding a source updates the similarity index", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#simRing text")).toHaveText("47%", { timeout: 30_000 });
  await openTool(page, "similarity");
  await page.locator("#srcRank li", { hasText: "azure.txt" }).getByRole("button", { name: "Exclude source" }).click();
  await openTool(page, "check");
  await expect(page.locator("#simRing text")).toHaveText("21%");
  await openTool(page, "similarity");
  await page.getByRole("button", { name: "Include again" }).click();
  await page.locator("#backOverview").click();
  await expect(page.locator("#simRing text")).toHaveText("47%");
});

test("accepting a grammar suggestion changes the text and updates the score", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#grammarRing text")).toHaveText(/^\d+$/, { timeout: 30_000 });
  const scoreBefore = Number(await page.locator("#grammarRing text").textContent());
  await openTool(page, "grammar");
  await expect(page.locator("#tone")).toContainText("Neutral");
  const issue = page.locator('#gDoc [data-issue][aria-label^="Warning"], #gDoc [data-issue][aria-label^="Error"]').first();
  const flagged = await issue.textContent();
  const countBefore = await page.locator("#gDoc [data-issue]").count();
  await issue.click();
  const accept = page.locator("#issuePopover [data-accept]").first();
  await expect(accept).toBeVisible();
  await accept.click();
  await expect(page.locator("#gDoc [data-issue]")).not.toHaveCount(countBefore);
  await expect(page.locator("#gDoc")).not.toContainText(flagged!);
  // the suggestion cards in the side panel work the same way
  const cards = page.locator("#gCards [data-card-issue]");
  const cardsBefore = await cards.count();
  await page.locator("#gCards [data-card-accept]").first().click();
  await expect(cards).toHaveCount(cardsBefore - 1);
  await openTool(page, "check");
  await expect.poll(async () => Number(await page.locator("#grammarRing text").textContent())).toBeGreaterThan(scoreBefore);
});

test("downloads work", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#grammarRing text")).toHaveText(/^\d+$/, { timeout: 30_000 });
  await expect(page.locator("#simRing text")).toHaveText("47%");
  await expect(page.locator("#aiRing text")).toHaveText(/^\d+$/);

  const report = page.waitForEvent("download");
  await page.locator("#dlHtml").click();
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
  await page.locator('#nextSteps [data-step="plagiarism"] button').click(); // "Find sources"
  await page.locator("#runAll").click();
  await expect(page.locator("#privacyServices li").first()).toBeVisible();
  await page.locator("#privacyOk").click();
  for (const [id, status] of [["wikipedia-en", "success"], ["crossref", "no results"], ["semantic-scholar", "rate-limited"], ["arxiv", "failed"], ["brave", "not configured"]])
    await expect(page.locator(`tr[data-source="${id}"]`).first()).toHaveAttribute("data-status", status);
  await expect(page.locator("#searchSummary")).toContainText("1 service found sources, 1 found nothing, 3 couldn't search");
  await openTool(page, "check");
  await expect(page.locator("#simRing text")).toHaveText(/^\d+%$/, { timeout: 30_000 });
  // only short query chunks leave the browser, never the document
  expect(sent!.queries.length).toBeGreaterThan(0);
  for (const q of sent!.queries) expect(q.split(" ").length).toBeLessThanOrEqual(16);
});

test("turning an input off removes its sources from the check", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#simRing text")).toHaveText("47%", { timeout: 30_000 });
  await openTool(page, "similarity");
  await page.locator("#in-files").uncheck();
  await expect(page.getByText("Nothing to compare against yet.")).toBeVisible();
  await page.locator("#in-files").check();
  await openTool(page, "check");
  await expect(page.locator("#simRing text")).toHaveText("47%");
});

test("Check externally copies the text and opens the site without sending anything", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await context.route("https://www.copykiller.com/**", (r) => r.fulfill({ body: "<title>CopyKiller</title>" }));
  await upload(page);
  await expect(page.locator("#simRing text")).toHaveText("47%", { timeout: 30_000 });
  await openTool(page, "similarity");
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
  await openTool(page, "grammar");
  await expect(page.locator("#englishOnly")).toContainText("English-only");
  await expect(page.locator("#englishOnly")).toContainText("CopyKiller");
});

test("the AI signal stays off unless the server enables it", async ({ page }) => {
  await serverConfig(page, { aiLikelihood: false });
  await upload(page);
  await expect(page.locator("#grammarRing text")).toHaveText(/^\d+$/, { timeout: 30_000 });
  await openTool(page, "ai");
  await expect(page.locator("#aiOff")).toBeVisible();
});

test("Rewrite shows a diff for a clicked sentence, applies kept changes and labels the export", async ({ page }) => {
  await serverConfig(page, { improve: "anthropic" });
  let sentText = "";
  await page.route("**/api/improve", async (r) => {
    sentText = r.request().postDataJSON().text;
    await r.fulfill({ json: { revised: sentText.replace(/^(\S+)/, "IMPROVED"), provider: "anthropic", model: "claude-opus-5-5" } });
  });
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Paste text instead" }).click();
  const first = "Our team found that the results was very clear in the end.", rest = "It took a week.", second = "Second paragraph stays the same.";
  await page.getByLabel("Document text").fill(`${first} ${rest}\n\n${second}`);
  await page.locator("#usePaste").click();
  await openTool(page, "rewrite");
  await expect(page.locator("#improveRun")).toBeDisabled(); // nothing picked yet
  await page.locator('#rwDoc [data-sent="0.0"]').click(); // one click picks one sentence
  await expect(page.locator("#improveOriginal")).toHaveText(first);
  await page.locator('[data-goal="shorter"]').click();
  await page.locator("#improveRun").click();
  await expect(page.locator("#privacyServices")).toContainText("Anthropic");
  await page.locator("#privacyOk").click();
  await expect(page.locator("#improveDiff [data-change]").first()).toBeVisible();
  expect(sentText).toBe(first); // only the chosen sentence was sent
  await page.locator("#improveApply").click();
  await expect(page.locator("#rwDoc")).toContainText(`IMPROVED team found that the results was very clear in the end. ${rest}`);
  await expect(page.locator("#rwDoc")).toContainText(second);
  await page.locator('[data-unit="paragraph"]').click(); // switch to whole paragraphs
  await page.locator('#rwDoc [data-para="0"]').click();
  await expect(page.locator("#improveOriginal")).toHaveText(/^IMPROVED .* It took a week\.$/);
  await openTool(page, "check");
  const report = page.waitForEvent("download");
  await page.locator("#dlReport").click();
  expect(readFileSync(await (await report).path(), "utf8")).toContain("AI-assisted");
});

test("Rewrite highlights sentences that match a source and fixes one by quoting and citing it", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#simRing text")).toHaveText("47%", { timeout: 30_000 });
  await openTool(page, "rewrite");
  await expect(page.locator("#rewriteFlagged")).toContainText("Similarity 47%");
  const matched = page.locator('#rwDoc [data-sent][title^="Matches a source"]');
  const count = await matched.count();
  await matched.first().click();
  await expect(page.locator("#fixMatch [data-source-text]").first()).not.toBeEmpty(); // the source wording, next to yours
  await expect(page.locator("#improve")).toHaveCount(0); // no AI rewrite for copied text
  await page.locator('#fixMatch [data-remedy="quote"]').first().click();
  await page.locator("#citeSave").click(); // the source has no citation details yet: the title is prefilled
  await expect(page.locator("#recheck")).toContainText("Citation present");
  await expect(page.locator("#fixMatch")).toHaveCount(0); // the pick clears after the edit
  await expect(page.locator("#rwDoc")).toContainText("“");
  await expect.poll(() => matched.count()).toBeLessThan(count);
});

test("Write lists matched passages and tracks a rewrite in your own words until it no longer matches", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#simRing text")).toHaveText("47%", { timeout: 30_000 });
  await openTool(page, "write");
  await expect(page.locator("#writeMatches")).toContainText("Similarity 47%");
  await page.locator("#writeMatches [data-match]").first().click();
  await expect(page.locator("#writeMeter [data-level]")).toHaveAttribute("data-level", "too-close");
  await expect(page.locator("#writeStatus")).toContainText("Still matches the source");
  // the passage is selected in the editor: typing replaces it
  await page.keyboard.type("In my own testing, moving the schema by hand took far longer than expected, so a tool for it saves real effort.");
  await expect(page.locator("#writeStatus")).toContainText("No longer matches the source");
  await expect(page.locator("#writeMeter [data-level]")).toHaveAttribute("data-level", "original");
  await page.locator("#writeCite").click();
  await page.locator("#citeSave").click(); // no citation details yet: the title is prefilled
  await expect(page.locator("#writeStatus")).toContainText("Citation present");
  await expect(page.locator("#writeEditor")).toHaveValue(/saves real effort \(.+\)\./);
});

test("confidential words, worst sections first and citation checks", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("oc-prefs", JSON.stringify({ autoSearch: false, confidential: ["PostgreSQL", "Not in the text"] })));
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("srcDrop-input").setInputFiles(`${EX}references/azure.txt`);
  await page.getByRole("button", { name: "Paste text instead" }).click();
  const copied = readFileSync(`${EX}references/azure.txt`, "utf8").split(/\n\s*\n/)[0].trim();
  await page.getByLabel("Document text").fill(`Introduction\nOur team planned the move over two quarters and kept the old system running in parallel the whole time.\n\nPlatform\n${copied}\n\nResults\nAbout 70% of projects use open-source databases. We finished a week early.`);
  await page.locator("#usePaste").click();
  await expect(page.locator('#nextSteps [data-step="confidential"]')).toContainText("Confidential words found: PostgreSQL", { timeout: 30_000 });
  await openTool(page, "write");
  await page.locator('#confidential [data-term="PostgreSQL"]').click();
  expect(await page.locator("#writeEditor").evaluate((el: HTMLTextAreaElement) => el.value.slice(el.selectionStart, el.selectionEnd))).toBe("PostgreSQL");
  await openTool(page, "similarity");
  await expect(page.locator("#sections [data-section]").first()).toContainText("Platform"); // the copied section comes first
  await page.locator("#sections [data-section]").first().click();
  await expect(page.locator("#detail")).toBeVisible();
  await page.getByRole("tab", { name: /Citations/ }).click();
  await expect(page.locator("#citeIssues")).toContainText("No citation for this claim: \"About 70% of projects");
});

test("Paragraph check: copied sentence, quote and cite, undo, rewrite in my own words, Ready and exports", async ({ page }) => {
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  await openTool(page, "paragraph");
  await expect(page.getByRole("heading", { name: "Paragraph check", level: 1 })).toBeVisible();
  // 1. the example paragraph and its source
  await page.locator("#pText").fill(readFileSync(`${EX}paragraph/paragraph.txt`, "utf8").trim());
  await page.locator("#pSourceText").fill(readFileSync(`${EX}paragraph/source.txt`, "utf8").trim());
  await page.locator("#pSourceTitle").fill("https://learn.microsoft.com/azure/postgresql/flexible-server/overview");
  await page.locator("#pAddSource").click();
  await page.locator("#pSources summary").first().click();
  await page.locator("#p0-authors").fill("Microsoft");
  await page.locator("#p0-authors").blur();
  await page.locator("#p0-year").fill("2024");
  await page.locator("#p0-title").fill("Azure Database for PostgreSQL flexible server overview");
  const second = page.locator('#pView [data-sentence="1"]');
  await expect(second).toHaveAttribute("data-status", "too-close");
  await expect(page.locator('#pIssues [data-kind="copied"]')).toContainText("words in the same order as Source 1 (Microsoft, 2024)");
  expect(await noSideScroll(page)).toBe(true);

  // 2. quote and cite (previewed first)
  await page.locator('#pIssues [data-kind="copied"] [data-fix="quote-cite"]').click();
  await expect(page.locator("#pPreview")).toContainText("(Microsoft, 2024)");
  await page.locator("#pApplyFix").click();
  await expect(second).toHaveAttribute("data-status", "quoted");
  await expect(page.locator("#pFinalText")).toContainText("” (Microsoft, 2024).");
  await expect(page.locator("#pRefs [data-ref]")).toContainText("Microsoft. (2024). Azure Database for PostgreSQL flexible server overview.");

  // 3. undo, then rewrite the sentence in my own words
  await page.locator("#pUndo").click();
  await expect(second).toHaveAttribute("data-status", "too-close");
  await page.locator('#pIssues [data-kind="copied"] [data-fix="rewrite"]').click();
  await expect(page.locator("#pRewrite")).toContainText("Writing without looking at the source keeps your wording original.");
  await page.locator("#pRewriteText").fill("For our migration we picked Azure Database for PostgreSQL flexible server because the managed service let our small team adjust server settings without running the database ourselves.");
  await expect(page.locator("#pMeter [data-level]")).toHaveAttribute("data-level", "original");
  await expect(page.locator("#pCiteGuard")).toContainText("(Microsoft, 2024)");

  // 4. apply: every sentence is original and cited where needed
  await page.locator("#pRewriteApply").click();
  await expect(second).toHaveAttribute("data-status", "original");
  await expect(page.locator('#pView [data-sentence="0"]')).toHaveAttribute("data-status", "original");
  await expect(page.locator("#pVerdict")).toHaveText("Ready");
  await expect(page.locator("#pFinalText")).toContainText("ourselves (Microsoft, 2024).");
  await expect(page.locator("#pCheckSummary")).toContainText("1 citation added");
  for (const [id, name] of [["#pDocx", "paragraph.docx"], ["#pTxt", "paragraph.txt"], ["#pHtml", "paragraph_report.html"]]) {
    const dl = page.waitForEvent("download");
    await page.locator(id).click();
    expect((await dl).suggestedFilename()).toBe(name);
  }
  expect(await noSideScroll(page)).toBe(true);
});

test("a flagged passage opens in Paragraph check with its source", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#simRing text")).toHaveText("47%", { timeout: 30_000 });
  await openTool(page, "similarity");
  await page.locator("#srcRank li", { hasText: "azure.txt" }).getByRole("button", { name: "View matches" }).click();
  await page.locator("#fixInParagraph").click();
  await expect(page.getByRole("heading", { name: "Paragraph check", level: 1 })).toBeVisible();
  await expect(page.locator("#pText")).toHaveValue(/Azure Database for PostgreSQL flexible server is a fully managed/);
  await expect(page.locator("#pSources [data-source]")).toContainText("azure.txt");
  await expect(page.locator('#pView [data-status="too-close"]').first()).toBeVisible();
});

test("My library: a book you own is compared in every check; free books are added, others get find-a-copy links", async ({ page }) => {
  await page.route("**/api/books?q=*", (r) => r.fulfill({ json: { books: [
    { title: "The Wealth of Nations", authors: ["Adam Smith"], source: "Project Gutenberg", get: "gutenberg:3300", note: "Public domain: the full text comes from Project Gutenberg." },
    { title: "Database Design for Mere Mortals", authors: ["Michael J. Hernandez"], isbn: "9780201694710", source: "Open Library", note: "In copyright: borrow it from Open Library, or find it in a library." },
  ] } }));
  await page.route("**/api/books?get=*", (r) => r.fulfill({ json: { text: "It is not from the benevolence of the butcher, the brewer, or the baker, that we expect our dinner. ".repeat(20) } }));
  await page.route("**/api/zotero?*", (r) => r.fulfill({ json: r.request().url().includes("text=")
    ? { text: "Zotero indexed text of a paper about schema conversion and data type mapping between database engines. ".repeat(10) }
    : { items: [{ key: "AAAA0001", itemType: "journalArticle", textKey: "PDF00001", meta: { title: "Schema conversion in practice", authors: [{ family: "Lee", given: "Min" }], year: "2022" } }] } }));
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "My library and saved documents" }).click();
  await page.getByTestId("libFiles").setInputFiles(`${EX}references/azure.txt`);
  await expect(page.locator("#libItems li")).toHaveCount(1);

  await page.locator('[data-lib-tab="books"]').click();
  await page.locator("#bookQuery").fill("wealth of nations");
  await page.locator("#bookQuery").press("Enter");
  await expect(page.locator('[data-book="links"]')).toContainText("borrow it from Open Library");
  await expect(page.locator('[data-book="links"] a').filter({ hasText: "WorldCat" })).toHaveAttribute("href", "https://search.worldcat.org/search?q=bn:9780201694710");
  // a copyrighted book: where it's available, and whether each option is free or paid
  await page.route("**/api/books?where=*", (r) => r.fulfill({ json: { offers: [
    { site: "Open Library", url: "https://openlibrary.org/works/OL1W", access: "borrow", note: "Free to borrow, but every copy is on loan. Join the waiting list (3 waiting)." },
    { site: "WorldCat", url: "https://search.worldcat.org/search?q=bn:9780201694710", access: "library", note: "Free to borrow from libraries that hold it." },
    { site: "Google Play Books", url: "https://play.google.com/b", access: "paid", price: "₹499.00", note: "E-book to buy." },
  ] } }));
  await page.locator('[data-book="links"] [data-where-btn]').click();
  await expect(page.locator('[data-book="links"] [data-offer="borrow"]')).toContainText("Free to borrow");
  await expect(page.locator('[data-book="links"] [data-offer="paid"]')).toContainText("Paid");
  await expect(page.locator('[data-book="links"] [data-price]')).toHaveText("₹499.00");
  await page.locator('[data-book="free"]').getByRole("button", { name: "Add the full text to my library" }).click();
  await expect(page.locator("#libItems li")).toHaveCount(2);

  await page.locator('[data-lib-tab="zotero"]').click();
  await page.getByRole("button", { name: "Show" }).click();
  await page.getByRole("button", { name: "Add to my library" }).click();
  await expect(page.locator("#libItems li")).toHaveCount(3);
  await expect(page.locator("#libItems")).toContainText("from Zotero");

  // a document copied from the book in the library is caught without adding any source
  await openTool(page, "check");
  await page.getByTestId("docDrop-input").setInputFiles(`${EX}draft.docx`);
  await expect(page.locator("#simRing text")).not.toHaveText("0%", { timeout: 30_000 });
  await openTool(page, "similarity");
  await expect(page.locator("#srcRank")).toContainText("My library");
});

test("each tool in the sidebar has its own page and opens on its results", async ({ page }) => {
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  for (const [id, title] of [["similarity", "Plagiarism check"], ["grammar", "Grammar check"], ["ai", "AI indicator"], ["rewrite", "Rewrite"]]) {
    await openTool(page, id);
    await expect(page.locator("#toolIntro h1")).toHaveText(title);
  }
  await openTool(page, "grammar");
  await page.getByRole("button", { name: "Paste text instead" }).click();
  await page.getByLabel("Document text").fill("This sentence have a error in it. ".repeat(5));
  await page.locator("#usePaste").click();
  await expect(page.locator("#toolBar h1")).toHaveText("Grammar");
  await expect(page.locator("#gDoc")).toBeVisible();
  await page.locator("#backOverview").click();
  await expect(page.locator("#nextSteps")).toBeVisible();
});

test("searches the internet automatically when a document is added, after the privacy notice", async ({ page }) => {
  await page.addInitScript(() => { sessionStorage.setItem("oc-test", "1"); localStorage.removeItem("oc-prefs"); });
  let searched = 0;
  await page.route("**/api/search", async (r) => {
    searched++;
    await r.fulfill({ contentType: "text/event-stream", body: sse([["start", { sources: [{ id: "crossref", label: "Crossref" }], queries: 1 }],
      ["source", { source: "crossref", label: "Crossref", status: "no results", ms: 50, queries: 1, results: [] }], ["done", { ms: 60 }]]) });
  });
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("docDrop-input").setInputFiles(`${EX}draft.docx`);
  await expect(page.locator("#privacyServices li").first()).toBeVisible(); // no button press needed
  await page.locator("#privacyOk").click();
  await expect.poll(() => searched).toBe(1);
  await openTool(page, "similarity");
  await expect(page.locator("#searchSummary")).toContainText("0 services found sources, 1 found nothing");
});

test("Rewrite points to Settings when no AI provider is set, and Settings shows keys without values", async ({ page }) => {
  await serverConfig(page, { improve: null });
  await upload(page);
  await openTool(page, "rewrite");
  await expect(page.locator("#rwDoc")).toContainText("Azure Database for PostgreSQL");
  await expect(page.locator("#improveOff")).toBeVisible();
  await page.locator("#improveSetup").click();
  await expect(page.getByRole("heading", { name: "Settings", level: 1 })).toBeVisible();
  await expect(page.locator("#sPara")).toBeVisible(); // check options moved here
  await expect(page.locator('[data-status="ANTHROPIC_API_KEY"]')).toHaveText(/Set|Not set/);
  await expect(page.locator("#settingsReadOnly")).toContainText("production mode"); // e2e runs next start
  await expect(page.locator("#saveSettings")).toBeDisabled();
});

test("writing history records typed vs pasted text, snapshots after a pause, exports and deletes", async ({ page, context }) => {
  test.setTimeout(60_000);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("./");
  await page.waitForLoadState("networkidle");
  await openTool(page, "write");
  await page.getByLabel("Document title").fill("History essay");
  await page.locator("#startWriting").click();
  await expect(page.locator("#historyIndicator")).toHaveText("Writing history is on");
  const editor = page.locator("#writeEditor");
  await editor.click();
  await page.keyboard.type("I typed this first sentence myself. ");
  const pasted = "This whole sentence was pasted in from elsewhere.";
  await page.evaluate((t) => navigator.clipboard.writeText(t), pasted);
  await page.keyboard.press("ControlOrMeta+V");
  await expect(editor).toHaveValue(/pasted in from elsewhere\.$/);
  await expect(page.locator("#historySlider")).toHaveAttribute("max", "1", { timeout: 15_000 }); // a snapshot after the pause
  await expect(page.locator("#historySummary [data-summary]")).toHaveText(/^4\d% typed, 5\d% pasted, 0% AI-assisted$/);
  const json = page.waitForEvent("download");
  await page.locator("#historyJson").click();
  const report = JSON.parse(readFileSync(await (await json).path(), "utf8"));
  expect(report).toMatchObject({ title: "History essay", pastes: [{ characters: pasted.length }] });
  expect(report.note).toMatch(/not proof of authorship/);
  page.once("dialog", (d) => d.accept());
  await page.locator("#historyDelete").click();
  await expect(page.locator("#historySummary [data-summary]")).toHaveText(/^0% typed, 0% pasted, 0% AI-assisted, 100% imported$/);
  await page.locator("#historyToggle").uncheck();
  await expect(page.locator("#historyIndicator")).toHaveText("Writing history is off");
});

test("the PDF report has a cover, the highlighted document and the originality summary", async ({ page }) => {
  await upload(page);
  await expect(page.locator("#simRing text")).toHaveText("47%", { timeout: 30_000 });
  await expect(page.locator("#grammarRing text")).toHaveText(/^\d+$/, { timeout: 30_000 });
  const dl = page.waitForEvent("download");
  await page.locator("#dlReport").click();
  const d = await dl;
  expect(d.suggestedFilename()).toBe("draft_originality_report.pdf");
  const pdf = readFileSync(await d.path(), "latin1");
  expect(pdf.startsWith("%PDF-")).toBe(true);
  for (const t of ["Check ID:", "Word count:", "ORIGINALITY REPORT", "SIMILARITY INDEX", "PRIMARY SOURCES", "azure.txt", "ora2pg.pdf", "Uploaded file",
    "Exclude bibliography", "Similarity is a signal, not proof", "Other checks"]) expect(pdf, t).toContain(t);
  expect(pdf).toMatch(/\(47\) Tj/); // the similarity index, as drawn
});
