// Find a book or paper: the right sources per search type, free downloads only from legal sources, matching text from
// inside books, and a lending-only Internet Archive scan is never downloaded.
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const CSV = `Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves
3300,Text,2002-06-01,An Inquiry into the Nature and Causes of the Wealth of Nations,en,"Smith, Adam, 1723-1790",,,
1342,Text,1998-06-01,Pride and Prejudice,en,"Austen, Jane, 1775-1817",,,`;

function serve(routes: [RegExp, unknown, number?][]) {
  const seen: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    seen.push(url);
    const hit = routes.find(([re]) => re.test(url));
    if (!hit) return new Response("not found", { status: 404 });
    return new Response(typeof hit[1] === "string" ? hit[1] : JSON.stringify(hit[1]), { status: hit[2] ?? 200 });
  }));
  return seen;
}
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });

describe("find a book or paper", () => {
  it("searches every source, lists free downloads first, then matching text, then details, and reports each source", async () => {
    serve([
      [/openlibrary\.org\/search\.json/, { docs: [
        { key: "/works/OL1W", title: "The Wealth of Nations Explained", author_name: ["Jo Writer"], first_publish_year: 2019, isbn: ["9781234567897"], ebook_access: "borrowable" },
        { key: "/works/OL2W", title: "The Wealth of Nations", author_name: ["Adam Smith"], first_publish_year: 1776, ebook_access: "public", ia: ["wealthscan"] },
        { key: "/works/OL3W", title: "Gardening for Beginners", author_name: ["Sam Green"] }] }],
      [/openlibrary\.org\/search\/inside/, { hits: { hits: [{ _id: "insidebook|1", fields: { identifier: ["insidebook"], meta_title: ["Lectures on Wealth"], meta_creator: ["A. Lecturer"] },
        highlight: { text: ["the {{{wealth of nations}}} is the annual produce"] } }] } }],
      [/api\.openalex\.org/, { results: [{ id: "W1", display_name: "Wealth of Nations: an open edition", type: "book", publication_year: 2021, doi: "https://doi.org/10.5334/w",
        authorships: [{ author: { display_name: "Ana Lima" } }], best_oa_location: { pdf_url: "https://press.example/w.pdf", landing_page_url: "https://press.example/w" },
        abstract_inverted_index: { An: [0], open: [1], edition: [2] } }] }],
      [/pg_catalog\.csv/, CSV],
      [/googleapis\.com/, "quota", 429],
    ]);
    const { find } = await import("./finder");
    const r = await find("wealth of nations", "any");
    expect(r.results.map((f) => [f.title, f.access])).toEqual([
      ["The Wealth of Nations", "free"],
      ["An Inquiry into the Nature and Causes of the Wealth of Nations", "free"],
      ["Wealth of Nations: an open edition", "free"],
      ["Lectures on Wealth", "snippet"],
      ["The Wealth of Nations Explained", "details"],
    ]); // "Gardening for Beginners" doesn't match the search words and is dropped
    const pg = r.results[1];
    expect(pg.downloads.map((d) => d.url)).toEqual(["https://www.gutenberg.org/ebooks/3300.epub3.images", "https://www.gutenberg.org/ebooks/3300.txt.utf-8"]);
    expect(r.results[0]).toMatchObject({ get: "ia:wealthscan", downloads: [{ url: "https://archive.org/download/wealthscan" }] });
    expect(r.results[2]).toMatchObject({ get: "pdf:https://press.example/w.pdf", snippet: "An open edition" });
    expect(r.results[3].snippet).toBe("the wealth of nations is the annual produce");
    expect(r.results[4].downloads).toEqual([]); // in copyright: never a download
    expect(r.sources.find((s) => s.label === "Google Books")).toMatchObject({ status: "failed", note: expect.stringMatching(/Google Books API key/) });
  });
  it("recognises a DOI, an ISBN and a citation, and finds a free copy of a cited paper through Unpaywall", async () => {
    vi.stubEnv("UNPAYWALL_EMAIL", "me@example.org");
    const seen = serve([
      [/api\.crossref\.org\/works\?rows/, { message: { items: [{ DOI: "10.1038/171737a0", type: "journal-article", title: ["Molecular structure of nucleic acids"], author: [{ family: "Watson", given: "J. D." }], issued: { "date-parts": [[1953]] } }] } }],
      [/api\.unpaywall\.org/, { best_oa_location: { url_for_pdf: "https://repo.example/watson.pdf", url: "https://repo.example/watson" } }],
      [/googleapis\.com/, { items: [] }],
    ]);
    const { detectMode, find } = await import("./finder");
    expect(detectMode("10.1038/171737a0")).toBe("doi");
    expect(detectMode("978-0-13-468599-1")).toBe("isbn");
    expect(detectMode("Watson, J. D. and Crick, F. (1953) Molecular structure of nucleic acids. Nature, 171, 737–738.")).toBe("citation");
    const r = await find("Watson, J. D. and Crick, F. (1953) Molecular structure of nucleic acids. Nature, 171, 737–738.", "any");
    expect(r.mode).toBe("citation");
    expect(r.results[0]).toMatchObject({ title: "Molecular structure of nucleic acids", access: "free", downloads: [{ label: "PDF", url: "https://repo.example/watson.pdf" }], kind: "Journal article", source: "Crossref (open access)" });
    expect(seen.some((u) => u.includes("query.bibliographic="))).toBe(true);
  });
});

describe("the text of a free book", () => {
  it("downloads a public-domain scan, and refuses a lending-only one", async () => {
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
