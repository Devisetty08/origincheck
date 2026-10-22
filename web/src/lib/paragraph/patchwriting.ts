// Patchwriting: a sentence that isn't copied word for word but stays too close to one source sentence.
// Compares content-word stems (stop words removed, Porter stemmer): how many of the sentence's stems the source
// sentence shares, and how many appear in the same order (longest common subsequence).
import { stemmer } from "stemmer";
import { STOP, words } from "../words";

export const TOO_CLOSE_SCORE = 0.55, TOO_CLOSE_OVERLAP = 0.6;
export const TRACKS_OVERLAP = 0.3, TRACKS_SHARED = 3;
export const BORDERLINE_SCORE = 0.4;

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Blank out allow-listed technical terms, so using a product's name isn't counted as borrowing. */
export function maskTerms(text: string, allow: string[]): string {
  let t = text;
  for (const term of allow.map((x) => x.trim()).filter(Boolean))
    t = t.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escRe(term).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "giu"), (m) => " ".repeat(m.length));
  return t;
}

/** Content-word stems in order. */
export const stems = (text: string) => words(text).filter((w) => !STOP.has(w) && w.length > 2 && !/^\d+$/.test(w)).map((w) => stemmer(w));

export function lcs(a: string[], b: string[]): number {
  const prev = new Array(b.length + 1).fill(0), cur = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

export interface Closeness { overlap: number; order: number; score: number; shared: number; size: number }

/** How close `mine` (stems) is to `src` (stems). */
export function compare(mine: string[], src: string[]): Closeness {
  if (!mine.length || !src.length) return { overlap: 0, order: 0, score: 0, shared: 0, size: mine.length };
  const set = new Set(src);
  const shared = mine.filter((w) => set.has(w)).length;
  const overlap = shared / mine.length, order = lcs(mine, src) / mine.length;
  return { overlap, order, score: (overlap + order) / 2, shared, size: mine.length };
}

export const tooClose = (c: Closeness) => c.size >= 4 && (c.score >= TOO_CLOSE_SCORE || c.overlap >= TOO_CLOSE_OVERLAP);
export const tracks = (c: Closeness) => c.shared >= TRACKS_SHARED && c.overlap >= TRACKS_OVERLAP;
