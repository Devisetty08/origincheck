// Matching method shared with origincheck.py. Keep the two in step:
// same tokenizer, shingles, first-position index, runs, attribution and rounding.
import { canon } from "./strict";

export type Tok = { w: string; s: number; e: number };
export type Kind = "file" | "paste" | "internet" | "library" | "saved" | "own" | "draft";
export type Run = [b: number, e: number, j: number]; // doc words [b, e), source start word j

export interface CiteMeta {
  authors: { family: string; given?: string }[];
  title: string;
  year?: string;
  container?: string; // journal, website or publisher
  volume?: string;
  issue?: string;
  pages?: string;
  publisher?: string;
  url?: string;
  doi?: string;
  accessed?: string; // yyyy-mm-dd
}

export interface Source {
  id: string;
  name: string;
  kind: Kind;
  text: string;
  toks: Tok[];
  meta?: CiteMeta;
}

export interface Settings {
  quotes: boolean;
  bib: boolean;
  minWords: number;
  ngram: number;
  dropPct: number;
  strict: boolean;
}

export interface Passage {
  id: string;
  sid: number;
  b: number; // first word
  e: number; // after last word
  s: number; // char start
  end: number; // char end
}

export interface Result {
  excl: Map<number, string>;
  total: number;
  runs: Map<number, Run[]>;
  owner: Map<number, number>;
  counts: Map<number, number>;
  order: number[];
  index: number;
  passages: Passage[];
  close: Passage[]; // strict-mode only, not counted in the index
  closeRuns: Map<number, Run[]>;
}

export const KIND_LABEL: Record<Kind, string> = {
  file: "Uploaded files",
  paste: "Pasted text",
  internet: "Internet",
  library: "Books (Open Library)",
  saved: "Saved documents",
  own: "Your earlier work",
  draft: "Previous drafts",
};

const WORD_RE = /[A-Za-z0-9À-ɏ]+(?:['’][A-Za-z]+)?/g;
export const QUOTE_RE = /["“”]([\s\S]{3,800}?)["“”]/g;
export const BIB_RE = /^\s*(references|bibliography|works cited|reference list|sources|literature cited)\s*:?\s*$/gim;

export function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  for (const m of text.matchAll(WORD_RE))
    out.push({ w: m[0].toLowerCase().replace(/’/g, "'"), s: m.index!, e: m.index! + m[0].length });
  return out;
}

/** Start offset of the bibliography, or -1. */
export function bibStart(text: string): number {
  const h = [...text.matchAll(BIB_RE)];
  return h.length ? h[h.length - 1].index! : -1;
}

export function excludedPositions(text: string, toks: Tok[], quotes: boolean, bib: boolean) {
  const spans: [number, number, string][] = [];
  if (quotes) for (const m of text.matchAll(QUOTE_RE)) spans.push([m.index!, m.index! + m[0].length, "quote"]);
  if (bib) {
    const b = bibStart(text);
    if (b >= 0) spans.push([b, text.length, "bibliography"]);
  }
  const excl = new Map<number, string>();
  for (const [s, e, label] of spans) toks.forEach((t, i) => { if (t.s >= s && t.e <= e) excl.set(i, label); });
  return excl;
}

function shingles(words: string[], n: number) {
  const out: string[] = [];
  for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(" "));
  return out;
}

export function findMatches(docWords: string[], srcWords: string[][], n: number, minWords: number, excl: Map<number, string>) {
  const docSh = shingles(docWords, n);
  const runs = new Map<number, Run[]>();
  srcWords.forEach((sw, sid) => {
    const index = new Map<string, number>();
    shingles(sw, n).forEach((sh, i) => { if (!index.has(sh)) index.set(sh, i); }); // first position
    const covered = new Map<number, number>();
    docSh.forEach((sh, i) => {
      const j = index.get(sh);
      if (j !== undefined)
        for (let k = 0; k < n; k++) if (!excl.has(i + k) && !covered.has(i + k)) covered.set(i + k, j + k);
    });
    const out: Run[] = [];
    for (let k = 0; k < docWords.length; ) {
      if (!covered.has(k)) { k++; continue; }
      const b = k;
      while (covered.has(k)) k++;
      if (k - b >= minWords) out.push([b, k, covered.get(b)!]);
    }
    if (out.length) runs.set(sid, out);
  });
  return runs;
}

