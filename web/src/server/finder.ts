// "Find a book or paper": one search across catalogues, the text inside books, open-access literature and citations.
// Free downloads are offered only where the source itself offers them legally: public-domain books (Project Gutenberg,
// the Internet Archive, full-view Google Books) and open-access books and papers (OpenAlex, Unpaywall). For everything
// else the result shows the matching text the service publishes and a link to read more; nothing is downloaded.
import "server-only";
import { crossrefToMeta } from "@/lib/crossref";
import { gutenbergCatalog } from "./adapters/books";
import { STOP } from "./adapters/stopwords";
import { config } from "./config";
import { getJson, stripTags } from "./http";

export type Mode = "any" | "title" | "author" | "keywords" | "citation" | "isbn" | "doi";
export interface Download { label: string; url: string }
export interface Found {
  key: string; title: string; authors: string[]; year?: string; kind: string; source: string; isbn?: string; doi?: string;
  /** Matching text from inside the book or paper, as the service publishes it. */
  snippet?: string;
  /** Read online, or the catalogue page. */
  readUrl?: string;
  /** Free, legal downloads offered by the source. */
  downloads: Download[];
  /** How origincheck can load the full text (Read here, Add to My library): ia:ID, gutenberg:ID or pdf:URL. */
  get?: string;
  access: "free" | "snippet" | "details";
}
export interface SourceStatus { label: string; status: "ok" | "none" | "failed"; count: number; note?: string }

const enc = encodeURIComponent;
const DOI = /\b10\.\d{4,9}\/[^\s"<>]+[^\s"<>.,;)\]]/;
const ISBN = /^(?:97[89][-\s]?)?(?:\d[-\s]?){9}[\dXx]$/;
const words = (q: string) => q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter((w) => !STOP.has(w)) ?? [];
const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) =>
  Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${what} took too long`)), ms))]);

/** Plain text of an OpenAlex abstract (stored as an inverted index). */
const abstract = (inv?: Record<string, number[]> | null) => {
  if (!inv) return undefined;
  const at: string[] = [];
  for (const [w, ps] of Object.entries(inv)) for (const p of ps) at[p] = w;
  return at.filter(Boolean).slice(0, 80).join(" ") || undefined;
};

/* ------------------------------ sources ------------------------------ */

async function openLibrary(q: string, mode: Mode): Promise<Found[]> {
  const param = mode === "title" ? `title=${enc(q)}` : mode === "author" ? `author=${enc(q)}` : mode === "isbn" ? `q=${enc(`isbn:${q.replace(/[^0-9X]/gi, "")}`)}` : `q=${enc(q)}`;
  type D = { key: string; title: string; author_name?: string[]; first_publish_year?: number; isbn?: string[]; ia?: string[]; ebook_access?: string };
  const j = await getJson<{ docs?: D[] }>(`https://openlibrary.org/search.json?${param}&limit=10&fields=key,title,author_name,first_publish_year,isbn,ia,ebook_access`, { timeoutMs: 12_000 });
  return (j.docs ?? []).map((d): Found => {
    const ia = d.ebook_access === "public" ? d.ia?.[0] : undefined;
    return { key: `ol:${d.key}`, title: d.title, authors: d.author_name ?? [], year: d.first_publish_year ? String(d.first_publish_year) : undefined, kind: "Book",
      source: ia ? "Internet Archive (public domain)" : "Open Library", isbn: d.isbn?.find((i) => i.length === 13) ?? d.isbn?.[0],
      readUrl: ia ? `https://archive.org/details/${ia}` : `https://openlibrary.org${d.key}`,
      downloads: ia ? [{ label: "PDF, EPUB and text", url: `https://archive.org/download/${ia}` }] : [], get: ia ? `ia:${ia}` : undefined, access: ia ? "free" : "details" };
  });
}

