// Where to get a book: live loan status from Open Library, e-book price and preview from Google Books, libraries and
// price comparison as links; free options first, and a note when e-book prices can't be shown.
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const serve = (ol: unknown, gb: unknown | null) => vi.stubGlobal("fetch", vi.fn(async (url: string) => {
  if (url.includes("openlibrary.org")) return new Response(JSON.stringify(ol), { status: 200 });
  if (url.includes("googleapis.com")) return gb ? new Response(JSON.stringify(gb), { status: 200 }) : new Response("quota", { status: 429 });
  return new Response("", { status: 404 });
}));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("where to get a book", () => {
  it("lists borrowing (with the waiting list), preview, libraries and paid options with the price", async () => {
    vi.stubEnv("GOOGLE_BOOKS_API_KEY", "gkey");
    serve({ docs: [{ key: "/works/OL1W", ebook_access: "borrowable", availability: { available_to_borrow: false, available_to_waitlist: true, num_waitlist: 3 } }] },
      { items: [{ volumeInfo: { previewLink: "https://books.google.com/p", infoLink: "https://books.google.com/i" }, accessInfo: { viewability: "PARTIAL" },
        saleInfo: { saleability: "FOR_SALE", buyLink: "https://play.google.com/b", retailPrice: { amount: 499, currencyCode: "INR" } } }] });
    const { whereToGet } = await import("./availability");
    const r = await whereToGet({ title: "Database Design for Mere Mortals", isbn: "9780321884497", country: "IN" });
    expect(r.offers.map((o) => [o.access, o.site, o.price ?? ""])).toEqual([
      ["borrow", "Open Library", ""], ["preview", "Google Books", ""], ["library", "WorldCat", ""], ["paid", "Google Play Books", "₹499.00"], ["paid", "BookFinder", ""]]);
    expect(r.offers[0].note).toMatch(/every copy is on loan.*3 waiting/);
    expect(r.offers[2].url).toBe("https://search.worldcat.org/search?q=bn:9780321884497");
    expect(r.note).toBeUndefined();
    const gbUrl = (fetch as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0]).find((u) => u.includes("googleapis"))!;
    expect(gbUrl).toContain("country=IN");
    expect(gbUrl).toContain("key=gkey");
  });
  it("says when a book is free, and how to see prices when Google Books can't answer", async () => {
    serve({ docs: [{ key: "/works/OL2W", ebook_access: "public", availability: { is_readable: true, identifier: "wealthofnations" } }] }, null);
    const { whereToGet } = await import("./availability");
    const r = await whereToGet({ title: "The Wealth of Nations" });
    expect(r.offers[0]).toMatchObject({ access: "free", url: "https://archive.org/details/wealthofnations" });
    expect(r.note).toMatch(/Google Books API key/);
  });
  it("marks print-disabled-only books as restricted", async () => {
    serve({ docs: [{ key: "/works/OL3W", ebook_access: "printdisabled", availability: { is_printdisabled: true } }] }, { items: [] });
    const { whereToGet } = await import("./availability");
    expect((await whereToGet({ title: "Some Book" })).offers.at(-1)).toMatchObject({ access: "restricted", site: "Open Library" });
  });
});
