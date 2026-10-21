import { describe, expect, it } from "vitest";
import { sections } from "./sections";
import { tokenize } from "./similarity";

describe("sections", () => {
  const text = "1. Introduction\nWe moved the database last year.\n\n2.1 Background\nOra2Pg is a free tool used to migrate an Oracle database.\n\nReferences\nDarold, G. (2024). Ora2Pg.";
  const toks = tokenize(text);
  const bg = text.indexOf("Ora2Pg is"), matched = new Set(toks.map((t, i) => (t.s >= bg && t.s < text.indexOf("\n\nReferences") ? i : -1)).filter((i) => i >= 0));

  it("splits by headings, leaves out the reference list and scores each section", () => {
    const s = sections(text, toks, matched);
    expect(s.map((x) => x.title)).toEqual(["1. Introduction", "2.1 Background"]);
    expect(s[0].pct).toBe(0);
    expect(s[1].pct).toBeGreaterThan(70);
  });
  it("doesn't take a sentence for a heading", () => {
    expect(sections("A sentence that ends.\nAnother line here.", tokenize("A sentence that ends.\nAnother line here."), new Set()).map((x) => x.title)).toEqual(["Beginning"]);
  });
});
