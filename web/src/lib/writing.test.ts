import { describe, expect, it } from "vitest";
import { feedback } from "./writing";

describe("readability metrics", () => {
  it("scores plain short sentences as easy and long Latinate ones as hard", () => {
    const easy = feedback("The cat sat on the mat. It was warm. The dog ran in. They both slept all day.");
    const hard = feedback("Notwithstanding considerable methodological heterogeneity, the investigators systematically operationalised multidimensional constructs, thereby facilitating comprehensive comparative evaluation of institutional accountability mechanisms.");
    expect(easy.flesch).toBeGreaterThan(80);
    expect(hard.flesch).toBeLessThan(10);
    expect(easy.sentences).toBe(4);
    expect(easy.words).toBe(18);
  });
  it("finds sentences over 35 words", () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(" ") + ".";
    const r = feedback(`Short one here. ${long} Another short one.`);
    expect(r.long).toHaveLength(1);
    expect(r.long[0].words).toBe(40);
  });
  it("counts passive voice", () => {
    const r = feedback("The report was written by the team. The team wrote the summary. Mistakes were made. The data is stored securely.");
    expect(r.passive.map((p) => p.text)).toEqual(["The report was written by the team.", "Mistakes were made.", "The data is stored securely."]);
    expect(r.passivePct).toBe(75);
  });
  it("finds words repeated within a sentence and overused overall", () => {
    const r = feedback("The system logs the system state. Systems matter. The system again uses the system. The system ends here with system.");
    expect(r.repeated.map((x) => x.word)).toContain("system");
    expect(r.overused[0]).toEqual({ word: "system", count: 6 });
  });
  it("ignores the bibliography", () => {
    const r = feedback("One sentence here.\n\nReferences\n\nSmith, J. (2020). A very long reference title that goes on.");
    expect(r.sentences).toBe(1);
  });
});
