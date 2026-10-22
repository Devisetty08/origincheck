// Paragraph check rules. Pure functions: a paragraph and its sources in, typed issues and a status per sentence out.
import { type Style, STYLE_LABEL } from "../citations";
import { QUOTE_RE, type Tok, findMatches, tokenize } from "../similarity";
import { type Cite, type PSource, citeFor, expectedForm, findCites } from "./citations";
import { BORDERLINE_SCORE, type Closeness, compare, maskTerms, stems, tooClose, tracks } from "./patchwriting";
import { type Sentence, splitSentences } from "./sentences";

export type Status = "original" | "needs-citation" | "quoted" | "too-close";
export type IssueKind = "copied" | "patchwriting" | "quote-uncited" | "idea-uncited" | "quote-long" | "quote-heavy" | "cite-no-ref" | "cite-format";
export type FixKind = "quote-cite" | "add-citation" | "fix-format" | "rewrite";
export type Verdict = "Ready" | "Needs work" | "Mostly quoted: add more of your own explanation";

export interface PIssue {
  id: string; kind: IssueKind; severity: "error" | "warning";
  /** Sentence index, or -1 for the whole paragraph. */
  sentence: number;
  s: number; e: number; sid?: number; expected?: string;
  message: string; why: string; fixes: FixKind[];
}
export interface Match { sid: number; kind: "copied" | "close" | "tracks"; words?: number; c?: Closeness; srcS: number; srcE: number; docSpans: [number, number][] }
export interface SentenceResult extends Sentence { status: Status; issues: PIssue[]; match?: Match; cited: boolean }
export interface Analysis { sentences: SentenceResult[]; issues: PIssue[]; cites: Cite[]; words: number; quotedWords: number; quotedPct: number; verdict: Verdict }
export interface Options {
  style: Style; minWords: number; longQuote: number;
  /** Technical terms never counted as borrowed wording. */
  allow: string[];
  /** Sentences the user rewrote from a source in the rewrite editor: they still need that source's citation. */
  derived?: { text: string; sid: number }[];
}

export const DEFAULT_ALLOW = ["Azure Database for PostgreSQL flexible server", "ACID compliance"];
export const DEFAULTS: Options = { style: "apa", minWords: 6, longQuote: 40, allow: DEFAULT_ALLOW };
export const QUOTE_HEAVY = 0.3;

const WHY: Record<IssueKind, string> = {
  copied: "Copying a source's wording without quotation marks is plagiarism, even with a citation.",
  patchwriting: "Swapping a few words keeps the source's sentence. A paraphrase needs your own structure and words.",
  "quote-uncited": "Readers must be able to find where a quotation comes from.",
  "idea-uncited": "Ideas and facts from a source need a citation, even in your own words.",
  "quote-long": "Long quotations leave little room for your own explanation. APA sets quotations of 40 or more words as an indented block.",
  "quote-heavy": "Your marker wants to see your understanding, and quotations show someone else's.",
  "cite-no-ref": "Every in-text citation needs a matching entry in the reference list.",
  "cite-format": "Citations should follow one style consistently.",
};

const quoteSpans = (text: string) => [...text.matchAll(new RegExp(QUOTE_RE.source, "g"))].map((m) => [m.index!, m.index! + m[0].length] as [number, number]);
const inside = (t: { s: number; e: number }, spans: [number, number][]) => spans.some(([a, b]) => t.s >= a && t.e <= b);
const squash = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/** Source sentences with their stems, cached per source text. */
const srcCache = new Map<string, { sents: Sentence[]; stems: string[][]; toks: Tok[] }>();
function prepared(src: PSource, allow: string[]) {
  const key = `${src.id}\u0000${src.text.length}\u0000${allow.join("|")}`;
  let p = srcCache.get(key);
  if (!p) {
    const sents = splitSentences(src.text);
    p = { sents, stems: sents.map((x) => stems(maskTerms(x.text, allow))), toks: tokenize(src.text) };
    if (srcCache.size > 50) srcCache.clear();
    srcCache.set(key, p);
  }
  return p;
}

/** The source sentence closest to `text` (stems of the user's wording, quotes and citations left out). */
function closest(mine: string[], sources: PSource[], allow: string[]) {
  let best: { sid: number; k: number; c: Closeness } | null = null;
  if (mine.length < 2) return best;
  const mineSet = new Set(mine);
  sources.forEach((src, sid) => {
    const p = prepared(src, allow);
    p.stems.forEach((st, k) => {
      if (st.filter((w) => mineSet.has(w)).length < 2) return; // cheap pre-filter
      const c = compare(mine, st);
      if (!best || c.score > best.c.score || (c.score === best.c.score && c.overlap > best.c.overlap)) best = { sid, k, c };
    });
  });
  return best as { sid: number; k: number; c: Closeness } | null;
}

