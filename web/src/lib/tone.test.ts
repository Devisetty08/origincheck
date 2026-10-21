import { describe, expect, it } from "vitest";
import { tone } from "./tone";

describe("tone", () => {
  it("calls plain academic prose neutral", () => {
    expect(tone("The study measured the height of broad beans in two rows. The wall row grew faster than the row beside the water butt.").label).toBe("Neutral");
  });
  it("flags strongly emotional sentences for review", () => {
    const t = tone("This terrible, awful policy is a disaster and a horrible failure. The data were collected in March.");
    expect(t.label).toBe("Negative");
    expect(t.strong[0].text).toMatch(/terrible/);
    expect(t.strong[0].words).toEqual(expect.arrayContaining(["terrible", "awful"]));
  });
});
