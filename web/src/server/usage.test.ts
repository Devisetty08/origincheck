// The spending guard for metered APIs: checked before each call, stops at the cap, resets each month, and Brave
// results are never cached.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import type { Adapter } from "./adapters/types";
import { clearState, runSource } from "./orchestrator";
import { CapReachedError, resetUsageForTests, spend, usageReport } from "./usage";

const OCT = new Date("2026-10-21T12:00:00Z"), NOV = new Date("2026-11-01T00:00:01Z");
let file = "";
beforeEach(() => {
  file = join(mkdtempSync(join(tmpdir(), "oc-usage-")), "usage.json");
  vi.stubEnv("USAGE_FILE", file);
  vi.stubEnv("BRAVE_MONTHLY_QUERY_CAP", "2");
  resetUsageForTests();
  clearState();
});

describe("spend", () => {
  it("counts each call and refuses the one that would pass the cap, without counting it", () => {
    spend("brave", 1, OCT); spend("brave", 1, OCT);
    expect(() => spend("brave", 1, OCT)).toThrow(CapReachedError);
    expect(usageReport(OCT).apis.find((a) => a.id === "brave")).toMatchObject({ used: 2, cap: 2 });
    expect(JSON.parse(readFileSync(file, "utf8"))).toMatchObject({ month: "2026-10", counts: { brave: 2 } }); // persisted
  });
  it("starts again from zero in a new month", () => {
    spend("brave", 2, OCT);
    expect(() => spend("brave", 1, NOV)).not.toThrow();
    expect(usageReport(NOV)).toMatchObject({ month: "2026-11" });
  });
  it("reads counts back after a restart", () => {
    spend("brave", 2, OCT);
    resetUsageForTests(); // forget the in-memory copy, as a server restart would
    expect(() => spend("brave", 1, OCT)).toThrow(CapReachedError);
  });
});

const fake = (search: Adapter["search"], extra: Partial<Adapter> = {}): Adapter =>
  ({ id: "brave", label: "Brave Search", group: "web", missing: () => null, minIntervalMs: 0, search, metered: "brave", cost: 1, ...extra });
const fast = { sleep: async () => {}, retries: 2 };
const hit = { title: "Page", snippet: "s", url: "https://p", authors: [], source: "brave" as const };

describe("metered sources in a search run", () => {
  it("makes no call once the cap is reached and reports 'cap reached'", async () => {
    const search = vi.fn(async () => [hit]);
    const e = await runSource(fake(search), ["q1", "q2", "q3", "q4"], fast);
    expect(search).toHaveBeenCalledTimes(2);
    expect(e.status).toBe("success"); // it found something before stopping
    expect(e.error).toMatch(/2 of 4 queries completed; monthly cap of 2 reached/);
    const again = await runSource(fake(vi.fn(async () => [hit])), ["q9"], fast);
    expect(again).toMatchObject({ status: "cap reached" });
  });
  it("counts every retry as a call, so retries can't exceed the cap", async () => {
    const search = vi.fn(async () => { throw Object.assign(new Error("HTTP 503"), { status: 503 }); });
    await runSource(fake(search), ["q1"], fast);
    expect(search).toHaveBeenCalledTimes(2); // the third attempt would pass the cap of 2
  });
  it("makes no call and spends nothing when the key is missing", async () => {
    const search = vi.fn(async () => [hit]);
    const e = await runSource(fake(search, { missing: () => "needs BRAVE_API_KEY" }), ["q"], fast);
    expect(e.status).toBe("not configured");
    expect(search).not.toHaveBeenCalled();
    expect(usageReport().apis.find((a) => a.id === "brave")!.used).toBe(0);
  });
  it("never caches Brave results: the same phrase is asked again", async () => {
    vi.stubEnv("BRAVE_MONTHLY_QUERY_CAP", "10");
    const search = vi.fn(async () => [hit]);
    await runSource(fake(search, { noCache: true }), ["same"], fast);
    await runSource(fake(search, { noCache: true }), ["same"], fast);
    expect(search).toHaveBeenCalledTimes(2);
    const cached = vi.fn(async () => [hit]); // a normal source with the same phrase is answered from the cache
    await runSource(fake(cached, { id: "crossref", metered: undefined }), ["same"], fast);
    await runSource(fake(cached, { id: "crossref", metered: undefined }), ["same"], fast);
    expect(cached).toHaveBeenCalledTimes(1);
  });
});
