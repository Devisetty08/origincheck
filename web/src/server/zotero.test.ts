// Zotero import: the key goes in a header, items get citation details and the attachment with indexed full text,
// and the route refuses to run on a hosted deployment (it would expose the owner's library).
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

async function route(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import("@/app/api/zotero/route")).GET;
}
// from the computer running origincheck, or from a phone on the same Wi-Fi
const req = (q: string) => new Request(`http://localhost:3100/api/zotero?${q}`, { headers: { "x-forwarded-for": "127.0.0.1" } });
const fromPhone = (q: string) => new Request(`http://192.168.0.133:3100/api/zotero?${q}`, { headers: { "x-forwarded-for": "192.168.0.57" } });
const KEYS = { ZOTERO_USER_ID: "42", ZOTERO_API_KEY: "zkey" };

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/api/zotero", () => {
  it("lists items with citation details and the attachment Zotero has full text for", async () => {
    const seen: { url: string; key: string | null }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      seen.push({ url, key: new Headers(init.headers).get("zotero-api-key") });
      const body = url.includes("/items/top") ? [
        { key: "BOOK0001", data: { key: "BOOK0001", itemType: "book", title: "Moving Databases", date: "2021", publisher: "Open Press", ISBN: "9780134685991",
          creators: [{ creatorType: "author", firstName: "Asha", lastName: "Rao" }] } },
        { key: "NOTE0001", data: { key: "NOTE0001", itemType: "note" } },
      ] : url.includes("itemType=attachment") ? [{ key: "PDF00001", data: { key: "PDF00001", itemType: "attachment", parentItem: "BOOK0001" } }]
        : url.includes("/fulltext?since") ? { PDF00001: 3 } : { content: "Plan the schema first." };
      return new Response(JSON.stringify(body), { status: 200 });
    }));
    const GET = await route(KEYS);
    const j = await (await GET(req("q=databases"))).json();
    expect(j.items).toEqual([{ key: "BOOK0001", itemType: "book", textKey: "PDF00001",
      meta: expect.objectContaining({ title: "Moving Databases", year: "2021", isbn: "9780134685991", authors: [{ family: "Rao", given: "Asha" }] }) }]);
    expect(seen.every((s) => s.key === "zkey" && s.url.startsWith("https://api.zotero.org/users/42/"))).toBe(true);
    expect(seen.find((s) => s.url.includes("/items/top"))!.url).toContain("q=databases");
    expect(await (await GET(req("text=PDF00001"))).json()).toEqual({ text: "Plan the schema first." });
  });
  it("needs the user ID and key, and is refused on a hosted deployment", async () => {
    vi.stubGlobal("fetch", vi.fn());
    expect((await (await route({}))(req("q="))).status).toBe(503);
    const r = await (await route({ ...KEYS, VERCEL: "1" }))(req("q="));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/own computer/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("refuses other devices on the network: the library is the computer owner's", async () => {
    vi.stubGlobal("fetch", vi.fn());
    const r = await (await route(KEYS))(fromPhone("q="));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/only works on the computer running origincheck/);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("reports a rejected key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("Forbidden", { status: 403 })));
    const r = await (await route(KEYS))(req("q="));
    expect(r.status).toBe(502);
    expect((await r.json()).error).toMatch(/rejected the key/);
  });
});
