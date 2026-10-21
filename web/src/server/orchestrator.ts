// Runs the enabled source adapters in parallel. Each source has its own rate limiter, timeout, retries and cache,
// and reports its own status: one source failing never blocks or fails the rest.
import type { Adapter, NormalizedResult, SourceEvent, Status } from "./adapters/types";

export interface Options {
  concurrency?: number; // sources searched at once
  timeoutMs?: number; // per request
  sourceDeadlineMs?: number; // per source, all of its queries together
  retries?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

class RateLimitedError extends Error {}

const lastCall = new Map<string, number>(); // source → time of its last request (shared across runs)
const cache = new Map<string, { at: number; results: NormalizedResult[] }>();
const CACHE_TTL = 60 * 60 * 1000;
const CACHE_MAX = 1000;

export function clearState() { lastCall.clear(); cache.clear(); }

const isRetryable = (e: unknown) => {
  const s = (e as { status?: number }).status;
  return s === 429 || (s != null && s >= 500) || (e as Error).name === "TimeoutError" || (e as Error).name === "TypeError";
};

async function searchOne(a: Adapter, query: string, o: Required<Options>, deadline: number): Promise<NormalizedResult[]> {
  const key = `${a.id}|${query}`;
  const hit = cache.get(key);
  if (hit && o.now() - hit.at < CACHE_TTL) return hit.results;
  for (let attempt = 0; ; attempt++) {
    const last = lastCall.get(a.id);
    const wait = last == null ? 0 : last + a.minIntervalMs - o.now(); // per-API rate limiter
    if (wait > 0) await o.sleep(wait);
    lastCall.set(a.id, o.now());
    if (o.now() > deadline) throw Object.assign(new Error("source deadline reached"), { name: "TimeoutError" });
    try {
      const results = await a.search(query, { signal: AbortSignal.timeout(o.timeoutMs) });
      cache.set(key, { at: o.now(), results });
      if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
      return results;
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (attempt >= o.retries || !isRetryable(e)) {
        if (status === 429) throw new RateLimitedError("rate limited by the API");
        throw e;
      }
      const retryAfter = (e as { retryAfterMs?: number }).retryAfterMs;
      await o.sleep(Math.min(retryAfter ?? 400 * 2 ** attempt, 5000)); // exponential backoff
    }
  }
}

export async function runSource(a: Adapter, queries: string[], opts: Options = {}): Promise<SourceEvent> {
  const o: Required<Options> = {
    concurrency: 6, timeoutMs: 8000, sourceDeadlineMs: 25_000, retries: 2,
    now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)), ...opts,
  };
  const start = o.now();
  const base = { source: a.id, label: a.label, queries: queries.length };
  const missing = a.missing();
  if (missing) return { ...base, status: "not configured", ms: 0, results: [], error: missing };
  const results: NormalizedResult[] = [];
  const seen = new Set<string>();
  let error: string | undefined, done = 0, limited = false;
  for (const q of queries) {
    try {
      for (const r of await searchOne(a, q, o, start + o.sourceDeadlineMs)) {
        const k = r.doi?.toLowerCase() || r.url || r.title;
        if (!seen.has(k)) { seen.add(k); results.push(r); }
      }
      done++;
    } catch (e) {
      error = (e as Error).message;
      if (e instanceof RateLimitedError) { limited = true; break; }
      if ((e as Error).name === "TimeoutError" && o.now() > start + o.sourceDeadlineMs) break;
    }
  }
  // Results win: a source that found something before failing still reports success, with a note saying it stopped.
  const status: Status = results.length ? "success" : limited ? "rate-limited" : done === 0 ? "failed" : "no results";
  if (error && done > 0 && done < queries.length) error = `${done} of ${queries.length} queries completed; ${error}`;
  return { ...base, status, ms: o.now() - start, results, error };
}

/** Run all sources, calling `emit` as each one finishes (for streaming). */
export async function runAll(adapters: Adapter[], queries: string[], emit: (e: SourceEvent) => void | Promise<void>, opts: Options = {}) {
  const limit = opts.concurrency ?? 6;
  const queue = [...adapters];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    for (let a = queue.shift(); a; a = queue.shift()) {
      let ev: SourceEvent;
      try { ev = await runSource(a, queries, opts); }
      catch (e) { ev = { source: a.id, label: a.label, status: "failed", ms: 0, queries: queries.length, results: [], error: (e as Error).message }; }
      await emit(ev);
    }
  });
  await Promise.all(workers);
}
