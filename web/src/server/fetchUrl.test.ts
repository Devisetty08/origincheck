// "Web page" import: a dead or refused page falls back to its latest Internet Archive copy; blocked addresses never do.
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const PAGE = `<html><head><title>Archived</title></head><body><article><p>${"An old page about photosynthesis and light. ".repeat(10)}</p></article></body></html>`;
const fetched: string[] = [];
let live: "ok" | "404" | "blocked" = "404";

vi.mock("@/server/safeFetch", async () => {
  class BlockedError extends Error {}
  return {
    BlockedError,
    safeFetch: async (url: string) => {
      fetched.push(url);
      if (url.startsWith("https://web.archive.org/web/2id_/")) return { url: "https://web.archive.org/web/20200101000000id_/https://gone.example/a", contentType: "text/html", body: Buffer.from(PAGE) };
      if (live === "blocked") throw new BlockedError("that address points to a private or reserved network");
      if (live === "404") throw Object.assign(new Error("the site returned HTTP 404"), { status: 404 });
      return { url, contentType: "text/html", body: Buffer.from(PAGE.replace("Archived", "Live")) };
    },
  };
});
const { POST } = await import("@/app/api/fetch-url/route");
const call = (url: string) => POST(new Request("http://localhost/api/fetch-url", { method: "POST", body: JSON.stringify({ url }), headers: { "x-forwarded-for": String(Math.random()) } }));

beforeEach(() => { fetched.length = 0; });

describe("/api/fetch-url", () => {
  it("returns the live page when it works", async () => {
    live = "ok";
    const j = await (await call("https://site.example/a")).json();
    expect(j).toMatchObject({ kind: "html", title: "Live" });
    expect(j.archived).toBeUndefined();
    expect(fetched).toEqual(["https://site.example/a"]);
  });
  it("falls back to the Wayback Machine for a dead page", async () => {
    live = "404";
    const j = await (await call("https://gone.example/a")).json();
    expect(j).toMatchObject({ kind: "html", title: "Archived", url: "https://gone.example/a" });
    expect(j.archived).toContain("web.archive.org");
    expect(fetched).toEqual(["https://gone.example/a", "https://web.archive.org/web/2id_/https://gone.example/a"]);
  });
  it("never asks the archive about a blocked (private) address", async () => {
    live = "blocked";
    const r = await call("http://10.0.0.1/admin");
    expect(r.status).toBe(400);
    expect(fetched).toEqual(["http://10.0.0.1/admin"]);
  });
});
