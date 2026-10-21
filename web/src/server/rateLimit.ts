// Per-client limit on origincheck's own API routes (in memory; per server instance).
import "server-only";

const hits = new Map<string, { start: number; n: number }>();

export function clientKey(req: Request) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Returns a 429 Response when over the limit, otherwise null. */
export function limit(req: Request, bucket: string, max: number, windowMs = 60_000): Response | null {
  const key = `${bucket}|${clientKey(req)}`, now = Date.now();
  const h = hits.get(key);
  if (!h || now - h.start > windowMs) { hits.set(key, { start: now, n: 1 }); return null; }
  if (++h.n <= max) return null;
  const retry = Math.ceil((h.start + windowMs - now) / 1000);
  return Response.json({ error: `Too many requests. Try again in ${retry} s.` }, { status: 429, headers: { "Retry-After": String(retry) } });
}

if (typeof setInterval !== "undefined") setInterval(() => { // forget old windows
  const now = Date.now();
  for (const [k, v] of hits) if (now - v.start > 10 * 60_000) hits.delete(k);
}, 5 * 60_000).unref?.();
