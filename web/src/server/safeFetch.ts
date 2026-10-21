// Fetch a user-supplied URL without letting it reach internal services (SSRF protection):
//  • http/https only, no credentials in the URL
//  • every resolved address must be public unicast (no private, loopback, link-local, metadata, CGNAT, multicast…)
//  • the connection is pinned to the checked address (no DNS-rebinding window), and redirects are re-checked
//  • size, time and redirect limits
import "server-only";
import ipaddr from "ipaddr.js";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { config } from "./config";

export const LIMITS = { maxBytes: 3_000_000, timeoutMs: 10_000, maxRedirects: 4 };
const BLOCKED_HOSTS = /^(localhost|.*\.localhost|.*\.local|.*\.internal|metadata(\..*)?)$/i;

export class BlockedError extends Error {}

/** True only for public unicast addresses. */
export function isPublicAddress(ip: string) {
  if (!ipaddr.isValid(ip)) return false;
  let a = ipaddr.parse(ip);
  if (a.kind() === "ipv6" && (a as ipaddr.IPv6).isIPv4MappedAddress()) a = (a as ipaddr.IPv6).toIPv4Address();
  return a.range() === "unicast";
}

export interface Transport {
  resolve(host: string): Promise<string[]>;
  request(url: URL, ip: string, signal: AbortSignal): Promise<{ status: number; headers: Record<string, string | undefined>; body: Buffer }>;
}

export const nodeTransport: Transport = {
  async resolve(host) {
    return (await lookup(host, { all: true, verbatim: true })).map((r) => r.address);
  },
  request(url, ip, signal) {
    return new Promise((resolve, reject) => {
      const mod = url.protocol === "https:" ? https : http;
      const req = mod.request(url, {
        method: "GET", signal, servername: url.hostname,
        headers: { "User-Agent": config.userAgent, Accept: "text/html,application/xhtml+xml,text/plain,application/pdf;q=0.9,*/*;q=0.5" },
        // connect to the address we checked, not whatever a second DNS lookup returns
        lookup: (_h: string, _o: object, cb: (e: Error | null, a: string, f: number) => void) => cb(null, ip, ip.includes(":") ? 6 : 4),
      }, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > LIMITS.maxBytes) { req.destroy(new BlockedError(`page is larger than ${LIMITS.maxBytes / 1e6} MB`)); return; }
          chunks.push(c);
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers as Record<string, string | undefined>, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      });
      req.on("error", reject);
      req.end();
    });
  },
};

async function checkedAddress(url: URL, t: Transport) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new BlockedError("only http and https addresses are allowed");
  if (url.username || url.password) throw new BlockedError("addresses with credentials are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.test(host)) throw new BlockedError("internal host names are not allowed");
  const ips = ipaddr.isValid(host) ? [host] : await t.resolve(host);
  if (!ips.length) throw new BlockedError("the host name did not resolve");
  const bad = ips.find((ip) => !isPublicAddress(ip));
  if (bad) throw new BlockedError("that address points to a private or reserved network");
  return ips[0];
}

export async function safeFetch(raw: string, t: Transport = nodeTransport) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new BlockedError("not a valid web address"); }
  const signal = AbortSignal.timeout(LIMITS.timeoutMs);
  for (let hop = 0; ; hop++) {
    const ip = await checkedAddress(url, t);
    const res = await t.request(url, ip, signal);
    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      if (hop >= LIMITS.maxRedirects) throw new BlockedError("too many redirects");
      url = new URL(res.headers.location, url); // re-checked at the top of the loop
      continue;
    }
    if (res.status >= 400) throw Object.assign(new Error(`the site returned HTTP ${res.status}`), { status: res.status });
    return { url: url.href, contentType: (res.headers["content-type"] ?? "").toLowerCase(), body: res.body };
  }
}