/** Words or a phrase inside the text of scanned books (Open Library "search inside"). */
async function insideBooks(q: string): Promise<Found[]> {
  type H = { fields?: { identifier?: string[]; meta_title?: string[]; meta_creator?: string[]; meta_year?: string[] }; highlight?: { text?: string[] }; _id: string };
  const j = await getJson<{ hits?: { hits?: H[] } }>(`https://openlibrary.org/search/inside.json?q=${enc(q)}`, { timeoutMs: 15_000 });
  return (j.hits?.hits ?? []).slice(0, 8).map((h): Found => {
    const id = h.fields?.identifier?.[0] ?? h._id.split("|")[0];
    const snippet = (h.highlight?.text ?? []).slice(0, 2).map((t) => t.replace(/\{\{\{|\}\}\}/g, "").replace(/-\n(\w)/g, "$1").replace(/\s+/g, " ").trim()).join(" … ");
    return { key: `inside:${id}`, title: h.fields?.meta_title?.[0] ?? id, authors: h.fields?.meta_creator ?? [], year: h.fields?.meta_year?.[0], kind: "Book",
      source: "Inside books (Open Library)", snippet, readUrl: `https://archive.org/details/${id}?q=${enc(q)}`, downloads: [], access: "snippet" };
  });
}

async function gutenberg(q: string, mode: Mode): Promise<Found[]> {
  const want = words(q);
  if (!want.length) return [];
  const books = await withTimeout(gutenbergCatalog(), 15_000, "Project Gutenberg's catalogue (loading once a day)");
  return books.filter((b) => { const hay = mode === "author" ? b.authors.toLowerCase() : mode === "title" ? b.title.toLowerCase() : b.hay; return want.every((w) => hay.includes(w)); })
    .slice(0, 5).map((b): Found => ({
      key: `pg:${b.id}`, title: b.title, authors: b.authors ? [b.authors] : [], kind: "Book", source: "Project Gutenberg (public domain)",
      readUrl: `https://www.gutenberg.org/ebooks/${b.id}.html.images`, get: `gutenberg:${b.id}`, access: "free",
      downloads: [{ label: "EPUB", url: `https://www.gutenberg.org/ebooks/${b.id}.epub3.images` }, { label: "Plain text", url: `https://www.gutenberg.org/ebooks/${b.id}.txt.utf-8` }],
    }));
}

/** Open-access books and papers (OpenAlex): only works with a free copy, matched by title, full text or anything. */
async function openAlex(q: string, mode: Mode): Promise<Found[]> {
  const mailto = config.openalexMailto ? `&mailto=${enc(config.openalexMailto)}` : "";
  const how = mode === "title" ? `filter=title.search:${enc(q)},is_oa:true` : mode === "keywords" ? `filter=fulltext.search:${enc(q)},is_oa:true` : `search=${enc(q)}&filter=is_oa:true`;
  type W = { id: string; display_name: string; doi?: string; type?: string; publication_year?: number; authorships: { author: { display_name: string } }[];
    best_oa_location?: { pdf_url?: string; landing_page_url?: string }; abstract_inverted_index?: Record<string, number[]> | null };
  const j = await getJson<{ results: W[] }>(`https://api.openalex.org/works?${how}&per_page=8&select=id,display_name,doi,type,publication_year,authorships,best_oa_location,abstract_inverted_index${mailto}`, { timeoutMs: 12_000 });
  return j.results.map((w): Found => {
    const pdf = w.best_oa_location?.pdf_url;
    return { key: `oa:${w.id}`, title: w.display_name, authors: w.authorships.map((a) => a.author.display_name).slice(0, 6), year: w.publication_year ? String(w.publication_year) : undefined,
      kind: (w.type ?? "work").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), source: "Open access (OpenAlex)", doi: w.doi?.replace("https://doi.org/", ""),
      snippet: abstract(w.abstract_inverted_index), readUrl: w.best_oa_location?.landing_page_url ?? w.doi,
      downloads: pdf ? [{ label: "PDF", url: pdf }] : [], get: pdf ? `pdf:${pdf}` : undefined, access: pdf ? "free" : "details" };
  });
}

