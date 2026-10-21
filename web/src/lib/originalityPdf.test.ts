import { describe, expect, it } from "vitest";
import { categoryShares, needsHtmlReport, pdfSafe, sourceLabel } from "./originalityPdf";
import { type Settings, type Source, check, tokenize } from "./similarity";

const set: Settings = { quotes: true, bib: true, minWords: 8, ngram: 5, dropPct: 0, strict: false };
const src = (name: string, kind: Source["kind"], text: string, url?: string): Source =>
  ({ id: name, name, kind, text, toks: tokenize(text), meta: url ? { authors: [], title: name, url } : undefined });

describe("originality report", () => {
  const shared = "the green building movement was born out of this recognition that buildings have the potential for both positive and negative impacts";
  const doc = `Intro sentence written by the student here. ${shared}. Another original closing remark of mine.`;
  const sources = [
    src("Green buildings", "internet", `Some page. ${shared}. More.`, "https://www.example.org/green"),
    src("A journal paper", "scholarly", `Abstract: ${shared}.`),
  ];
  const r = check({ text: doc, toks: tokenize(doc) }, sources, set, new Set());

  it("computes each source-type column separately, so they can add up to more than the index", () => {
    const s = categoryShares(r, sources, new Set());
    expect(s.internet).toBe(r.index); // the same passage is online…
    expect(s.publications).toBe(r.index); // …and in a journal
    expect(s.yours).toBe(0);
    expect(categoryShares(r, sources, new Set([0])).internet).toBe(0); // an excluded source doesn't count
  });
  it("names web sources by their host, others by title", () => {
    expect(sourceLabel(sources[0])).toBe("www.example.org");
    expect(sourceLabel(sources[1])).toBe("A journal paper");
  });
  it("keeps text the PDF fonts can draw and spots scripts they can't", () => {
    expect(pdfSafe("Café “quoted” — ok")).toBe("Café “quoted” — ok");
    expect(pdfSafe("x∑y")).toBe("x?y");
    expect(needsHtmlReport("한국어 문서")).toBe(true);
    expect(needsHtmlReport("Plain English text.")).toBe(false);
  });
});
