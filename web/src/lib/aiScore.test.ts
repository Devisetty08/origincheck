import { describe, expect, it } from "vitest";
import { MIN_WORDS, aiScore, combine, labelFor, perplexitySignal, variationSignal } from "./aiScore";

// Raw signals measured with the real models (see the calibration note in aiScore.ts).
const HUMAN = [
  ["wiki:Photosynthesis", 0.023, 71.8, 0.51], ["wiki:Roman Empire", 0, 82, 0.86], ["wiki:Database normalization", 0, 93.3, 0.66],
  ["wiki:Monsoon of South Asia", 0, 47.3, 0.53], ["wiki:Printing press", 0.137, 132.3, 0.62], ["wiki:Volcano", 0, 73, 0.64],
  ["Thoreau, Walden", 0, 149, 0.61], ["Darwin, Origin of Species", 0.057, 73.8, 0.36],
] as const;
const AI = [["essay 1", 0.937, 42.1, 0.43], ["essay 2", 1, 24.2, 0.53], ["essay 3", 0, 53.9, 0.48], ["essay 4", 0.307, 60.1, 0.5]] as const;

describe("AI score combiner", () => {
  it("keeps ordinary human writing under 50", () => {
    for (const [name, clf, ppl, spread] of HUMAN) expect(combine(clf, ppl, spread).score, name).toBeLessThan(50);
  });
  it("rates typical AI essays high, and shows the detector can miss", () => {
    const s = AI.map(([, clf, ppl, spread]) => combine(clf, ppl, spread).score);
    expect(s[0]).toBeGreaterThan(70);
    expect(s[1]).toBeGreaterThan(70);
    expect(s[2]).toBeLessThan(30); // a real miss: why the score is only an indicator
    expect(labelFor(s[3])).toBe("Unclear");
  });
  it("maps signals onto 0–1 with the documented anchors", () => {
    expect(perplexitySignal(100)).toBe(0);
    expect(perplexitySignal(200)).toBe(0);
    expect(perplexitySignal(25)).toBe(1);
    expect(perplexitySignal(50)).toBeCloseTo(0.5, 5);
    expect(variationSignal(0.75)).toBe(0);
    expect(variationSignal(0.35)).toBe(1);
    expect(combine(1, 10, 0.1).score).toBe(100);
    expect(combine(0, 300, 1).score).toBe(0);
  });
  it("labels Low < 30, Unclear 30–70, High > 70", () => {
    expect([labelFor(29), labelFor(30), labelFor(70), labelFor(71)]).toEqual(["Low", "Unclear", "Unclear", "High"]);
  });
});

describe("aiScore", () => {
  const signals = {
    chunks: [{ start: 0, end: 100, prob: 0.9 }, { start: 100, end: 300, prob: 0.3 }],
    sentences: [
      { start: 0, end: 50, ppl: 30 }, { start: 50, end: 100, ppl: 35 }, { start: 100, end: 200, ppl: 40 }, { start: 200, end: 300, ppl: null },
    ],
  };
  it("needs at least MIN_WORDS words", () => {
    expect(aiScore(MIN_WORDS - 1, signals)).toBeNull();
    expect(aiScore(MIN_WORDS, signals)).not.toBeNull();
  });
  it("weights the classifier by passage length and scores each sentence", () => {
    const r = aiScore(400, signals)!;
    expect(r.classifier).toBeCloseTo((0.9 * 100 + 0.3 * 200) / 300, 5);
    expect(r.perplexity).toBeCloseTo(Math.exp((Math.log(30) + Math.log(35) + Math.log(40)) / 3), 5);
    expect(r.sentenceScores).toHaveLength(4);
    expect(r.sentenceScores[0]!).toBeGreaterThan(r.sentenceScores[2]!); // higher-probability chunk, lower perplexity
    expect(r.sentenceScores[3]).not.toBeNull(); // unscored sentence falls back to the document perplexity
    expect(r.reasons.length).toBe(3);
  });
});