/** A citation or DOI: Crossref finds the work; Unpaywall finds a free, legal copy when there is one. */
async function citation(q: string, mode: Mode): Promise<Found[]> {
  const mailto = config.crossrefMailto ? `&mailto=${enc(config.crossrefMailto)}` : "";
  const doi = q.match(DOI)?.[0];
  type I = Record<string, unknown> & { DOI: string; type?: string; ISBN?: string[]; abstract?: string };
  const items: I[] = doi && mode !== "citation"
    ? [(await getJson<{ message: I }>(`https://api.crossref.org/works/${enc(doi)}?${mailto.slice(1)}`, { timeoutMs: 12_000 })).message]
    : (await getJson<{ message: { items?: I[] } }>(`https://api.crossref.org/works?rows=5&query.bibliographic=${enc(q.slice(0, 300))}${mailto}`, { timeoutMs: 12_000 })).message.items ?? [];
  return Promise.all(items.map(async (it): Promise<Found> => {
    const m = crossrefToMeta(it);
    let pdf: string | undefined, page: string | undefined;
    if (config.unpaywallEmail)
      try {
        const u = await getJson<{ best_oa_location?: { url_for_pdf?: string; url?: string } }>(`https://api.unpaywall.org/v2/${enc(it.DOI)}?email=${enc(config.unpaywallEmail)}`, { timeoutMs: 8000 });
        pdf = u.best_oa_location?.url_for_pdf; page = u.best_oa_location?.url;
      } catch { /* no free copy known */ }
    if (!pdf) // OpenAlex knows open-access copies too, and needs no key or email
      try {
        const w = await getJson<{ best_oa_location?: { pdf_url?: string; landing_page_url?: string } | null }>(
          `https://api.openalex.org/works/doi:${enc(it.DOI)}?select=best_oa_location${config.openalexMailto ? `&mailto=${enc(config.openalexMailto)}` : ""}`, { timeoutMs: 8000 });
        pdf = w.best_oa_location?.pdf_url; page ??= w.best_oa_location?.landing_page_url;
      } catch { /* not in OpenAlex */ }
    return { key: `doi:${it.DOI.toLowerCase()}`, title: m.title, authors: m.authors.map((a) => [a.given, a.family].filter(Boolean).join(" ")), year: m.year,
      kind: (it.type ?? "work").replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), source: pdf || page ? "Crossref (open access)" : "Crossref",
      doi: it.DOI, isbn: it.ISBN?.[0], snippet: it.abstract ? stripTags(it.abstract).slice(0, 500) : undefined, readUrl: page ?? `https://doi.org/${it.DOI}`,
      downloads: pdf ? [{ label: "PDF", url: pdf }] : [], get: pdf ? `pdf:${pdf}` : undefined, access: pdf ? "free" : "details" };
  }));
}

/** Google Books: matching snippets from inside books, previews, and free full-view (public-domain) downloads. */
async function googleBooks(q: string, mode: Mode): Promise<Found[]> {
  const term = mode === "title" ? `intitle:${q}` : mode === "author" ? `inauthor:${q}` : mode === "isbn" ? `isbn:${q.replace(/[^0-9X]/gi, "")}` : q;
  const key = config.googleBooksKey ? `&key=${enc(config.googleBooksKey)}` : "";
  type V = { id: string; volumeInfo: { title?: string; authors?: string[]; publishedDate?: string; previewLink?: string; infoLink?: string; industryIdentifiers?: { type: string; identifier: string }[] };
    searchInfo?: { textSnippet?: string }; accessInfo?: { viewability?: string; webReaderLink?: string; epub?: { downloadLink?: string }; pdf?: { downloadLink?: string } } };
  const j = await getJson<{ items?: V[] }>(`https://www.googleapis.com/books/v1/volumes?q=${enc(term)}&maxResults=8${key}`, { timeoutMs: 12_000 });
  return (j.items ?? []).map((v): Found => {
    const a = v.accessInfo ?? {}, full = a.viewability === "ALL_PAGES";
    const downloads = full ? [a.pdf?.downloadLink && { label: "PDF", url: a.pdf.downloadLink }, a.epub?.downloadLink && { label: "EPUB", url: a.epub.downloadLink }].filter(Boolean) as Download[] : [];
    const snippet = v.searchInfo?.textSnippet ? stripTags(v.searchInfo.textSnippet) : undefined;
    return { key: `gb:${v.id}`, title: v.volumeInfo.title ?? "Untitled", authors: v.volumeInfo.authors ?? [], year: v.volumeInfo.publishedDate?.slice(0, 4), kind: "Book",
      source: full ? "Google Books (full view)" : "Google Books", isbn: v.volumeInfo.industryIdentifiers?.find((i) => i.type === "ISBN_13")?.identifier,
      snippet, readUrl: full ? a.webReaderLink ?? v.volumeInfo.previewLink : v.volumeInfo.previewLink ?? v.volumeInfo.infoLink,
      downloads, access: full ? "free" : snippet ? "snippet" : "details" };
  });
}

