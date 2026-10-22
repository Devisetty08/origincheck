// Book search for My library: which books have a free, legal full text (public-domain scans on the Internet Archive,
// Project Gutenberg, open-access books found through OpenAlex), and where to find a copy of the rest.
// Copyrighted books are never downloaded: for those the user gets links to borrow, buy or find them in a library.
import "server-only";
import { gutenbergCatalog } from "./adapters/books";
import { STOP } from "./adapters/stopwords";
import { config } from "./config";
import { getJson, getText } from "./http";

const enc = encodeURIComponent;

export interface BookHit {
  title: string; authors: string[]; year?: string; isbn?: string; doi?: string; url?: string;
  source: string;
  /** How to get the full text: "ia:ID" (Internet Archive), "gutenberg:ID" or "pdf:URL" (open access). Absent: no free copy. */
  get?: string;
  note: string;
}

const ACCESS: Record<string, string> = {
  borrowable: "In copyright: borrow it from Open Library, or find it in a library.",
  printdisabled: "In copyright: only for print-disabled readers online. Find it in a library.",
  no_ebook: "No e-book: find it in a library or bookshop.",
};

async function openLibrary(q: string): Promise<BookHit[]> {
  type D = { title: string; author_name?: string[]; first_publish_year?: number; isbn?: string[]; ia?: string[]; ebook_access?: string; key: string };
  const j = await getJson<{ docs?: D[] }>(`https://openlibrary.org/search.json?q=${enc(q)}&limit=8&fields=title,author_name,first_publish_year,isbn,ia,ebook_access,key`, { timeoutMs: 12_000 });
  return (j.docs ?? []).map((d) => {
    const free = d.ebook_access === "public" && d.ia?.length;
    return { title: d.title, authors: d.author_name ?? [], year: d.first_publish_year ? String(d.first_publish_year) : undefined, isbn: d.isbn?.find((i) => i.length === 13) ?? d.isbn?.[0],
      url: `https://openlibrary.org${d.key}`, source: free ? "Internet Archive (public domain)" : "Open Library",
      get: free ? `ia:${d.ia![0]}` : undefined, note: free ? "Public domain: the full text comes from the Internet Archive's scan." : ACCESS[d.ebook_access ?? "no_ebook"] ?? ACCESS.no_ebook };
  });
}

async function openAccessBooks(q: string): Promise<BookHit[]> {
  type W = { display_name: string; doi?: string; publication_year?: number; authorships: { author: { display_name: string } }[]; best_oa_location?: { pdf_url?: string; landing_page_url?: string } };
  const mailto = config.openalexMailto ? `&mailto=${enc(config.openalexMailto)}` : "";
  const j = await getJson<{ results: W[] }>(`https://api.openalex.org/works?search=${enc(q)}&filter=type:book,is_oa:true&per_page=5&select=display_name,doi,publication_year,authorships,best_oa_location${mailto}`, { timeoutMs: 12_000 });
  return j.results.map((w) => {
    const pdf = w.best_oa_location?.pdf_url;
    return { title: w.display_name, authors: w.authorships.map((a) => a.author.display_name), year: w.publication_year ? String(w.publication_year) : undefined,
      doi: w.doi?.replace("https://doi.org/", ""), url: w.best_oa_location?.landing_page_url ?? w.doi, source: "Open-access book (OpenAlex)",
      get: pdf ? `pdf:${pdf}` : undefined, note: pdf ? "Open access: the full text comes from the free PDF." : "Open access: read it on the publisher's page." };
  });
}

async function gutenberg(q: string): Promise<BookHit[]> {
  const words = q.toLowerCase().match(/[a-z]{3,}/g)?.filter((w) => !STOP.has(w)) ?? [];
  if (!words.length) return [];
  return (await gutenbergCatalog()).map((b) => ({ b, score: words.filter((w) => b.hay.includes(w)).length })).filter((x) => x.score === words.length)
    .slice(0, 3).map(({ b }) => ({ title: b.title, authors: b.authors ? [b.authors] : [], url: `https://www.gutenberg.org/ebooks/${b.id}`,
      source: "Project Gutenberg", get: `gutenberg:${b.id}`, note: "Public domain: the full text comes from Project Gutenberg." }));
}

/**
 * Books matching a title, author or subject. Ranked by how many of the search words are in the title or author
 * names (weak matches dropped), then free full texts first. A source that fails is skipped.
 */
export async function searchBooks(q: string): Promise<BookHit[]> {
  const parts = await Promise.allSettled([openAccessBooks(q), gutenberg(q), openLibrary(q)]);
  const hits = parts.flatMap((p) => (p.status === "fulfilled" ? p.value : []));
  const want = q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)?.filter((w) => !STOP.has(w)) ?? [];
  const score = (h: BookHit) => { const hay = `${h.title} ${h.authors.join(" ")}`.toLowerCase(); return want.length ? want.filter((w) => hay.includes(w)).length / want.length : 1; };
  return hits.map((h) => ({ h, s: score(h) })).filter((x) => x.s >= 0.5)
    .sort((a, b) => b.s - a.s || Number(!!b.h.get) - Number(!!a.h.get)).map((x) => x.h);
}

export const MAX_BOOK_CHARS = 3_000_000;

/** The full text of a free book: an Internet Archive public-domain scan, or a Project Gutenberg book. */
export async function bookText(get: string): Promise<string> {
  const ia = get.match(/^ia:([\w.-]+)$/), pg = get.match(/^gutenberg:(\d+)$/);
  if (pg) return (await getText(`https://www.gutenberg.org/cache/epub/${pg[1]}/pg${pg[1]}.txt`, { timeoutMs: 30_000 })).slice(0, MAX_BOOK_CHARS);
  if (!ia) throw new Error("Unknown book.");
  type M = { metadata?: Record<string, unknown>; files?: { name: string }[] };
  const m = await getJson<M>(`https://archive.org/metadata/${ia[1]}`, { timeoutMs: 15_000 });
  if (String(m.metadata?.["access-restricted-item"]) === "true") throw new Error("This book is lending-only, so its text can't be downloaded. Borrow it from Open Library instead.");
  const file = m.files?.find((f) => f.name.endsWith("_djvu.txt"));
  if (!file) throw new Error("The Internet Archive has no text for this scan.");
  return (await getText(`https://archive.org/download/${ia[1]}/${enc(file.name)}`, { timeoutMs: 45_000 })).slice(0, MAX_BOOK_CHARS);
}
