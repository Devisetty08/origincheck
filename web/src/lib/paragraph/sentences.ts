// Sentence splitting for Paragraph check. A full stop ends a sentence unless it belongs to an abbreviation
// ("e.g.", "et al.", "Fig.", an initial), sits inside a number ("3.5") or is followed by a lower-case word.

export interface Sentence { s: number; e: number; text: string }

const ABBR = new Set(["e.g", "i.e", "al", "etc", "cf", "vs", "fig", "figs", "eq", "eqs", "no", "vol", "pp", "p", "ed", "eds", "dr", "mr",
  "mrs", "ms", "prof", "inc", "ltd", "co", "jr", "sr", "st", "approx", "ca", "viz", "ch", "sec", "dept", "est"]);

export function splitSentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  let start = 0;
  const push = (a: number, b: number) => {
    const raw = text.slice(a, b), lead = raw.length - raw.trimStart().length, t = raw.trim();
    if (t) out.push({ s: a + lead, e: a + lead + t.length, text: t });
  };
  for (const m of text.matchAll(/[.!?]+["”’)\]]*(?=\s|$)/g)) {
    const end = m.index! + m[0].length;
    if (m[0][0] === ".") {
      const word = (text.slice(0, m.index!).match(/(\S+)$/)?.[1] ?? "").replace(/^["“‘(]+/, "").toLowerCase();
      if (ABBR.has(word) || /^[a-z]$/.test(word)) continue; // abbreviation or an initial
      if (/^\s+[a-z]/.test(text.slice(end))) continue; // "et al. found", "approx. five"
    }
    push(start, end);
    start = end;
  }
  push(start, text.length);
  return out;
}
