import "server-only";
import { config } from "./config";

export class HttpError extends Error {
  constructor(public status: number, message: string, public retryAfterMs?: number) { super(message); }
}

/** fetch with our User-Agent, a timeout and typed errors (HttpError for non-2xx, carrying Retry-After). */
export async function get(url: string, opts: { signal?: AbortSignal; headers?: Record<string, string>; timeoutMs?: number; init?: RequestInit } = {}) {
  const timeout = AbortSignal.timeout(opts.timeoutMs ?? 8000);
  const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;
  const res = await fetch(url, { ...opts.init, signal, headers: { "User-Agent": config.userAgent, ...opts.headers } });
  if (!res.ok) {
    const ra = res.headers.get("retry-after");
    throw new HttpError(res.status, `HTTP ${res.status}`, ra ? (Number(ra) || 1) * 1000 : undefined);
  }
  return res;
}

export const getJson = async <T = unknown>(url: string, opts?: Parameters<typeof get>[1]) =>
  (await (await get(url, { ...opts, headers: { Accept: "application/json", ...opts?.headers } })).json()) as T;

export const getText = async (url: string, opts?: Parameters<typeof get>[1]) => (await get(url, opts)).text();

/** Plain text from a small HTML fragment (search snippets). */
export const stripTags = (s = "") =>
  s.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
