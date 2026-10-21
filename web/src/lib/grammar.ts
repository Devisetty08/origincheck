// Grammar issues from Harper (on-device) and, optionally, LanguageTool (sends text; off by default).

export type Category = "spelling" | "grammar" | "punctuation" | "style" | "clarity";
export type Severity = "error" | "warning" | "style";
export const CATEGORIES: Category[] = ["spelling", "grammar", "punctuation", "style", "clarity"];
export const SEVERITY_WEIGHT: Record<Severity, number> = { error: 3, warning: 1, style: 0.5 };
/**
 * Writing score = max(0, 100 − weighted issues per 100 words × K), K = 2. Measured with Harper (Oct 2026):
 *   example draft 2.3 → 95, Wikipedia "Photosynthesis" intro 4.9 → 90, a messy student paragraph 29.7 → 41.
 */
export const K = 2;

export interface Issue {
  id: string;
  start: number; // UTF-16 offsets into the document text
  end: number;
  message: string;
  rule: string;
  category: Category;
  severity: Severity;
  suggestions: { text: string; kind: "replace" | "remove" | "insertAfter" }[];
  engine: "harper" | "languagetool";
}

// Harper's lint kinds → our categories and severities.
const HARPER: Record<string, [Category, Severity]> = {
  // "Spelling" = word not in Harper's dictionary: often a name or technical term in academic text, so a warning.
  // "Typo" = a known misspelling or split word: an error.
  Spelling: ["spelling", "warning"], Typo: ["spelling", "error"],
  Agreement: ["grammar", "error"], Grammar: ["grammar", "error"], BoundaryError: ["grammar", "error"], WordOrder: ["grammar", "error"],
  Malapropism: ["grammar", "warning"], Eggcorn: ["grammar", "warning"], Usage: ["grammar", "warning"], Nonstandard: ["grammar", "warning"],
  Punctuation: ["punctuation", "warning"], Capitalization: ["punctuation", "warning"], Formatting: ["punctuation", "warning"],
  WordChoice: ["clarity", "warning"], Readability: ["clarity", "style"], Redundancy: ["clarity", "style"], Repetition: ["clarity", "style"],
  Style: ["style", "style"], Enhancement: ["style", "style"], Regionalism: ["style", "style"], Miscellaneous: ["style", "style"],
};
export const harperKind = (kind: string): [Category, Severity] => HARPER[kind] ?? ["style", "style"];

// LanguageTool issue types → our categories and severities.
export function languageToolKind(issueType: string, categoryId: string): [Category, Severity] {
  if (issueType === "misspelling" || categoryId === "TYPOS") return ["spelling", "error"];
  if (issueType === "grammar" || categoryId === "GRAMMAR") return ["grammar", "error"];
  if (issueType === "typographical" || issueType === "whitespace" || categoryId === "PUNCTUATION" || categoryId === "CASING") return ["punctuation", "warning"];
  if (issueType === "style" || issueType === "register" || issueType === "locale-violation" || categoryId === "STYLE") return ["style", "style"];
  return ["clarity", "warning"]; // duplication, inconsistency, uncategorized
}

/**
 * Spelling flags on names and technical terms (Ora2Pg, PostgreSQL, iPhone, a capitalised word mid-sentence) are
 * almost always false alarms in academic writing; they're kept visible but downgraded to "style" so they don't sink the score.
 */
export function likelyTerm(word: string, text: string, start: number) {
  if (/\d/.test(word) || /[a-z][A-Z]/.test(word) || /^[A-Z]{2,}$/.test(word)) return true;
  if (/^[A-Z]/.test(word)) return !/(^|[.!?:]\s+|\n\s*)$/.test(text.slice(Math.max(0, start - 4), start)); // capitalised, not sentence-initial
  return false;
}

export function weighted(issues: Pick<Issue, "severity">[]) {
  return issues.reduce((a, i) => a + SEVERITY_WEIGHT[i.severity], 0);
}

export function writingScore(issues: Pick<Issue, "severity">[], words: number) {
  if (!words) return 100;
  return Math.max(0, Math.round(100 - (weighted(issues) / words) * 100 * K));
}

/** Code-point offsets (Rust/Harper) → UTF-16 offsets (JavaScript strings). Identity for text without astral characters. */
export function codePointToUtf16(text: string): (cp: number) => number {
  if (!/[\uD800-\uDBFF]/.test(text)) return (cp) => cp;
  const map: number[] = [];
  let u = 0;
  for (const ch of text) { map.push(u); u += ch.length; }
  map.push(u);
  return (cp) => map[Math.min(cp, map.length - 1)];
}

/** Apply one suggestion to the text. */
export function applySuggestion(text: string, issue: Pick<Issue, "start" | "end">, s: Issue["suggestions"][number]) {
  if (s.kind === "insertAfter") return text.slice(0, issue.end) + s.text + text.slice(issue.end);
  return text.slice(0, issue.start) + (s.kind === "remove" ? "" : s.text) + text.slice(issue.end);
}

