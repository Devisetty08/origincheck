// Choosing what to search for: short, distinctive chunks of the document (never the whole text).
import { bibStart, QUOTE_RE } from "./similarity";
import { STOP } from "./words";

export const hasHangul = (t: string) => /[가-힣ᄀ-ᇿ㄰-㆏]/.test(t);

const CITATION = /\((?:[^()]*?\b(?:1[5-9]\d\d|20\d\d)[a-z]?|[^()]*n\.d\.)[^()]*\)|\[\d+(?:\s*[,–-]\s*\d+)*\]/;

/** How unusual a chunk is: long and capitalised words, numbers and non-stopwords make good search queries. */
export function distinctiveness(words: string[]) {
  let s = 0;
  for (const [i, w] of words.entries()) {
    const lw = w.toLowerCase();
    if (STOP.has(lw)) continue;
    s += 1 + Math.min(lw.length, 12) / 6;
    if (i > 0 && /^[A-Z가-힣]/.test(w)) s += 0.5;
    if (/\d/.test(w)) s += 0.5;
  }
  return s / Math.max(1, words.length);
}

export interface QueryOptions { max?: number; minWords?: number; maxWords?: number; skipQuotedAndCited?: boolean }

/**
 * Up to `max` chunks of 8–12 words: the most distinctive window of each sentence, best sentences first,
 * spread through the document. Quoted passages, sentences with an in-text citation and the reference list are skipped.
 */
export function pickQueries(text: string, o: QueryOptions = {}) {
  const max = o.max ?? 8, minW = o.minWords ?? 8, maxW = o.maxWords ?? 12, skip = o.skipQuotedAndCited ?? true;
  const b = bibStart(text);
  let body = b >= 0 ? text.slice(0, b) : text;
  if (skip) body = body.replace(QUOTE_RE, " ");
  const sentences = body.split(/(?<=[.!?。])\s+|\n+/).map((s) => s.trim()).filter(Boolean);
  const candidates: { q: string; score: number; at: number }[] = [];
  sentences.forEach((s, at) => {
    if (skip && CITATION.test(s)) return;
    const words = s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
    if (words.length < minW) return;
    let best = { score: -1, start: 0, len: Math.min(maxW, words.length) };
    for (let len = minW; len <= Math.min(maxW, words.length); len++)
      for (let i = 0; i + len <= words.length; i++) {
        const sc = distinctiveness(words.slice(i, i + len)) + len * 0.01; // prefer longer windows on ties
        if (sc > best.score) best = { score: sc, start: i, len };
      }
    candidates.push({ q: words.slice(best.start, best.start + best.len).join(" "), score: best.score, at });
  });
  // best first, but no two queries from neighbouring sentences while others remain
  const chosen: typeof candidates = [];
  for (const c of [...candidates].sort((x, y) => y.score - x.score)) {
    if (chosen.length >= max) break;
    if (chosen.some((x) => Math.abs(x.at - c.at) < 2) && candidates.length > max * 2) continue;
    chosen.push(c);
  }
  return chosen.sort((x, y) => x.at - y.at).map((c) => c.q);
}
