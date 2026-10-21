import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { Adapter, SourceEvent } from "./adapters/types";
import { clearState, runAll, runSource } from "./orchestrator";

const fake = (id: string, impl: Adapter["search"], extra: Partial<Adapter> = {}): Adapter =>
  ({ id: id as Adapter["id"], label: id, group: "refs", missing: () => null, minIntervalMs: 0, search: impl, ...extra });
const hit = (title: string) => ({ title, snippet: "", authors: [], source: "crossref" as const, url: `https://x/${title}` });
const httpErr = (status: number, retryAfterMs?: number) => Object.assign(new Error(`HTTP ${status}`), { status, retryAfterMs });
const fast = { sleep: async () => {}, retries: 2 };

beforeEach(() => clearState());

describe("slow services", () => {
  it("searches only maxQueries phrases", async () => {
    const search = vi.fn(async (q: string) => [hit(q)]);
    const e = await runSource(fake("slow", search, { maxQueries: 1 }), ["a", "b", "c"], fast);
    expect(search).toHaveBeenCalledTimes(1);
    expect(e).toMatchObject({ status: "success", queries: 1 });
  });
  it("gives one long request and doesn't retry it after its timeout", async () => {
    let t = 0;
    const search = vi.fn(async () => { t += 45_000; throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); });
    const e = await runSource(fake("slow", search, { timeoutMs: 45_000, maxQueries: 1 }), ["a"], { ...fast, now: () => t });
    expect(search).toHaveBeenCalledTimes(1);
    expect(e.status).toBe("failed");
  });
});

describe("runSource", () => {
  it("reports success and de-duplicates results across queries", async () => {
    const e = await runSource(fake("a", async (q) => [hit("same"), hit(q)]), ["q1", "q2"], fast);
    expect(e.status).toBe("success");
    expect(e.results.map((r) => r.title)).toEqual(["same", "q1", "q2"]);
  });
  it("reports no results", async () => {
    expect((await runSource(fake("a", async () => []), ["q"], fast)).status).toBe("no results");
  });
  it("reports not configured without calling the API", async () => {
    const search = vi.fn();
    const e = await runSource(fake("a", search, { missing: () => "needs KEY" }), ["q"], fast);
    expect(e).toMatchObject({ status: "not configured", error: "needs KEY" });
    expect(search).not.toHaveBeenCalled();
  });
  it("retries with backoff on 5xx and succeeds", async () => {
    const waits: number[] = [];
    let n = 0;
    const e = await runSource(fake("a", async () => { if (n++ < 2) throw httpErr(503); return [hit("ok")]; }), ["q"], { ...fast, sleep: async (ms) => { waits.push(ms); } });
    expect(e.status).toBe("success");
    expect(waits).toEqual([400, 800]);
  });
  it("honours Retry-After and reports rate-limited when 429 persists", async () => {
    const waits: number[] = [];
    const e = await runSource(fake("a", async () => { throw httpErr(429, 1500); }), ["q1", "q2"], { ...fast, sleep: async (ms) => { waits.push(ms); } });
    expect(e.status).toBe("rate-limited");
    expect(waits).toEqual([1500, 1500]);
  });
  it("does not retry a 4xx and reports failed", async () => {
    const search = vi.fn(async () => { throw httpErr(400); });
    const e = await runSource(fake("a", search), ["q"], fast);
    expect(e.status).toBe("failed");
    expect(search).toHaveBeenCalledTimes(1);
  });
  it("treats a timeout as a retryable failure", async () => {
    const e = await runSource(fake("a", async () => { throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); }), ["q"], fast);
    expect(e).toMatchObject({ status: "failed", error: "timed out" });
  });
  it("keeps partial results when some queries fail", async () => {
    const e = await runSource(fake("a", async (q) => { if (q === "bad") throw httpErr(400); return [hit(q)]; }), ["bad", "good"], fast);
    expect(e.status).toBe("success");
  });
  it("reports success with a note when rate-limited after finding results", async () => {
    const e = await runSource(fake("a", async (q) => { if (q === "q2") throw httpErr(429, 10); return [hit(q)]; }), ["q1", "q2", "q3"], fast);
    expect(e).toMatchObject({ status: "success", error: "1 of 3 queries completed; rate limited by the API" });
    expect(e.results).toHaveLength(1);
  });
  it("reports failed, not no results, when the deadline stops it before any query completes", async () => {
    let t = 0;
    const e = await runSource(fake("a", async () => { t += 30_000; throw Object.assign(new Error("timed out"), { name: "TimeoutError" }); }), ["q1", "q2", "q3"],
      { ...fast, now: () => t });
    expect(e.status).toBe("failed");
  });
  it("spaces requests by the source's minimum interval", async () => {
    let t = 0;
    const waits: number[] = [];
    await runSource(fake("slow", async () => [], { minIntervalMs: 3000 }), ["a", "b", "c"],
      { ...fast, now: () => t, sleep: async (ms) => { waits.push(ms); t += ms; } });
    expect(waits).toEqual([3000, 3000]);
  });
  it("caches by (source, query)", async () => {
    const search = vi.fn(async () => [hit("x")]);
    await runSource(fake("a", search), ["q"], fast);
    await runSource(fake("a", search), ["q"], fast);
    expect(search).toHaveBeenCalledTimes(1);
  });
});

describe("runAll", () => {
  it("emits one status per source and isolates failures", async () => {
    const events: SourceEvent[] = [];
    await runAll([
      fake("good", async () => [hit("x")]),
      fake("broken", async () => { throw new Error("boom"); }),
      fake("off", async () => [], { missing: () => "needs KEY" }),
      fake("throws-sync", (() => { throw new Error("sync"); }) as unknown as Adapter["search"]),
    ], ["q"], (e) => { events.push(e); }, fast);
    expect(Object.fromEntries(events.map((e) => [e.source, e.status]))).toEqual({
      good: "success", broken: "failed", off: "not configured", "throws-sync": "failed",
    });
  });
  it("streams results in the order sources finish", async () => {
    const order: string[] = [];
    const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await runAll([fake("slow", async () => { await delay(30); return []; }), fake("quick", async () => [])], ["q"], (e) => { order.push(e.source); }, { retries: 0 });
    expect(order).toEqual(["quick", "slow"]);
  });
});