/** Apply many first suggestions at once (e.g. "Accept all spelling fixes"); later offsets first so earlier ones stay valid. */
export function applyAll(text: string, issues: Issue[]) {
  const chosen: Issue[] = [];
  let lastEnd = -1;
  for (const i of [...issues].sort((a, b) => a.start - b.start || b.end - a.end)) // in reading order, first issue wins an overlap
    if (i.suggestions.length && i.start >= lastEnd) { chosen.push(i); lastEnd = i.end; }
  let out = text;
  for (const i of chosen.reverse()) out = applySuggestion(out, i, i.suggestions[0]); // from the end, so offsets stay valid
  return out;
}

/** Paragraphs with their offsets; grammar results are cached per paragraph text so edits only re-check what changed. */
export function paragraphs(text: string) {
  const out: { text: string; start: number }[] = [];
  const re = /[^\n]+(?:\n(?!\s*\n)[^\n]*)*/g;
  for (const m of text.matchAll(re)) if (m[0].trim()) out.push({ text: m[0], start: m.index! });
  return out;
}

/* ------------------------------ LanguageTool (optional, sends text) ------------------------------ */

export const LT_PUBLIC = "https://api.languagetool.org/v2/check";
const LT_REQUEST_CHARS = 18_000; // public API: 20 KB per request
const LT_MINUTE_CHARS = 70_000; // public API: 75 KB per minute
const LT_MINUTE_REQUESTS = 18; // public API: 20 requests per minute

/** Split on paragraph boundaries into chunks under the per-request limit. */
export function ltChunks(text: string, max = LT_REQUEST_CHARS) {
  const out: { text: string; start: number }[] = [];
  let cur: { text: string; start: number } | null = null;
  for (const p of paragraphs(text)) {
    for (let i = 0; i < p.text.length; i += max) { // a single huge paragraph is cut hard
      const piece = { text: p.text.slice(i, i + max), start: p.start + i };
      if (cur && piece.start + piece.text.length - cur.start <= max) cur.text = text.slice(cur.start, piece.start + piece.text.length);
      else { if (cur) out.push(cur); cur = { ...piece }; }
    }
  }
  if (cur) out.push(cur);
  return out;
}

interface LtMatch { offset: number; length: number; message: string; replacements: { value: string }[]; rule: { id: string; issueType: string; category: { id: string } } }

export async function languageTool(text: string, opts: { url?: string; language?: string; onProgress?: (done: number, total: number) => void; sleep?: (ms: number) => Promise<void> }) {
  const url = opts.url?.trim() || LT_PUBLIC;
  const isPublic = url === LT_PUBLIC;
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const chunks = ltChunks(text);
  const sent: { at: number; chars: number }[] = [];
  const issues: Issue[] = [];
  for (const [n, c] of chunks.entries()) {
    opts.onProgress?.(n, chunks.length);
    if (isPublic) { // stay inside the public API's per-minute limits
      for (;;) {
        const now = Date.now();
        while (sent.length && now - sent[0].at > 60_000) sent.shift();
        const chars = sent.reduce((a, s) => a + s.chars, 0);
        if (sent.length < LT_MINUTE_REQUESTS && chars + c.text.length <= LT_MINUTE_CHARS) break;
        await sleep(60_000 - (now - sent[0].at) + 250);
      }
    }
    let res: Response | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ text: c.text, language: opts.language || "auto" }) });
      if (res.status !== 429) break;
      const wait = Number(res.headers.get("retry-after")) * 1000 || 2000 * 2 ** attempt; // retry politely
      await sleep(wait);
    }
    sent.push({ at: Date.now(), chars: c.text.length });
    if (!res?.ok) throw new Error(`LanguageTool returned ${res?.status ?? "no response"}`);
    const j: { matches: LtMatch[] } = await res.json();
    for (const m of j.matches) {
      const [category, severity] = languageToolKind(m.rule.issueType, m.rule.category.id);
      issues.push({
        id: `lt:${c.start + m.offset}:${m.rule.id}`, start: c.start + m.offset, end: c.start + m.offset + m.length, message: m.message,
        rule: m.rule.id, category, severity, engine: "languagetool",
        suggestions: m.replacements.slice(0, 5).map((r) => ({ text: r.value, kind: "replace" as const })),
      });
    }
  }
  opts.onProgress?.(chunks.length, chunks.length);
  return issues;
}

/** Merge engines: keep Harper's issue where both flag the same span. */
export function mergeIssues(primary: Issue[], extra: Issue[]) {
  const overlaps = (a: Issue, b: Issue) => a.start < b.end && b.start < a.end;
  return [...primary, ...extra.filter((e) => !primary.some((p) => overlaps(p, e)))].sort((a, b) => a.start - b.start);
}
