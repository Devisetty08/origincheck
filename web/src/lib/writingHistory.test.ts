import { describe, expect, it, vi } from "vitest";
const store = new Map<string, unknown>();
vi.mock("idb-keyval", () => ({
  get: async (k: string) => store.get(k), set: async (k: string, v: unknown) => { store.set(k, v); }, del: async (k: string) => { store.delete(k); },
}));
const W = await import("./writingHistory");
type Origin = import("./writingHistory").Origin;

const T0 = Date.UTC(2026, 9, 21, 9, 0, 0);
const type = (h: ReturnType<typeof W.newHistory>, prev: string, next: string, o: Origin, at: number) => W.recordChange(h, prev, next, o, at);

describe("origin of the text", () => {
  it("attributes typed, pasted and AI-assisted parts, and deletions shrink them", () => {
    let h = W.newHistory("essay", "Essay", "", "typed", T0);
    h = type(h, "", "Hello", "typed", T0 + 1000);
    h = type(h, "Hello", "Hello world, pasted text.", "pasted", T0 + 2000);
    h = type(h, "Hello world, pasted text.", "Hello world, better text.", "ai", T0 + 3000);
    // "pasted" → "better": all six letters differ ("…ed" vs "…er"), so six characters are AI-assisted
    expect(h.runs).toEqual([{ len: 5, origin: "typed" }, { len: 8, origin: "pasted" }, { len: 6, origin: "ai" }, { len: 6, origin: "pasted" }]);
    expect(h.pastes).toEqual([{ at: T0 + 2000, size: 20 }]);
    h = type(h, "Hello world, better text.", "Hello", "typed", T0 + 4000); // delete everything after "Hello"
    expect(h.runs).toEqual([{ len: 5, origin: "typed" }]);
  });
  it("inserting inside a run splits it", () => {
    expect(W.spliceRuns([{ len: 10, origin: "typed" }], 4, 0, 3, "ai")).toEqual([{ len: 4, origin: "typed" }, { len: 3, origin: "ai" }, { len: 6, origin: "typed" }]);
  });
  it("summarises the shares", () => {
    let h = W.newHistory("d", "D", "", "typed", T0);
    h = type(h, "", "a".repeat(60), "typed", T0 + 1000);
    h = type(h, "a".repeat(60), "a".repeat(60) + "b".repeat(25), "pasted", T0 + 2000);
    h = type(h, "a".repeat(85), "a".repeat(85) + "c".repeat(15), "ai", T0 + 3000);
    expect(W.summary(h).share).toEqual({ typed: 60, pasted: 25, ai: 15, imported: 0 });
  });
});

describe("time and sessions", () => {
  it("counts writing time without long idle gaps, and a long pause starts a new session", () => {
    let h = W.newHistory("d", "D", "", "typed", T0);
    h = type(h, "", "a", "typed", T0 + 60_000);                 // +1 min
    h = type(h, "a", "ab", "typed", T0 + 60_000 + 10 * 60_000);   // 10 min idle: not counted
    h = type(h, "ab", "abc", "typed", T0 + 60_000 + 50 * 60_000); // 40 min pause: new session
    expect(W.summary(h)).toMatchObject({ minutes: 1, sessions: 2 });
  });
});

describe("snapshots", () => {
  it("snapshots only after a pause, and only once per pause", () => {
    let h = W.newHistory("d", "D", "First.", "typed", T0);
    h = type(h, "First.", "First. Second.", "typed", T0 + 10_000);
    expect(W.snapshotDue(h, T0 + 12_000)).toBe(false);       // still typing
    expect(W.snapshotDue(h, T0 + 15_000)).toBe(true);        // paused 5 s
    h = W.addSnapshot(h, "First. Second.", "edit", T0 + 15_000);
    expect(W.snapshotDue(h, T0 + 30_000)).toBe(false);       // nothing new since
    expect(W.addSnapshot(h, "First. Second.", "save", T0 + 31_000)).toBe(h); // unchanged text adds nothing
  });
  it("stores diffs and rebuilds every version exactly", () => {
    const versions = ["One line.", "One line.\nTwo lines.", "One better line.\nTwo lines.", "Two lines."];
    let h = W.newHistory("d", "D", versions[0], "imported", T0);
    versions.slice(1).forEach((v, i) => { h = W.addSnapshot(h, v, "edit", T0 + (i + 1) * 10_000); });
    versions.forEach((v, i) => expect(W.textAt(h, i)).toBe(v));
    expect(h.snapshots.slice(1).every((s) => s.text === undefined && s.patch)).toBe(true);
  });
});

describe("export and delete", () => {
  it("exports a report with the summary, milestones and the process-evidence note", () => {
    let h = W.newHistory("essay", "My essay", "", "typed", T0);
    h = type(h, "", "Typed words here.", "typed", T0 + 1000);
    h = W.addSnapshot(h, "Typed words here.", "save", T0 + 7000);
    const r = W.exportReport(h, T0 + 9000);
    expect(r).toMatchObject({ title: "My essay", summary: { line: "100% typed, 0% pasted, 0% AI-assisted" } });
    expect(r.milestones.map((m) => m.words)).toEqual([0, 3]);
    expect(r.note).toMatch(/not proof of authorship/);
  });
  it("deleting removes everything stored for the document", async () => {
    const h = W.newHistory("essay", "Essay", "Text.", "typed", T0);
    await W.saveHistory(h);
    expect(await W.loadHistory("essay")).toEqual(h);
    await W.deleteHistory("essay");
    expect(await W.loadHistory("essay")).toBeUndefined();
    expect([...store.keys()].filter((k) => k.includes("essay"))).toEqual([]);
  });
});
