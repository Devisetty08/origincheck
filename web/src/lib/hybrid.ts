// Hybrid matching on top of the exact engine: near-verbatim copying (MinHash/LSH candidates + Levenshtein) and
// paraphrase (embedding similarity, only on lexical candidates). Runs in the browser; the document never leaves it.
import { distance } from "fastest-levenshtein";
import { lshPairs, signature, wordShingles, estimateJaccard } from "./minhash";
import { type Result, type Source, bibStart, excludedPositions, tokenize } from "./similarity";
import { canon } from "./strict";
import { STOP } from "./words";

export type MatchType = "verbatim" | "near-verbatim" | "paraphrase";

export interface PassageMatch {
  type: MatchType;
  sid: number;
  docStart: number; docEnd: number; // character offsets in the document
  srcStart: number; srcEnd: number; // character offsets in the source text
  similarity: number; // 0–1
}

export interface Unit { start: number; end: number; words: string[]; content: string[] }

export const THRESHOLDS = { nearVerbatim: 0.75, paraphrase: 0.8, verbatimCoverage: 0.5, maxSemanticPairs: 400 };

/** Sentences with offsets and normalized words. */
export function sentenceUnits(text: string, minWords = 6, limit = 20_000): Unit[] {
  const out: Unit[] = [];
  for (const m of text.matchAll(/[^.!?。\n]+(?:[.!?。]+["”’)]*|(?=\n)|$)/g)) {
    const t = m[0].trim();
    const words = tokenize(t).map((x) => x.w);
    if (words.length < minWords) continue;
    const start = m.index! + m[0].indexOf(t);
    out.push({ start, end: start + t.length, words, content: words.filter((w) => !STOP.has(w) && w.length > 2).map(canon) });
    if (out.length >= limit) break;
  }
  return out;
}

const norm = (u: Unit) => u.words.join(" ");
export const levenshteinRatio = (a: string, b: string) => (a.length || b.length ? 1 - distance(a, b) / Math.max(a.length, b.length) : 1);

/**
 * Lexical pass. Returns near-verbatim matches and the candidate pairs worth checking for paraphrase.
 * Sentences already covered by the exact engine (verbatim matches) or excluded (quotes, bibliography) are skipped.
 */
export function lexicalPass(doc: { text: string }, sources: Source[], r: Result, settings: { quotes: boolean; bib: boolean }, skip: Set<number>) {
  const toks = tokenize(doc.text);
  const excl = excludedPositions(doc.text, toks, settings.quotes, settings.bib);
  const b = settings.bib ? bibStart(doc.text) : -1;
  const docUnits = sentenceUnits(b >= 0 ? doc.text.slice(0, b) : doc.text).filter((u) => {
    const inside = toks.map((t, i) => [t, i] as const).filter(([t]) => t.s >= u.start && t.e <= u.end);
    const covered = inside.filter(([, i]) => r.owner.has(i) || excl.has(i)).length;
    return covered / Math.max(1, inside.length) < THRESHOLDS.verbatimCoverage;
  });
  const near: PassageMatch[] = [];
  const semantic: { d: Unit; s: Unit; sid: number; score: number }[] = [];
  if (!docUnits.length) return { near, semantic, docUnits };

  const dSig = docUnits.map((u) => signature(wordShingles(u.words, 3)));
  const dSigC = docUnits.map((u) => signature(u.content, 64));
  sources.forEach((src, sid) => {
    if (skip.has(sid)) return;
    const units = sentenceUnits(src.text, 6, 5000);
    if (!units.length) return;
    const nearSeen = new Set<number>();
    // near-verbatim: shared 3-word shingles (bands of 4 rows catch Jaccard ≳ 0.3)
    for (const [i, j] of lshPairs(dSig, units.map((u) => signature(wordShingles(u.words, 3))), 16)) {
      const ratio = levenshteinRatio(norm(docUnits[i]), norm(units[j]));
      if (ratio >= THRESHOLDS.nearVerbatim && !nearSeen.has(i)) {
        nearSeen.add(i);
        near.push({ type: "near-verbatim", sid, docStart: docUnits[i].start, docEnd: docUnits[i].end, srcStart: units[j].start, srcEnd: units[j].end, similarity: ratio });
      }
    }
    // paraphrase candidates: shared content-word stems (bands of 2 rows catch Jaccard ≳ 0.2)
    const uSigC = units.map((u) => signature(u.content, 64));
    for (const [i, j] of lshPairs(dSigC, uSigC, 32)) {
      const score = nearSeen.has(i) ? 0 : estimateJaccard(dSigC[i], uSigC[j]);
      if (score >= 0.15) semantic.push({ d: docUnits[i], s: units[j], sid, score });
    }
  });
  semantic.sort((x, y) => y.score - x.score); // most promising pairs first; the cap keeps the model's work bounded
  return { near: dedupe(near), semantic: semantic.slice(0, THRESHOLDS.maxSemanticPairs), docUnits };
}

/**
 * Cross-language candidates: a source written in another language than the document shares no words with it, so the
 * lexical step can't propose pairs. Pair the document's sentences with those sources' sentences directly; the
 * multilingual model then compares meaning across languages. Capped so the in-browser model stays quick.
 */
export function crossLangPairs(docUnits: Unit[], sources: Source[], docLang: string, skip: Set<number>, maxDoc = 150, maxSrc = 400) {
  const out: { d: Unit; s: Unit; sid: number; score: number }[] = [];
  if (docLang === "und") return out;
  const doc = docUnits.slice(0, maxDoc);
  let budget = maxSrc;
  sources.forEach((src, sid) => {
    if (budget <= 0 || skip.has(sid) || !src.lang || src.lang === "und" || src.lang === docLang) return;
    const units = sentenceUnits(src.text, 6, 5000).slice(0, Math.min(60, budget));
    budget -= units.length;
    for (const s of units) for (const d of doc) out.push({ d, s, sid, score: 0 });
  });
  return out;
}

/** Paraphrase pass: cosine similarity of sentence embeddings for the lexical candidates only. */
export async function semanticPass(text: string, sources: Source[], cands: { d: Unit; s: Unit; sid: number }[],
  embed: (texts: string[]) => Promise<Float32Array[]>, threshold = THRESHOLDS.paraphrase): Promise<PassageMatch[]> {
  if (!cands.length) return [];
  const texts = [...new Set(cands.flatMap((c) => [text.slice(c.d.start, c.d.end), sources[c.sid].text.slice(c.s.start, c.s.end)]))];
  const vecs = await embed(texts);
  const at = new Map(texts.map((t, i) => [t, vecs[i]]));
  const out: PassageMatch[] = [];
  for (const c of cands) {
    const a = at.get(text.slice(c.d.start, c.d.end))!, b = at.get(sources[c.sid].text.slice(c.s.start, c.s.end))!;
    const cos = cosine(a, b);
    if (cos >= threshold) out.push({ type: "paraphrase", sid: c.sid, docStart: c.d.start, docEnd: c.d.end, srcStart: c.s.start, srcEnd: c.s.end, similarity: cos });
  }
  return dedupe(out);
}

export function cosine(a: Float32Array, b: Float32Array) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na * nb) || 1);
}

/** One match per document sentence: the most similar. */
function dedupe(ms: PassageMatch[]) {
  const best = new Map<number, PassageMatch>();
  for (const m of ms) { const cur = best.get(m.docStart); if (!cur || m.similarity > cur.similarity) best.set(m.docStart, m); }
  return [...best.values()].sort((a, b) => a.docStart - b.docStart);
}
