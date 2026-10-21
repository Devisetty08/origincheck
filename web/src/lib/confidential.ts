// Confidential words: names the writer lists (an employer, client, internal system, project code name) found in
// the text, so they can be removed or generalised before the document is shared.

export interface TermHit { term: string; count: number; spans: [number, number][] }

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function findTerms(text: string, terms: string[]): TermHit[] {
  return terms.map((t) => t.trim()).filter(Boolean).flatMap((term) => {
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${esc(term).replace(/\s+/g, "\\s+")}(?![\\p{L}\\p{N}])`, "giu");
    const spans = [...text.matchAll(re)].map((m): [number, number] => [m.index!, m.index! + m[0].length]);
    return spans.length ? [{ term, count: spans.length, spans }] : [];
  });
}
