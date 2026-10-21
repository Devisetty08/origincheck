// The engine must reproduce the CLI's results on the bundled example (origincheck.py gives the same numbers).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import mammoth from "mammoth";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { type PdfItem, pdfText } from "./extract";
import { type Settings, type Source, check, tokenize } from "./similarity";

const EX = new URL("../../../example/", import.meta.url);
const read = async () => {
  const draft = (await mammoth.extractRawText({ path: new URL("draft.docx", EX).pathname.replace(/^\/([A-Z]:)/, "$1") })).value;
  const azure = readFileSync(new URL("references/azure.txt", EX), "utf8");
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(new URL("references/ora2pg.pdf", EX))) }).promise;
  const pages: PdfItem[][] = [];
  for (let p = 1; p <= pdf.numPages; p++) pages.push((await (await pdf.getPage(p)).getTextContent()).items as PdfItem[]);
  const src = (name: string, text: string): Source => ({ id: name, name, kind: "file", text, toks: tokenize(text) });
  return { doc: { text: draft, toks: tokenize(draft) }, sources: [src("azure.txt", azure), src("ora2pg.pdf", pdfText(pages))] };
};
const base: Settings = { quotes: true, bib: true, minWords: 8, ngram: 5, dropPct: 0, strict: false };
const pct = (r: ReturnType<typeof check>, sid: number) => Math.round((100 * (r.counts.get(sid) ?? 0)) / r.total);

describe("similarity engine on the example", async () => {
  const { doc, sources } = await read();

  it("gives 47% (azure 26%, ora2pg 21%) with quotes and bibliography excluded", () => {
    const r = check(doc, sources, base, new Set());
    expect(r.index).toBe(47);
    expect([pct(r, 0), pct(r, 1)]).toEqual([26, 21]);
    expect(r.passages).toHaveLength(2);
  });
  it("gives 61% (33% / 28%) with no exclusions", () => {
    const r = check(doc, sources, { ...base, quotes: false, bib: false }, new Set());
    expect(r.index).toBe(61);
    expect([pct(r, 0), pct(r, 1)]).toEqual([33, 28]);
  });
  it("re-attributes when a source is excluded, and respects quotes", () => {
    expect(check(doc, sources, base, new Set([0])).index).toBe(21);
    expect(check(doc, sources, { ...base, quotes: false }, new Set([0])).index).toBe(33);
  });
  it("drops small sources and re-attributes", () => {
    expect(check(doc, sources, { ...base, dropPct: 25 }, new Set()).index).toBe(26);
  });
});
