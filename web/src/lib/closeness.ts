// Paraphrase closeness meter: how much of the source's wording a rewrite still carries.
// Advice only — it never suggests replacement text.
import { content, plural, words } from "./words";

export type Level = "too-close" | "borderline" | "original";

export interface Closeness {
  level: Level | null; // null = nothing written yet
  longestRun: number; // most words in a row shared with the source
  inOrder: number; // source content words kept in the same order
  rare: string[]; // distinctive source words reused
  reasons: string[];
  tips: string[];
}

function longestCommonRun(a: string[], b: string[]) {
  let best = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) best = prev[j];
      diag = tmp;
    }
  }
  return best;
}

function lcs(a: string[], b: string[]) {
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : Math.max(prev[j], prev[j - 1]);
      diag = tmp;
    }
  }
  return prev[b.length];
}

/** Proper nouns (capitalised mid-sentence in the source) can't be paraphrased, so they don't count as reused wording. */
function properNouns(source: string) {
  const out = new Set<string>();
  for (const m of source.matchAll(/(?<![.!?]\s|^)\b([A-Z][A-Za-z0-9]+)/g)) out.add(m[1].toLowerCase());
  return out;
}

export function closeness(mine: string, source: string): Closeness {
  const a = words(mine), b = words(source);
  const res: Closeness = { level: null, longestRun: 0, inOrder: 0, rare: [], reasons: [], tips: [] };
  if (a.length < 3) return res;

  const proper = properNouns(source);
  const ac = content(a).filter((w) => !proper.has(w)), bc = content(b).filter((w) => !proper.has(w));
  res.longestRun = longestCommonRun(a, b);
  res.inOrder = lcs(ac, bc);
  const mineSet = new Set(ac);
  res.rare = [...new Set(bc.filter((w) => w.length >= 6 && mineSet.has(w)))];

  const keep = bc.length ? res.inOrder / bc.length : 0;
  const longWords = new Set(bc.filter((w) => w.length >= 6)).size;
  const rareShare = longWords ? res.rare.length / longWords : 0;

  res.level =
    res.longestRun >= 6 || (keep >= 0.6 && res.inOrder >= 5) ? "too-close"
    : res.longestRun >= 4 || keep >= 0.35 || rareShare >= 0.5 ? "borderline"
    : "original";

  if (res.longestRun >= 3) res.reasons.push(`${plural(res.longestRun, "word")} in a row match the source.`);
  if (res.inOrder >= 3) res.reasons.push(`This keeps ${res.inOrder} of the source's words in the same order.`);
  if (res.rare.length) res.reasons.push(`Reuses distinctive source words: ${res.rare.slice(0, 6).join(", ")}.`);
  if (!res.reasons.length) res.reasons.push("No run of three or more source words, and little of the source's word order.");

  if (res.level !== "original") {
    if (res.longestRun >= 4) res.tips.push("Break up the longest shared run: say the idea the way you would explain it to a classmate.");
    if (keep >= 0.35) res.tips.push("Change the sentence structure, not just individual words. Start with your own point, then use the source as evidence.");
    if (res.rare.length) res.tips.push("Distinctive terms can stay if they're technical, but put the rest in your own words — or quote the exact phrase.");
  } else res.tips.push("Good — this reads as your own wording.");
  res.tips.push("A good paraphrase still needs a citation.");
  return res;
}

export const LEVEL_LABEL: Record<Level, string> = {
  "too-close": "Too close",
  borderline: "Borderline",
  original: "Original wording",
};
