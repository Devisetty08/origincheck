import { describe, expect, it } from "vitest";
import { paragraphs, sentences } from "./RewriteTab";

describe("rewrite picking", () => {
  it("splits a paragraph into sentences with offsets, keeping closing quotes and a last sentence without a full stop", () => {
    const t = "Title\n\nIt rained.  He said “stop!” Then left? And no end";
    const [, para] = paragraphs(t);
    expect(sentences(t, para).map((r) => t.slice(r.s, r.e))).toEqual(["It rained.", "He said “stop!”", "Then left?", "And no end"]);
  });
});
