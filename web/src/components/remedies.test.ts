import { describe, expect, it } from "vitest";
import { track } from "./remedies";

describe("tracking a passage while it is edited", () => {
  const before = "Intro. The copied passage here. Outro.";
  const s = before.indexOf("The"), e = before.indexOf(" Outro");
  const at = (now: string) => { const [a, b] = track(before, s, e, now); return now.slice(a, b); };

  it("stretches over edits inside the passage", () => expect(at("Intro. My own take on it. Outro.")).toBe("My own take on it."));
  it("shifts with edits before it", () => expect(at("A longer intro. The copied passage here. Outro.")).toBe("The copied passage here."));
  it("ignores edits after it", () => expect(at("Intro. The copied passage here. Outro, rewritten.")).toBe("The copied passage here."));
  it("widens to cover edits on both sides", () => expect(at("Intra. The copied passage here. Outra.")).toBe("a. The copied passage here. Outra"));
});
