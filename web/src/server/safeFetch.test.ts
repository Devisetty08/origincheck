import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { BlockedError, type Transport, isPublicAddress, safeFetch } from "./safeFetch";

const DNS: Record<string, string[]> = {
  "public.test": ["93.184.216.34"],
  "evil.test": ["169.254.169.254"], // cloud metadata
  "mixed.test": ["93.184.216.34", "10.0.0.5"], // one bad record is enough to block
  "internal.test": ["192.168.1.10"],
};
function transport(routes: Record<string, { status: number; location?: string; body?: string }>): Transport & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    resolve: async (h) => DNS[h] ?? [],
    request: async (url, ip) => {
      calls.push(`${url.href}@${ip}`);
      const r = routes[url.href] ?? { status: 404 };
      return { status: r.status, headers: { location: r.location, "content-type": "text/html" }, body: Buffer.from(r.body ?? "") };
    },
  };
}

describe("isPublicAddress", () => {
  it.each([
    "127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1",
    "255.255.255.255", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1", "::",
  ])("blocks %s", (ip) => expect(isPublicAddress(ip)).toBe(false));
  it.each(["93.184.216.34", "8.8.8.8", "2606:4700:4700::1111"])("allows %s", (ip) => expect(isPublicAddress(ip)).toBe(true));
  it("rejects garbage", () => expect(isPublicAddress("not-an-ip")).toBe(false));
});

describe("safeFetch", () => {
  it("fetches a public page, pinned to the checked address", async () => {
    const t = transport({ "https://public.test/a": { status: 200, body: "<p>hi</p>" } });
    const r = await safeFetch("https://public.test/a", t);
    expect(r.body.toString()).toBe("<p>hi</p>");
    expect(t.calls).toEqual(["https://public.test/a@93.184.216.34"]);
  });
  it.each([
    ["http://127.0.0.1/", "private"], ["http://[::1]/", "private"], ["http://169.254.169.254/latest/meta-data/", "private"],
    ["http://evil.test/", "private"], ["http://mixed.test/", "private"], ["http://localhost:3000/", "internal host"],
    ["http://metadata.google.internal/", "internal host"], ["file:///etc/passwd", "only http"], ["ftp://public.test/", "only http"],
    ["http://user:pw@public.test/", "credentials"], ["http://nowhere.test/", "did not resolve"], ["not a url", "not a valid"],
  ])("blocks %s", async (url, why) => {
    const t = transport({});
    await expect(safeFetch(url, t)).rejects.toThrow(why);
    expect(t.calls).toEqual([]);
  });
  it("blocks a redirect to a private address", async () => {
    const t = transport({ "https://public.test/r": { status: 302, location: "http://internal.test/admin" } });
    await expect(safeFetch("https://public.test/r", t)).rejects.toBeInstanceOf(BlockedError);
    expect(t.calls).toEqual(["https://public.test/r@93.184.216.34"]);
  });
  it("blocks a redirect to a literal loopback IP", async () => {
    const t = transport({ "https://public.test/r": { status: 301, location: "http://127.0.0.1:8080/" } });
    await expect(safeFetch("https://public.test/r", t)).rejects.toThrow("private");
  });
  it("follows safe redirects up to the limit", async () => {
    const t = transport({
      "https://public.test/1": { status: 302, location: "/2" }, "https://public.test/2": { status: 302, location: "/3" },
      "https://public.test/3": { status: 200, body: "done" },
    });
    expect((await safeFetch("https://public.test/1", t)).url).toBe("https://public.test/3");
    const loop = transport({ "https://public.test/x": { status: 302, location: "/x" } });
    await expect(safeFetch("https://public.test/x", loop)).rejects.toThrow("too many redirects");
  });
});
