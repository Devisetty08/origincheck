// Spending guard for metered (pay-as-you-go) APIs: a usage count per calendar month (UTC), checked BEFORE every call.
// When a cap is reached the call is not made. Counts are kept in web/.data/usage.json (git-ignored).
// ponytail: a local JSON file — right for one machine or one long-running server. On Vercel the disk isn't kept
// between requests, so counts fall back to memory per instance; use a shared store (e.g. Upstash Redis) there.
import "server-only";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { config } from "./config";

export type Metered = "tavily" | "brave" | "anthropic" | "copyleaks";
export const METERED: { id: Metered; label: string; unit: string }[] = [
  { id: "tavily", label: "Tavily web search", unit: "credits" },
  { id: "brave", label: "Brave Search", unit: "searches" },
  { id: "anthropic", label: "Anthropic (Rewrite)", unit: "requests" },
  { id: "copyleaks", label: "Copyleaks scans", unit: "scans" },
];

export class CapReachedError extends Error {
  constructor(public api: Metered, public cap: number) { super(`monthly cap reached (${cap})`); this.name = "CapReachedError"; }
}

type Store = { month: string; counts: Partial<Record<Metered, number>> };
const month = (now: Date) => now.toISOString().slice(0, 7);
let mem: Store | null = null;
const file = () => process.env.USAGE_FILE || join(process.cwd(), ".data", "usage.json");

function load(now: Date): Store {
  if (!mem) {
    try { mem = existsSync(file()) ? JSON.parse(readFileSync(file(), "utf8")) : null; } catch { mem = null; }
    mem ??= { month: month(now), counts: {} };
  }
  if (mem.month !== month(now)) mem = { month: month(now), counts: {} }; // a new month starts from zero
  return mem;
}
function save() {
  try { mkdirSync(dirname(file()), { recursive: true }); writeFileSync(file(), JSON.stringify(mem)); }
  catch { /* read-only disk (e.g. serverless): counts stay in memory */ }
}

export const capOf = (api: Metered) => config.caps[api];

/** Count `n` uses of a metered API if the cap allows it; otherwise throw CapReachedError without counting. */
export function spend(api: Metered, n = 1, now = new Date()) {
  const s = load(now), used = s.counts[api] ?? 0, cap = capOf(api);
  if (used + n > cap) throw new CapReachedError(api, cap);
  s.counts[api] = used + n;
  save();
}

/** Usage of every metered API this month, for the Settings page. */
export function usageReport(now = new Date()) {
  const s = load(now);
  return { month: s.month, apis: METERED.map((m) => ({ ...m, used: s.counts[m.id] ?? 0, cap: capOf(m.id) })) };
}

export function resetUsageForTests() { mem = null; }
