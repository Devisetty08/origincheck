import { describe, expect, it } from "vitest";
import { distinctiveness, hasHangul, pickQueries } from "./queries";

const DOC = `Photosynthesis is a system of biological processes by which photosynthetic organisms convert light energy into chemical energy.
The Calvin cycle fixes carbon dioxide into three-carbon sugars using ATP and NADPH produced by the light reactions.
As Smith noted, "the chloroplast is the engine of the plant cell and nothing else comes close to it in importance".
Rubisco is the most abundant enzyme on Earth according to several estimates (Smith, 2020).
I think this is good and it is what it is and we all know it.

References
Smith, J. (2020). Plants and the chloroplast engine of the cell. Botany Journal.`;

describe("query selection", () => {
  it("picks 8–12-word chunks, at most `max`", () => {
    const q = pickQueries(DOC, { max: 2 });
    expect(q).toHaveLength(2);
    for (const x of q) {
      expect(x.split(" ").length).toBeGreaterThanOrEqual(8);
      expect(x.split(" ").length).toBeLessThanOrEqual(12);
    }
  });
  it("prefers distinctive text over filler", () => {
    const q = pickQueries(DOC, { max: 2 });
    expect(q.join(" ")).toMatch(/photosynthetic|Calvin|NADPH/);
    expect(q.join(" ")).not.toMatch(/I think this is good/);
    expect(distinctiveness("Rubisco carboxylase NADPH chloroplast".split(" "))).toBeGreaterThan(distinctiveness("it is what it is and we".split(" ")));
  });
  it("skips quotations, cited sentences and the reference list when asked", () => {
    const all = pickQueries(DOC, { max: 10 }).join(" | ");
    expect(all).not.toMatch(/plant cell|chloroplast/); // quoted
    expect(all).not.toMatch(/abundant enzyme|Rubisco/); // has an in-text citation
    expect(all).not.toMatch(/Botany Journal/); // bibliography
    const raw = pickQueries(DOC, { max: 10, skipQuotedAndCited: false }).join(" | ");
    expect(raw).toMatch(/plant cell/); // the quoted sentence is searched again
    expect(raw).toMatch(/abundant enzyme/); // and so is the cited one
  });
  it("handles Korean text and detects Hangul", () => {
    expect(hasHangul("광합성은 빛 에너지를 화학 에너지로 바꾸는 과정이다")).toBe(true);
    expect(hasHangul("plain English")).toBe(false);
    const q = pickQueries("광합성은 식물과 조류 그리고 일부 세균이 빛 에너지를 이용하여 이산화 탄소와 물로부터 포도당을 합성하는 과정이다.", { max: 1 });
    expect(q).toHaveLength(1);
  });
  it("returns nothing for text without long sentences", () => {
    expect(pickQueries("Too short. Also short.")).toEqual([]);
  });
});
