// Every adapter against mocked API responses: success, empty, server error, rate limit and timeout.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../safeFetch", () => ({
  safeFetch: async (url: string) => ({ url, contentType: "text/html", body: Buffer.from(`<html><head><title>Page</title></head><body><article><p>${"Full page text about photosynthesis. ".repeat(20)}</p></article></body></html>`) }),
}));

type Adapters = typeof import("./index");
let A: Adapters;

beforeAll(async () => {
  vi.stubEnv("BRAVE_API_KEY", "brave-test");
  vi.stubEnv("JINA_API_KEY", "jina-test");
  vi.stubEnv("GOOGLE_API_KEY", "g-test");
  vi.stubEnv("GOOGLE_CSE_ID", "cx-test");
  vi.stubEnv("UNPAYWALL_EMAIL", "real@uni.edu");
  vi.stubEnv("CORE_API_KEY", "core-test");
  vi.stubEnv("GOOGLE_BOOKS_API_KEY", "books-test");
  A = await import("./index");
});
afterEach(() => vi.unstubAllGlobals());

const json = (b: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json", ...headers } });
const text = (b: string) => new Response(b, { status: 200 });

// Minimal fixtures in each API's real response shape (verified against the live APIs).
const FIX: Record<string, { ok: (url: string) => Response; empty: () => Response; expect: Record<string, unknown> }> = {
  wikipedia: {
    ok: (u) => u.includes("list=search")
      ? json({ query: { search: [{ title: "Photosynthesis", snippet: 'light <span class="searchmatch">energy</span>' }] } })
      : json({ query: { pages: [{ title: "Photosynthesis", fullurl: "https://en.wikipedia.org/wiki/Photosynthesis", extract: "Photosynthesis is a process." }] } }),
    empty: () => json({ query: { search: [] } }),
    expect: { title: "Photosynthesis", snippet: "light energy", url: "https://en.wikipedia.org/wiki/Photosynthesis", text: "Photosynthesis is a process." },
  },
  crossref: {
    ok: () => json({ message: { items: [{ DOI: "10.1/x", title: ["A paper"], author: [{ given: "Ada", family: "Lovelace" }], issued: { "date-parts": [[2020, 1]] }, URL: "https://doi.org/10.1/x", abstract: "<jats:p>The abstract.</jats:p>" }] } }),
    empty: () => json({ message: { items: [] } }),
    expect: { title: "A paper", doi: "10.1/x", authors: ["Ada Lovelace"], year: 2020, text: "The abstract." },
  },
  openalex: {
    ok: () => json({ results: [{ display_name: "Work", doi: "https://doi.org/10.2/y", publication_year: 2015, abstract_inverted_index: { light: [0], harvesting: [1] }, authorships: [{ author: { display_name: "N. Nelson" } }], best_oa_location: { pdf_url: "https://oa/x.pdf" } }] }),
    empty: () => json({ results: [] }),
    expect: { title: "Work", doi: "10.2/y", year: 2015, text: "light harvesting", oaUrl: "https://oa/x.pdf", authors: ["N. Nelson"] },
  },
  semanticscholar: {
    ok: () => json({ data: [{ title: "S2 paper", abstract: "Abstract.", authors: [{ name: "B" }], year: 2019, externalIds: { DOI: "10.3/z" }, url: "https://s2/p", openAccessPdf: { url: "https://s2/p.pdf" } }] }),
    empty: () => json({ total: 0 }),
    expect: { title: "S2 paper", doi: "10.3/z", year: 2019, oaUrl: "https://s2/p.pdf" },
  },
  arxiv: {
    ok: () => text(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2012.11864v2</id><published>2020-12-22T07:19:19Z</published><title>Coherent light
  harvesting</title><summary> The summary  text. </summary><author><name>S. Tomasi</name></author><author><name>D. Rouse</name></author><link href="http://arxiv.org/pdf/2012.11864v2" title="pdf"/></entry></feed>`),
    empty: () => text(`<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>none</title></feed>`),
    expect: { title: "Coherent light harvesting", year: 2020, text: "The summary text.", authors: ["S. Tomasi", "D. Rouse"], oaUrl: "http://arxiv.org/pdf/2012.11864v2" },
  },
  core: {
    ok: () => json({ results: [{ title: "CORE work", abstract: "Abs.", fullText: "Full text body.", authors: [{ name: "C" }], yearPublished: 2000, doi: "10.4/w", downloadUrl: "https://core/dl.pdf", links: [{ type: "display", url: "https://core.ac.uk/works/1" }] }] }),
    empty: () => json({ results: [] }),
    expect: { title: "CORE work", text: "Full text body.", url: "https://core.ac.uk/works/1", year: 2000 },
  },
  datacite: {
    ok: () => json({ data: [{ id: "10.25432/thesis", type: "dois", attributes: { doi: "10.25432/thesis", publicationYear: 2021, titles: [{ title: "A thesis" }],
      descriptions: [{ descriptionType: "Other", description: "Note" }, { descriptionType: "Abstract", description: "Thesis <i>abstract</i>." }], creators: [{ name: "Negretto, Vittore" }] } }] }),
    empty: () => json({ data: [], meta: { total: 0 } }),
    expect: { title: "A thesis", doi: "10.25432/thesis", url: "https://doi.org/10.25432/thesis", year: 2021, text: "Thesis abstract.", authors: ["Negretto, Vittore"] },
  },
  pubmed: {
    ok: (u) => u.includes("esearch") ? json({ esearchresult: { idlist: ["42901363"] } }) : text(`<?xml version="1.0" ?><PubmedArticleSet><PubmedArticle><MedlineCitation Status="Publisher" Owner="NLM">
      <PMID Version="1">42901363</PMID><Article><Journal><JournalIssue><PubDate><Year>2026</Year></PubDate></JournalIssue></Journal>
      <ArticleTitle>CRISPR <i>in</i> plants.</ArticleTitle><ELocationID EIdType="pii">S1</ELocationID><ELocationID EIdType="doi" ValidYN="Y">10.6/crispr</ELocationID>
      <Abstract><AbstractText Label="BACKGROUND">First part.</AbstractText><AbstractText Label="RESULTS">Second part.</AbstractText></Abstract>
      <AuthorList><Author><LastName>Doudna</LastName><ForeName>Jennifer</ForeName></Author><Author><CollectiveName>CRISPR Group</CollectiveName></Author></AuthorList>
      </Article></MedlineCitation></PubmedArticle></PubmedArticleSet>`),
    empty: () => json({ esearchresult: { idlist: [] } }),
    expect: { title: "CRISPR in plants.", doi: "10.6/crispr", year: 2026, text: "First part. Second part.", authors: ["Jennifer Doudna", "CRISPR Group"], url: "https://pubmed.ncbi.nlm.nih.gov/42901363/" },
  },
  osf: {
    ok: () => json({ data: [{ "@id": "https://osf.io/uf3cn", title: [{ "@value": "Ego depletion" }], description: [{ "@value": "Preprint abstract." }],
      creator: [{ name: [{ "@value": "Roy Baumeister" }] }], dateCreated: [{ "@value": "2019-09-04" }], identifier: [{ "@value": "https://doi.org/10.31234/osf.io/uf3cn" }, { "@value": "https://osf.io/uf3cn" }] }] }),
    empty: () => json({ data: [] }),
    expect: { title: "Ego depletion", url: "https://osf.io/uf3cn", doi: "10.31234/osf.io/uf3cn", year: 2019, text: "Preprint abstract.", authors: ["Roy Baumeister"] },
  },
  inspire: {
    ok: () => json({ hits: { hits: [{ metadata: { control_number: 3184278, titles: [{ title: "Dark matter deficient galaxies" }], abstracts: [{ value: "Physics abstract." }],
      authors: [{ full_name: "Doe, J." }], dois: [{ value: "10.7/hep" }], publication_info: [{ year: 2026 }] } }] } }),
    empty: () => json({ hits: { hits: [] } }),
    expect: { title: "Dark matter deficient galaxies", url: "https://inspirehep.net/literature/3184278", doi: "10.7/hep", year: 2026, text: "Physics abstract.", authors: ["Doe, J."] },
  },
  googlebooks: {
    ok: () => json({ items: [{ id: "abc", volumeInfo: { title: "Pride and Prejudice", authors: ["Jane Austen"], publishedDate: "1813", infoLink: "https://books.google.com/books?id=abc" },
      searchInfo: { textSnippet: "It is a <b>truth universally acknowledged</b>, that a single man&#39;s fortune" } }] }),
    empty: () => json({ totalItems: 0 }),
    expect: { title: "Pride and Prejudice", authors: ["Jane Austen"], year: 1813, text: "It is a truth universally acknowledged, that a single man's fortune" },
  },
  poetrydb: {
    ok: () => json([{ title: "Because I could not stop for Death", author: "Emily Dickinson", lines: ["Because I could not stop for Death,", "He kindly stopped for me;"] }]),
    empty: () => json({ status: 404, reason: "Not found" }),
    expect: { title: "Because I could not stop for Death", authors: ["Emily Dickinson"], text: "Because I could not stop for Death,\nHe kindly stopped for me;" },
  },
  europepmc: {
    ok: () => json({ resultList: { result: [{ title: "PMC <i>title</i>", abstractText: "<b>Abs</b> text", doi: "10.5/v", authorString: "Vatkar AJ, Kale S.", pubYear: "2025" }] } }),
    empty: () => json({ resultList: { result: [] } }),
    expect: { title: "PMC title", text: "Abs text", authors: ["Vatkar AJ", "Kale S"], year: 2025, url: "https://doi.org/10.5/v" },
  },
  openlibrary: {
    ok: () => json({ hits: { hits: [{ _id: "computertype|abc", fields: { identifier: ["computertype"], meta_title: ["Computer type"], meta_creator: ["Rogondino, Michael"] }, highlight: { text: ["{{{It  was the best}}} of times"] } }] } }),
    empty: () => json({ hits: { hits: [] } }),
    expect: { title: "Computer type", url: "https://archive.org/details/computertype", text: "It was the best of times", authors: ["Rogondino, Michael"] },
  },
  gutendex: { // Project Gutenberg: the official catalogue CSV, then the book's text
    ok: (u) => u.includes("pg_catalog.csv")
      ? text('Text#,Type,Issued,Title,Language,Authors,Subjects,LoCC,Bookshelves\n1228,Text,1999-12-01,"Light, Harvesting\nand Energy",en,"Darwin, Charles",,,\n5,Sound,2000-01-01,Light harvesting energy,en,X,,,\n')
      : text("Book text."),
    empty: () => json({ results: [] }),
    expect: { title: "Light, Harvesting and Energy", url: "https://www.gutenberg.org/ebooks/1228", text: "Book text.", authors: ["Darwin, Charles"] },
  },
  brave: {
    ok: () => json({ web: { results: [{ title: "<b>Page</b>", url: "https://example.org/p", description: "desc", extra_snippets: ["more"] }] } }),
    empty: () => json({ web: { results: [] } }),
    expect: { title: "Page", url: "https://example.org/p", snippet: "desc … more" },
  },
  jina: {
    ok: () => json({ data: [{ title: "J", url: "https://j/p", content: "Jina page content." }] }),
    empty: () => json({ data: [] }),
    expect: { title: "J", text: "Jina page content." },
  },
  google: {
    ok: () => json({ items: [{ title: "G", link: "https://g/p", snippet: "g snip" }] }),
    empty: () => json({}),
    expect: { title: "G", url: "https://g/p", snippet: "g snip" },
  },
};

const signal = () => AbortSignal.timeout(2000);

describe.each(Object.keys(FIX))("%s adapter", (id) => {
  const adapter = () => A.ADAPTERS.find((a) => a.id === id)!;
  const f = FIX[id];
  it("parses a successful response into the normalized shape", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string, init?: RequestInit) => { calls.push(u); expect(new Headers(init?.headers).get("user-agent")).toMatch(/origincheck/); return f.ok(u); }));
    const [r] = await adapter().search("light harvesting energy", { signal: signal() });
    expect(r).toMatchObject({ ...f.expect, source: id });
    expect(calls.length).toBeGreaterThan(0);
  });
  it("returns [] when nothing matches", async () => { // (Gutenberg also returns [] without a request when the query has no distinctive words)
    vi.stubGlobal("fetch", vi.fn(async () => f.empty()));
    expect(await adapter().search("zzqx", { signal: signal() })).toEqual([]);
  });
  it("throws an HttpError on a server error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ error: "x" }, 500)));
    await expect(adapter().search("light harvesting energy", { signal: signal() })).rejects.toMatchObject({ status: 500 });
  });
  it("surfaces 429 with Retry-After", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 429, { "retry-after": "2" })));
    await expect(adapter().search("light harvesting energy", { signal: signal() })).rejects.toMatchObject({ status: 429, retryAfterMs: 2000 });
  });
  it("aborts on timeout", async () => {
    vi.stubGlobal("fetch", vi.fn((_u: string, init: RequestInit) => new Promise((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason)))));
    await expect(adapter().search("light harvesting energy", { signal: AbortSignal.timeout(30) })).rejects.toMatchObject({ name: "TimeoutError" });
  });
});

describe("keys and selection", () => {
  it("sends keys only in headers or the documented parameter", async () => {
    const seen: { url: string; headers: Headers }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string, init?: RequestInit) => { seen.push({ url: u, headers: new Headers(init?.headers) }); return FIX.brave.ok(u); }));
    await A.ADAPTERS.find((a) => a.id === "brave")!.search("q", { signal: signal() });
    expect(seen[0].headers.get("x-subscription-token")).toBe("brave-test");
    expect(seen[0].url).not.toContain("brave-test");
  });
  it("treats CORE as not configured without its (free) key", () => {
    const core = A.ADAPTERS.find((a) => a.id === "core")!;
    expect(core.missing()).toBeNull();
    vi.stubEnv("CORE_API_KEY", "");
    expect(core.missing()).toMatch(/CORE_API_KEY/);
    vi.stubEnv("CORE_API_KEY", "core-test");
  });
  it("adds Korean Wikipedia only for Hangul text", () => {
    expect(A.pick(["web"], false).map((a) => a.id)).not.toContain("wikipedia-ko");
    expect(A.pick(["web"], true).map((a) => a.id)).toEqual(expect.arrayContaining(["wikipedia", "wikipedia-ko"]));
    expect(A.pick(["books"], false).map((a) => a.id)).toEqual(["openlibrary", "googlebooks"]);
  });
  it("Unpaywall adds open-access links by DOI only", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (u: string) => { urls.push(u); return json({ best_oa_location: { url_for_pdf: "https://oa.pdf" } }); }));
    const rs = [{ title: "a", snippet: "", authors: [], source: "crossref" as const, doi: "10.1/x" }, { title: "b", snippet: "", authors: [], source: "brave" as const }];
    await A.addOpenAccess(rs, signal());
    expect(rs[0]).toMatchObject({ oaUrl: "https://oa.pdf" });
    expect(urls).toEqual(["https://api.unpaywall.org/v2/10.1%2Fx?email=real%40uni.edu"]);
  });
});
