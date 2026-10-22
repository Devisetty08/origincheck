// Book search for My library: free full texts first, copyrighted books only as "find a copy" results, and a
// lending-only Internet Archive scan is never downloaded.
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const CSV = `Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves
3300,Text,2002-06-01,An Inquiry into the Nature and Causes of the Wealth of Nations,en,"Smith, Adam, 1723-1790",,,
1342,Text,1998-06-01,Pride and Prejudice,en,"Austen, Jane, 1775-1817",,,`;

function serve(routes: [RegExp, unknown][]) {
  const seen: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    seen.push(url);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(typeof hit[1] === "string" ? hit[1] : JSON.stringify(hit[1]), { status: 200 });
  }));
  return seen;
}
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("book search", () => {
  it("ranks by match, lists free full texts first, gives the rest where to find a copy, and drops unrelated books", async () => {
    serve([
      [/openlibrary\.org\/search\.json/, { docs: [
        { title: "The Wealth of Nations Explained", author_name: ["Jo Writer"], first_publish_year: 2019, isbn: ["1234567890", "9781234567897"], ebook_access: "borrowable", ia: ["explained"], key: "/works/OL1W" },
        { title: "The Wealth of Nations", author_name: ["Adam Smith"], first_publish_year: 1776, ebook_access: "public", ia: ["inquiryintonatur00smit_4"], key: "/works/OL2W" }] }],
      [/api\.openalex\.org/, { results: [
        { display_name: "Open Data Book", publication_year: 2020, authorships: [], best_oa_location: { pdf_url: "https://press.example/x.pdf" } },
        { display_name: "Wealth of Nations: an open edition", publication_year: 2021, doi: "https://doi.org/10.5334/w", authorships: [{ author: { display_name: "Ana Lima" } }],
          best_oa_location: { pdf_url: "https://press.example/w.pdf", landing_page_url: "https://press.example/w" } }] }],
      [/pg_catalog\.csv/, CSV],
    ]);
    const { searchBooks } = await import("./books");
    const hits = await searchBooks("wealth of nations");
    expect(hits.map((h) => [h.title, h.get ?? ""])).toEqual([
      ["Wealth of Nations: an open edition", "pdf:https://press.example/w.pdf"],
      ["An Inquiry into the Nature and Causes of the Wealth of Nations", "gutenberg:3300"],
      ["The Wealth of Nations", "ia:inquiryintonatur00smit_4"],
      ["The Wealth of Nations Explained", ""],
    ]);
    expect(hits[3]).toMatchObject({ isbn: "9781234567897", note: expect.stringMatching(/borrow it from Open Library/) });
  });
  it("downloads the text of a public-domain scan, and refuses a lending-only one", async () => {
    const seen = serve([
      [/metadata\/freebook/, { metadata: {}, files: [{ name: "a.pdf" }, { name: "freebook_djvu.txt" }] }],
      [/download\/freebook\/freebook_djvu\.txt/, "THE WEALTH OF NATIONS ..."],
      [/metadata\/lendingbook/, { metadata: { "access-restricted-item": "true" }, files: [{ name: "lendingbook_djvu.txt" }] }],
    ]);
    const { bookText } = await import("./books");
    expect(await bookText("ia:freebook")).toBe("THE WEALTH OF NATIONS ...");
    await expect(bookText("ia:lendingbook")).rejects.toThrow(/lending-only/);
    expect(seen.some((u) => u.includes("download/lendingbook"))).toBe(false);
    await expect(bookText("ia:../etc")).rejects.toThrow(/Unknown book/);
  });
});