export function attribute(runs: Map<number, Run[]>, active: number[]) {
  const totals = new Map<number, number>();
  for (const s of active) if (runs.has(s)) totals.set(s, runs.get(s)!.reduce((a, [b, e]) => a + e - b, 0));
  const owner = new Map<number, number>();
  for (const s of [...totals.keys()].sort((a, b) => totals.get(b)! - totals.get(a)!))
    for (const [b, e] of runs.get(s)!) for (let k = b; k < e; k++) if (!owner.has(k)) owner.set(k, s);
  return owner;
}

export function countBy(owner: Map<number, number>) {
  const c = new Map<number, number>();
  for (const s of owner.values()) c.set(s, (c.get(s) ?? 0) + 1);
  return c;
}

export function score(runs: Map<number, Run[]>, total: number, dropPct: number, skip: Set<number>) {
  let active = [...runs.keys()].filter((s) => !skip.has(s));
  for (let pass = 0; pass < 5; pass++) {
    const counts = countBy(attribute(runs, active));
    const small = active.filter((s) => (100 * (counts.get(s) ?? 0)) / total < dropPct);
    if (!small.length) break;
    active = active.filter((s) => !small.includes(s));
  }
  return attribute(runs, active);
}

/** Contiguous blocks of words credited to the same source. */
function blocks(owner: Map<number, number>, toks: Tok[], prefix: string): Passage[] {
  const out: Passage[] = [];
  for (let i = 0; i < toks.length; ) {
    const sid = owner.get(i);
    if (sid === undefined) { i++; continue; }
    let j = i;
    while (j + 1 < toks.length && owner.get(j + 1) === sid) j++;
    out.push({ id: `${prefix}${sid}:${i}`, sid, b: i, e: j + 1, s: toks[i].s, end: toks[j].e });
    i = j + 1;
  }
  return out;
}

export function check(doc: { text: string; toks: Tok[] }, sources: Source[], set: Settings, skip: Set<number>): Result {
  const excl = excludedPositions(doc.text, doc.toks, set.quotes, set.bib);
  const total = Math.max(1, doc.toks.length - excl.size);
  const runs = findMatches(doc.toks.map((t) => t.w), sources.map((s) => s.toks.map((t) => t.w)), set.ngram, set.minWords, excl);
  const owner = score(runs, total, set.dropPct, skip);
  const counts = countBy(owner);
  const order = [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a - b);

  let close: Passage[] = [];
  let closeRuns = new Map<number, Run[]>();
  if (set.strict) {
    // Stricter mode: match on stems and synonym groups. Words found only this way are
    // "possible close paraphrase" and never count toward the index.
    const sruns = findMatches(doc.toks.map((t) => canon(t.w)), sources.map((s) => s.toks.map((t) => canon(t.w))), set.ngram, set.minWords, excl);
    for (const s of skip) sruns.delete(s);
    closeRuns = sruns;
    const extra = new Map<number, number>();
    for (const [k, s] of attribute(sruns, [...sruns.keys()])) if (!owner.has(k)) extra.set(k, s);
    close = blocks(extra, doc.toks, "c").filter((p) => p.e - p.b >= Math.min(set.ngram, set.minWords));
  }

  return {
    excl, total, runs, owner, counts, order,
    index: Math.round((100 * owner.size) / total),
    passages: blocks(owner, doc.toks, ""),
    close,
    closeRuns,
  };
}

/** Where a document passage sits in its source: [first, last] source word. */
export function sourceSpan(r: Result, p: Passage, src: Source): [number, number] {
  const run = (p.id.startsWith("c") ? r.closeRuns : r.runs).get(p.sid)?.find(([b, e]) => p.b >= b && p.b < e);
  const n = src.toks.length - 1;
  const j0 = Math.min(run ? run[2] + (p.b - run[0]) : 0, n);
  return [j0, Math.min(j0 + (p.e - p.b) - 1, n)];
}