/* ------------------------------ the search ------------------------------ */

const SOURCES: Record<string, { label: string; run: (q: string, m: Mode) => Promise<Found[]> }> = {
  openlibrary: { label: "Open Library and the Internet Archive", run: openLibrary },
  inside: { label: "Text inside books (Open Library)", run: (q) => insideBooks(q) },
  gutenberg: { label: "Project Gutenberg", run: gutenberg },
  openalex: { label: "Open-access books and papers (OpenAlex)", run: openAlex },
  crossref: { label: "Citations (Crossref and Unpaywall)", run: citation },
  google: { label: "Google Books", run: googleBooks },
};
const PLAN: Record<Mode, string[]> = {
  any: ["openlibrary", "inside", "gutenberg", "openalex", "google"],
  title: ["openlibrary", "gutenberg", "openalex", "google"],
  author: ["openlibrary", "gutenberg", "google"],
  keywords: ["inside", "openalex", "google"],
  citation: ["crossref", "google"],
  isbn: ["openlibrary", "google"],
  doi: ["crossref"],
};

/** What kind of search a free-text query is: a DOI, an ISBN, a citation, or anything. */
export function detectMode(q: string): Mode {
  if (DOI.test(q)) return "doi";
  if (ISBN.test(q.trim())) return "isbn";
  if (q.length > 60 && /\(?(1[5-9]|20)\d\d\)?/.test(q) && /[.,]/.test(q)) return "citation";
  return "any";
}

export async function find(q: string, asked: Mode): Promise<{ mode: Mode; results: Found[]; sources: SourceStatus[] }> {
  const mode = asked === "any" ? detectMode(q) : asked;
  const plan = PLAN[mode];
  const settled = await Promise.allSettled(plan.map((id) => withTimeout(SOURCES[id].run(q, mode), 20_000, SOURCES[id].label)));
  const sources: SourceStatus[] = [];
  let all: Found[] = [];
  settled.forEach((s, i) => {
    const label = SOURCES[plan[i]].label;
    if (s.status === "fulfilled") { sources.push({ label, status: s.value.length ? "ok" : "none", count: s.value.length }); all.push(...s.value); }
    else {
      const msg = (s.reason as Error).message;
      sources.push({ label, status: "failed", count: 0,
        note: plan[i] === "google" && !config.googleBooksKey ? "needs a free Google Books API key (Settings)" : /429/.test(msg) ? "busy right now; try again shortly" : msg });
    }
  });
  // catalogue matches must contain the search words; text matches and citations are already ranked by the service
  const want = words(q);
  if (want.length && (mode === "any" || mode === "title" || mode === "author"))
    all = all.filter((f) => f.access === "snippet" || f.key.startsWith("doi:") || want.filter((w) => `${f.title} ${f.authors.join(" ")}`.toLowerCase().includes(w)).length / want.length >= 0.5);
  const seen = new Set<string>();
  all = all.filter((f) => { const k = f.doi?.toLowerCase() ?? `${f.title.toLowerCase().replace(/\W+/g, "")}|${(f.authors[0] ?? "").toLowerCase().split(/\s+/).pop()}|${f.access}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const rank = { free: 0, snippet: 1, details: 2 } as const;
  return { mode, results: all.sort((a, b) => rank[a.access] - rank[b.access]).slice(0, 40), sources };
}
