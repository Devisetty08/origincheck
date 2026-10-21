// Sections of a document (by its headings) and how much of each matches a source, so the most heavily
// flagged sections can be fixed first.
import { bibStart } from "./similarity";

export interface Section { title: string; s: number; e: number; words: number; matched: number; pct: number }

/** A heading: a .docx heading, or a short line without end punctuation followed by more text. */
const looksLikeHeading = (line: string) =>
  line.length > 0 && line.split(/\s+/).length <= 12 && !/[.!?:;,]["”’)]?$/.test(line) && /^(?:\d+(?:\.\d+)*\.?\s+)?[\p{Lu}\d]/u.test(line);

export function sections(text: string, toks: { s: number; e: number }[], matchedTok: Set<number>, headings: Map<string, unknown> = new Map()): Section[] {
  const b = bibStart(text), end = b >= 0 ? b : text.length;
  const starts: { title: string; s: number }[] = [{ title: "Beginning", s: 0 }];
  for (const m of text.slice(0, end).matchAll(/^[^\n]+$/gm)) {
    const line = m[0].trim(), next = text.slice(m.index! + m[0].length, end).trim();
    if ((headings.has(line.replace(/\s+/g, " ")) || looksLikeHeading(line)) && next) starts.push({ title: line, s: m.index! });
  }
  if (starts.length > 1 && !text.slice(0, starts[1].s).trim()) starts.shift(); // nothing before the first heading
  return starts.map((x, i) => {
    const e = i + 1 < starts.length ? starts[i + 1].s : end;
    let words = 0, matched = 0;
    toks.forEach((t, k) => { if (t.s >= x.s && t.e <= e) { words++; if (matchedTok.has(k)) matched++; } });
    return { title: x.title, s: x.s, e, words, matched, pct: words ? Math.round((100 * matched) / words) : 0 };
  }).filter((x) => x.words > 0);
}
