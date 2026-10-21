import { describe, expect, it } from "vitest";
import { estimateJaccard, jaccard, lshPairs, signature, wordShingles } from "./minhash";
import { cosine, crossLangPairs, lexicalPass, levenshteinRatio, semanticPass, sentenceUnits } from "./hybrid";
import { detectLanguage } from "./language";
import { type Settings, type Source, check, tokenize } from "./similarity";

const src = (text: string): Source => ({ id: "s", name: "source", kind: "file", text, toks: tokenize(text) });
const set: Settings = { quotes: true, bib: true, minWords: 8, ngram: 5, dropPct: 0, strict: false };

describe("MinHash and LSH", () => {
  it("estimates Jaccard similarity", () => {
    const a = wordShingles("the quick brown fox jumps over the lazy dog today".split(" "));
    const b = wordShingles("the quick brown fox jumps over the lazy cat today".split(" "));
    const est = estimateJaccard(signature(a, 128), signature(b, 128));
    expect(Math.abs(est - jaccard(a, b))).toBeLessThan(0.15);
    expect(estimateJaccard(signature(a), signature(a))).toBe(1);
  });
  it("puts near-duplicates in the same bucket and keeps unrelated text apart", () => {
    const docs = ["migration requires careful assessment of schema objects stored procedures and data types",
      "the weather in the mountains was cold and windy all week long"].map((t) => signature(wordShingles(t.split(" "))));
    const srcs = ["migration requires a careful assessment of schema objects stored procedures and data types",
      "cooking pasta needs salted boiling water and a large pot with lid"].map((t) => signature(wordShingles(t.split(" "))));
    const pairs = lshPairs(docs, srcs, 16).map((p) => p.join(":"));
    expect(pairs).toContain("0:0");
    expect(pairs).not.toContain("1:1");
  });
});

describe("classification", () => {
  const SOURCE = "Migrating from Oracle to PostgreSQL requires careful assessment of schema objects, stored procedures and data types. "
    + "The weather was pleasant in the valley that spring and many farmers planted early. "
    + "Rising global temperatures are causing more frequent and severe weather events around the world.";
  const DOC = "Moving from Oracle to PostgreSQL requires a careful assessment of schema objects, stored procedures and data types. " // near-verbatim
    + "Our team met every Tuesday to review progress and plan the following sprint carefully. " // original
    + "Severe weather events are happening more often worldwide because global temperatures keep climbing. "; // paraphrase
  const s = [src(SOURCE)];
  const r = check({ text: DOC, toks: tokenize(DOC) }, s, set, new Set());

  it("finds near-verbatim copying the exact engine misses", () => {
    expect(r.passages).toHaveLength(1); // exact engine: the long copied run only
    const { near } = lexicalPass({ text: DOC }, s, { ...r, owner: new Map() }, set, new Set());
    expect(near).toHaveLength(1);
    expect(near[0]).toMatchObject({ type: "near-verbatim", sid: 0 });
    expect(near[0].similarity).toBeGreaterThan(0.75);
    expect(DOC.slice(near[0].docStart, near[0].docEnd)).toMatch(/^Moving from Oracle/);
  });
  it("skips sentences the exact engine already reports as verbatim", () => {
    const { near } = lexicalPass({ text: DOC }, s, r, set, new Set());
    expect(near).toHaveLength(0);
  });
  it("sends only lexical candidates to the embedding model and classifies paraphrase", async () => {
    const { semantic } = lexicalPass({ text: DOC }, s, r, set, new Set());
    const docSents = new Set(semantic.map((c) => DOC.slice(c.d.start, c.d.end)));
    expect([...docSents].some((t) => t.startsWith("Severe weather"))).toBe(true);
    expect([...docSents].some((t) => t.startsWith("Our team met"))).toBe(false); // not a candidate at all
    const fakeEmbed = async (texts: string[]) => texts.map((t) => /weather|temperatures/i.test(t) ? new Float32Array([1, 0.1, 0]) : new Float32Array([0, 1, 0]));
    const para = await semanticPass(DOC, s, semantic, fakeEmbed);
    expect(para.map((p) => DOC.slice(p.docStart, p.docEnd))).toEqual([expect.stringMatching(/^Severe weather/)]);
    expect(para[0].type).toBe("paraphrase");
  });
  it("respects excluded sources and quotes", () => {
    expect(lexicalPass({ text: DOC }, s, { ...r, owner: new Map() }, set, new Set([0])).near).toHaveLength(0);
    const quoted = `“${DOC.split(". ")[0]}.” Then more text follows here for a while.`;
    expect(lexicalPass({ text: quoted }, s, { ...r, owner: new Map() }, set, new Set()).near).toHaveLength(0);
  });
  it("measures similarity", () => {
    expect(levenshteinRatio("abc", "abc")).toBe(1);
    expect(levenshteinRatio("kitten", "sitting")).toBeCloseTo(1 - 3 / 7, 5);
    expect(cosine(new Float32Array([1, 0]), new Float32Array([1, 0]))).toBeCloseTo(1);
    expect(cosine(new Float32Array([1, 0]), new Float32Array([0, 1]))).toBeCloseTo(0);
    expect(sentenceUnits("Short one. This sentence is long enough to count as a unit.")).toHaveLength(1);
  });
});

describe("cross-language matching", () => {
  it("pairs document sentences only with sources in another language, within the caps", () => {
    const doc = "Elegimos una plataforma gestionada para la base de datos del proyecto. Probamos cada procedimiento almacenado con datos reales antes del cambio.";
    const en = { ...src("We chose a managed platform for the project's database. Every stored procedure was tested against real data before the switch."), lang: "eng" };
    const es = { ...src("Otra fuente escrita también en español sobre bases de datos y migraciones de sistemas antiguos."), lang: "spa" };
    const units = sentenceUnits(doc);
    const pairs = crossLangPairs(units, [en, es], "spa", new Set());
    expect(pairs.length).toBe(units.length * 2); // 2 doc sentences × 2 English sentences; the Spanish source is skipped
    expect(new Set(pairs.map((p) => p.sid))).toEqual(new Set([0]));
    expect(crossLangPairs(units, [en], "spa", new Set([0]))).toEqual([]); // excluded source
    expect(crossLangPairs(units, [en], "und", new Set())).toEqual([]); // unknown document language
  });
});

describe("language detection", () => {
  it("names the main language of a text", () => {
    expect(detectLanguage("We chose a managed platform for the database migration and tested every stored procedure carefully.").name).toBe("English");
    expect(detectLanguage("이 문서는 한국어로 작성되었습니다. 우리는 데이터베이스를 클라우드로 옮겼습니다.").code).toBe("kor");
    expect(detectLanguage("Hi").code).toBe("und");
  });
});
