import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type Issue, K, applyAll, applySuggestion, codePointToUtf16, harperKind, languageTool, languageToolKind, likelyTerm, ltChunks,
  mergeIssues, paragraphs, writingScore,
} from "./grammar";

const issue = (start: number, end: number, severity: Issue["severity"] = "error", text = "x"): Issue => ({
  id: `${start}`, start, end, message: "", rule: "r", category: "spelling", severity, engine: "harper", suggestions: [{ text, kind: "replace" }],
});

describe("writing score", () => {
  it("is 100 − weighted issues per 100 words × K, floored at 0", () => {
    expect(K).toBe(2);
    expect(writingScore([], 500)).toBe(100);
    expect(writingScore([issue(0, 1, "error")], 100)).toBe(94); // 3 per 100 words × 2
    expect(writingScore([issue(0, 1, "warning"), issue(0, 1, "style")], 100)).toBe(97); // (1 + 0.5) × 2
    expect(writingScore(Array.from({ length: 50 }, () => issue(0, 1)), 100)).toBe(0);
    expect(writingScore([], 0)).toBe(100);
  });
  it("matches the calibration: clean ≥ 90, messy < 60", () => {
    // weighted issues per 100 words measured with Harper: example draft 2.30, Wikipedia 4.93, messy paragraph 29.74
    const at = (w: number) => Math.max(0, Math.round(100 - w * K));
    expect(at(2.3)).toBeGreaterThanOrEqual(90);
    expect(at(4.93)).toBeGreaterThanOrEqual(90);
    expect(at(29.74)).toBeLessThan(60);
  });
});

describe("categories", () => {
  it("maps Harper kinds", () => {
    expect(harperKind("Typo")).toEqual(["spelling", "error"]);
    expect(harperKind("Spelling")).toEqual(["spelling", "warning"]);
    expect(harperKind("Agreement")).toEqual(["grammar", "error"]);
    expect(harperKind("Punctuation")).toEqual(["punctuation", "warning"]);
    expect(harperKind("Redundancy")).toEqual(["clarity", "style"]);
    expect(harperKind("SomethingNew")).toEqual(["style", "style"]);
  });
  it("maps LanguageTool issue types", () => {
    expect(languageToolKind("misspelling", "TYPOS")).toEqual(["spelling", "error"]);
    expect(languageToolKind("grammar", "GRAMMAR")).toEqual(["grammar", "error"]);
    expect(languageToolKind("whitespace", "TYPOGRAPHY")).toEqual(["punctuation", "warning"]);
    expect(languageToolKind("style", "STYLE")).toEqual(["style", "style"]);
    expect(languageToolKind("duplication", "MISC")).toEqual(["clarity", "warning"]);
  });
  it("recognises names and technical terms", () => {
    const t = "We used Ora2Pg and PostgreSQL. Smith wrote it. Freind said hi.";
    expect(likelyTerm("Ora2Pg", t, t.indexOf("Ora2Pg"))).toBe(true);
    expect(likelyTerm("PostgreSQL", t, t.indexOf("PostgreSQL"))).toBe(true);
    expect(likelyTerm("NADPH", t, 0)).toBe(true);
    expect(likelyTerm("Freind", t, t.indexOf("Freind"))).toBe(false); // sentence-initial capital
    expect(likelyTerm("freind", t, 0)).toBe(false);
  });
});

describe("editing", () => {
  it("applies replace, remove and insert-after suggestions", () => {
    expect(applySuggestion("This are fine", { start: 5, end: 8 }, { text: "is", kind: "replace" })).toBe("This is fine");
    expect(applySuggestion("the the end", { start: 3, end: 7 }, { text: "", kind: "remove" })).toBe("the end");
    expect(applySuggestion("Hello world", { start: 0, end: 5 }, { text: ",", kind: "insertAfter" })).toBe("Hello, world");
  });
  it("applies many fixes from the end and skips overlaps", () => {
    const t = "teh cat adn teh dog";
    expect(applyAll(t, [issue(0, 3, "error", "the"), issue(8, 11, "error", "and"), issue(12, 15, "error", "the"), issue(9, 10, "error", "Q")]))
      .toBe("the cat and the dog");
  });
  it("converts code-point offsets to UTF-16", () => {
    expect(codePointToUtf16("plain")(3)).toBe(3);
    const t = "a😀b c"; // the emoji is one code point, two UTF-16 units
    const f = codePointToUtf16(t);
    expect(t.slice(f(2), f(3))).toBe("b");
  });
  it("splits paragraphs with offsets", () => {
    const t = "First para\nstill first.\n\nSecond.\n\n\nThird.";
    expect(paragraphs(t).map((p) => [p.start, t.slice(p.start, p.start + p.text.length)])).toEqual([
      [0, "First para\nstill first."], [25, "Second."], [35, "Third."],
    ]);
  });
});

describe("LanguageTool", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("chunks on paragraph boundaries under the request limit", () => {
    const t = ["a".repeat(40), "b".repeat(40), "c".repeat(40)].join("\n\n");
    const c = ltChunks(t, 90);
    expect(c.map((x) => x.start)).toEqual([0, 84]);
    expect(c.every((x) => x.text.length <= 90 && t.slice(x.start, x.start + x.text.length) === x.text)).toBe(true);
  });
  it("retries politely on 429 and maps matches to document offsets", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      calls.push(String(init.body));
      if (calls.length === 1) return new Response("", { status: 429, headers: { "retry-after": "1" } });
      return Response.json({ matches: [{ offset: 5, length: 3, message: "Use “is”.", replacements: [{ value: "is" }],
        rule: { id: "AGREEMENT", issueType: "grammar", category: { id: "GRAMMAR" } } }] });
    }));
    const waits: number[] = [];
    const issues = await languageTool("This are fine.", { sleep: async (ms) => { waits.push(ms); } });
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([1000]);
    expect(issues).toMatchObject([{ start: 5, end: 8, category: "grammar", severity: "error", engine: "languagetool", suggestions: [{ text: "is" }] }]);
  });
});

describe("merge", () => {
  it("keeps the primary engine's issue where spans overlap", () => {
    const h = [issue(0, 4)], lt = [{ ...issue(2, 6), engine: "languagetool" as const }, { ...issue(10, 12), engine: "languagetool" as const }];
    expect(mergeIssues(h, lt).map((i) => [i.start, i.engine])).toEqual([[0, "harper"], [10, "languagetool"]]);
  });
});
