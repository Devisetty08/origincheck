import { describe, expect, it } from "vitest";
import { checkCitations } from "./citations";
import { findTerms } from "./confidential";

const kinds = (text: string) => checkCitations(text, []).map((x) => x.kind);

describe("citation check: quotes and claims", () => {
  it("flags a quotation of 40 or more words", () => {
    const long = Array.from({ length: 42 }, (_, i) => `word${i}`).join(" ");
    expect(kinds(`As Smith put it, “${long}” (Smith, 2020).`)).toContain("long-quote");
    expect(kinds(`As Smith put it, “a short and exact phrase” (Smith, 2020).`)).not.toContain("long-quote");
  });
  it("flags a text that is mostly quotations", () => {
    const q = `“${"quoted words here ".repeat(10).trim()}” (Lee, 2021). `;
    const own = "My own sentence about the project. ".repeat(4);
    expect(kinds((q + own).repeat(6))).toContain("quote-heavy");
  });
  it("flags statistics and 'studies show' without a citation, but not your own findings or cited ones", () => {
    expect(kinds("Studies show that most migrations run over budget.")).toContain("uncited-claim");
    expect(kinds("About 70% of projects use open-source databases.")).toContain("uncited-claim");
    expect(kinds("About 70% of projects use open-source databases (Gartner, 2023).")).not.toContain("uncited-claim");
    expect(kinds("In our tests, 70% of the queries ran faster.")).not.toContain("uncited-claim");
  });
});

describe("confidential words", () => {
  it("finds whole words and phrases, ignoring case", () => {
    const t = "Northern Trust uses Oracle. The northern trust team and NorthernTrustCo.";
    expect(findTerms(t, ["Northern Trust", " ", "Oracle"]).map((x) => [x.term, x.count])).toEqual([["Northern Trust", 2], ["Oracle", 1]]);
  });
});