/** The user's own wording in a span: quotations and citations blanked, technical terms masked. */
function ownWording(text: string, s: number, e: number, quotes: [number, number][], cites: Cite[], allow: string[]) {
  let t = text.slice(s, e);
  for (const [a, b] of [...quotes, ...cites.map((c) => [c.s, c.e] as [number, number])])
    if (a < e && b > s) { const x = Math.max(a, s) - s, y = Math.min(b, e) - s; t = t.slice(0, x) + " ".repeat(y - x) + t.slice(y); }
  return maskTerms(t, allow);
}

/** Exact runs of `minWords`+ words shared with each source (quoted text, citations and technical terms left out). */
function copiedRuns(text: string, toks: Tok[], sources: PSource[], o: Options, skip: [number, number][]) {
  const masked = maskTerms(text, o.allow);
  const excl = new Map<number, string>();
  toks.forEach((t, i) => { if (inside(t, skip) || !masked.slice(t.s, t.e).trim()) excl.set(i, "skip"); });
  const n = Math.min(5, o.minWords);
  const runs = findMatches(toks.map((t) => t.w), sources.map((s) => prepared(s, o.allow).toks.map((t) => t.w)), n, o.minWords, excl);
  const out: { sid: number; s: number; e: number; words: number; srcS: number; srcE: number }[] = [];
  for (const [sid, rs] of runs) {
    const st = prepared(sources[sid], o.allow).toks;
    for (const [b, e, j] of rs) {
      const words = [...Array(e - b).keys()].filter((k) => !excl.has(b + k)).length;
      if (words >= o.minWords) out.push({ sid, s: toks[b].s, e: toks[e - 1].e, words, srcS: st[j].s, srcE: st[Math.min(st.length - 1, j + (e - b) - 1)].e });
    }
  }
  return out;
}

export function analyze(text: string, sources: PSource[], o: Options = DEFAULTS): Analysis {
  const sents = splitSentences(text), toks = tokenize(text), quotes = quoteSpans(text);
  const cites = findCites(text, sources);
  const runs = sources.length ? copiedRuns(text, toks, sources, o, [...quotes, ...cites.map((c) => [c.s, c.e] as [number, number])]) : [];
  const issues: PIssue[] = [];

  const sentences = sents.map((st, i): SentenceResult => {
    const mine: PIssue[] = [];
    const add = (kind: IssueKind, s: number, e: number, message: string, fixes: FixKind[], extra: Partial<PIssue> = {}) =>
      mine.push({ id: `${kind}:${i}:${s}`, kind, severity: kind.startsWith("quote-l") || kind.startsWith("cite") ? "warning" : "error", sentence: i, s, e, message, why: WHY[kind], fixes, ...extra });
    const sCites = cites.filter((c) => c.s >= st.s && c.e <= st.e + 1);
    const cited = sCites.length > 0;
    const label = (sid: number) => `Source ${sid + 1} ${citeFor(sources, sid, o.style)}`;

    // copied wording, then patchwriting, then "tracks a source"
    const run = runs.filter((r) => r.s < st.e && r.e > st.s).sort((a, b) => b.words - a.words)[0];
    const own = stems(ownWording(text, st.s, st.e, quotes, cites, o.allow));
    const best = closest(own, sources, o.allow);
    const derived = o.derived?.find((d) => { const a = squash(d.text), b = squash(st.text); return a.length > 10 && (b.includes(a) || a.includes(b)); });
    let match: Match | undefined;
    if (run) {
      match = { sid: run.sid, kind: "copied", words: run.words, srcS: run.srcS, srcE: run.srcE, docSpans: [[Math.max(run.s, st.s), Math.min(run.e, st.e)]] };
      add("copied", Math.max(run.s, st.s), Math.min(run.e, st.e), `Keeps ${run.words} words in the same order as ${label(run.sid)}.`, ["quote-cite", "rewrite"], { sid: run.sid });
    } else if (best && (tooClose(best.c) || tracks(best.c))) {
      const ss = prepared(sources[best.sid], o.allow).sents[best.k], srcStems = new Set(prepared(sources[best.sid], o.allow).stems[best.k]);
      const docSpans = toks.filter((t) => t.s >= st.s && t.e <= st.e && !inside(t, quotes) && srcStems.has(stems(t.w)[0] ?? "")).map((t): [number, number] => [t.s, t.e]);
      match = { sid: best.sid, kind: tooClose(best.c) ? "close" : "tracks", c: best.c, srcS: ss.s, srcE: ss.e, docSpans };
      if (tooClose(best.c)) {
        const changed = best.c.size - best.c.shared;
        add("patchwriting", st.s, st.e, best.c.order >= 0.5
          ? `Uses the same sentence structure as ${label(best.sid)} with ${changed === 1 ? "one word" : `${changed} words`} changed.`
          : `Uses ${Math.round(best.c.overlap * 100)}% of the same key words as ${label(best.sid)}.`, ["rewrite"], { sid: best.sid });
      }
    }
    const sid = match?.sid ?? derived?.sid;
    if (sid != null && !cited)
      add("idea-uncited", st.s, st.e, `Draws on ${label(sid)} but has no citation.`, ["add-citation"], { sid });

    // quotations
    const qs = quotes.filter(([a]) => a >= st.s && a < st.e);
    const next = sents[i + 1];
    for (const [a, b] of qs) {
      const qCited = cites.some((c) => c.s >= a && c.s <= (next ? next.e : st.e));
      const qWords = text.slice(a, b).split(/\s+/).filter(Boolean).length;
      if (!qCited) {
        const qsid = runs.find((r) => r.s < b && r.e > a)?.sid ?? closest(stems(text.slice(a, b)), sources, o.allow)?.sid ?? (sources.length ? 0 : undefined);
        add("quote-uncited", st.s, st.e, qsid != null ? `This quotation has no citation. It looks like it comes from ${label(qsid)}.` : "This quotation has no citation.", qsid != null ? ["add-citation"] : [], { sid: qsid });
      }
      if (qWords > o.longQuote) add("quote-long", a, b, `This quotation is ${qWords} words long (your limit is ${o.longQuote}).`, ["rewrite"]);
    }

    // citations
    for (const c of sCites) {
      if (c.src < 0) add("cite-no-ref", c.s, c.e, `${c.raw} doesn't match any of your sources. Add the source, or correct the name or year.`, []);
      else {
        const exp = expectedForm(c, sources, o.style);
        if (exp) add("cite-format", c.s, c.e, `${c.raw} should be ${exp} in ${STYLE_LABEL[o.style]}.`, ["fix-format"], { expected: exp, sid: c.src });
      }
    }

    const kinds = new Set(mine.map((x) => x.kind));
    const status: Status = kinds.has("copied") || kinds.has("patchwriting") ? "too-close"
      : kinds.has("idea-uncited") || kinds.has("quote-uncited") ? "needs-citation"
      : qs.length ? "quoted" : "original";
    issues.push(...mine);
    return { ...st, status, issues: mine, match, cited };
  });

  const words = toks.length, quotedWords = toks.filter((t) => inside(t, quotes)).length;
  const quotedPct = words ? Math.round((100 * quotedWords) / words) : 0;
  if (words && quotedWords / words > QUOTE_HEAVY)
    issues.push({ id: "quote-heavy", kind: "quote-heavy", severity: "warning", sentence: -1, s: 0, e: text.length, fixes: [],
      message: `${quotedPct}% of the paragraph is quotation. Keep the quotes where the exact wording matters and explain the rest in your own words.`, why: WHY["quote-heavy"] });
  const verdict: Verdict = issues.some((x) => x.kind !== "quote-heavy") ? "Needs work" : quotedWords / Math.max(1, words) > QUOTE_HEAVY ? "Mostly quoted: add more of your own explanation" : "Ready";
  return { sentences, issues, cites, words, quotedWords, quotedPct, verdict };
}

export type Level = "too-close" | "borderline" | "original";

/** The rewrite editor's meter: the same rules, for one new sentence against the source it came from. */
export function assessRewrite(sentence: string, src: PSource, o: Options): { level: Level | null; reason: string; draws: boolean } {
  const cites = findCites(sentence, [src]), quotes = quoteSpans(sentence);
  const own = ownWording(sentence, 0, sentence.length, quotes, cites, o.allow);
  if (!own.trim() || stems(own).length < 2) return { level: null, reason: "Start writing.", draws: true };
  const toks = tokenize(sentence);
  const run = copiedRuns(sentence, toks, [src], o, [...quotes, ...cites.map((c) => [c.s, c.e] as [number, number])]).sort((a, b) => b.words - a.words)[0];
  if (run) return { level: "too-close", reason: `${run.words} words in a row still match the source.`, draws: true };
  const best = closest(stems(own), [src], o.allow);
  if (best && tooClose(best.c))
    return { level: "too-close", reason: best.c.order >= 0.5 ? "Same structure as the source, with a few words swapped." : "Most of your key words come from one source sentence.", draws: true };
  if (best && (best.c.score >= BORDERLINE_SCORE || best.c.overlap >= 0.45))
    return { level: "borderline", reason: "Still close to the source. Change the structure, not just words: start from your own point.", draws: true };
  return { level: "original", reason: "Your wording is original.", draws: !!best && tracks(best.c) };
}
