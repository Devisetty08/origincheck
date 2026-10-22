// Books: Open Library (full-text search inside scanned books) and Project Gutenberg.
import "server-only";
import { config } from "../config";
import { getJson, getText, stripTags } from "../http";
import type { Adapter, NormalizedResult } from "./types";
import { STOP } from "./stopwords";

const enc = encodeURIComponent;

/**
 * Open Library. `search.json` only returns book metadata, which can't show matching wording, so this uses the
 * Open Library full-text search ("search inside", /search/inside.json) and returns the matching passages as text.
 */
export const openlibrary: Adapter = {
  id: "openlibrary", label: "Open Library", group: "books", missing: () => null, minIntervalMs: 300,
  async search(query, { signal }) {
    type H = { _id: string; fields?: { identifier?: string[]; meta_title?: string[]; meta_creator?: string[]; meta_publisher?: string[] }; highlight?: { text?: string[] } };
    const j = await getJson<{ hits?: { hits?: H[] } }>(`https://openlibrary.org/search/inside.json?q=${enc(`"${query}"`)}`, { signal, timeoutMs: 12_000 });
    return (j.hits?.hits ?? []).slice(0, 3).map((h): NormalizedResult => {
      const id = h.fields?.identifier?.[0] ?? h._id.split("|")[0];
      const passages = (h.highlight?.text ?? []).map((t) => t.replace(/\{\{\{|\}\}\}/g, "").replace(/-\n(\w)/g, "$1").replace(/\s+/g, " ").trim());
      const creator = h.fields?.meta_creator?.[0];
      return {
        title: h.fields?.meta_title?.[0] ?? id, snippet: passages[0] ?? "", url: `https://archive.org/details/${id}`,
        authors: creator ? [creator] : [], source: "openlibrary", text: passages.join("\n\n") || undefined,
      };
    });
  },
};

/** Google Books: search inside books by exact phrase; the matching snippet is returned. Needs a (free) API key. */
export const googlebooks: Adapter = {
  id: "googlebooks", label: "Google Books", group: "books", minIntervalMs: 200,
  missing: () => (config.googleBooksKey ? null : "needs a free GOOGLE_BOOKS_API_KEY (Google Cloud console, Books API)"),
  async search(query, { signal }) {
    type V = { id: string; volumeInfo: { title?: string; authors?: string[]; publishedDate?: string; infoLink?: string }; searchInfo?: { textSnippet?: string } };
    const j = await getJson<{ items?: V[] }>(`https://www.googleapis.com/books/v1/volumes?q=${enc(`"${query}"`)}&maxResults=3&key=${enc(config.googleBooksKey!)}`, { signal });
    return (j.items ?? []).map(({ id, volumeInfo: v, searchInfo }): NormalizedResult => {
      const snippet = stripTags(searchInfo?.textSnippet).replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
      return { title: v.title ?? id, snippet, url: v.infoLink ?? `https://books.google.com/books?id=${id}`, authors: v.authors ?? [],
        year: Number(v.publishedDate?.slice(0, 4)) || undefined, source: "googlebooks", text: snippet || undefined };
    });
  },
};

/** PoetryDB: poems searched by a run of words within one line, so a short part of the phrase is sent. */
export const poetrydb: Adapter = {
  id: "poetrydb", label: "PoetryDB (poems)", group: "lists", missing: () => null, minIntervalMs: 200,
  async search(query, { signal }) {
    const words = query.split(/\s+/);
    if (words.length < 3) return [];
    const part = words.slice(0, 4).join(" "); // a poem line is short: three or four words rarely span a line break
    type P = { title: string; author: string; lines: string[] };
    let j: P[] | { status: number };
    try { j = await getJson<P[] | { status: number }>(`https://poetrydb.org/lines/${enc(part)}/title,author,lines`, { signal }); }
    catch (e) { if ((e as { status?: number }).status === 404) return []; throw e; }
    if (!Array.isArray(j)) return []; // PoetryDB answers 200 {"status":404} when nothing matches
    return j.slice(0, 3).map((p): NormalizedResult => ({
      title: p.title, snippet: p.lines.slice(0, 2).join(" / "), url: `https://poetrydb.org/title/${enc(p.title)}`, authors: [p.author], source: "poetrydb", text: p.lines.join("\n"),
    }));
  },
};

/** Minimal RFC 4180 CSV reader (quoted fields may contain commas, quotes and line breaks). */
export function* csvRows(s: string): Generator<string[]> {
  let row: string[] = [], f = "", q = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c !== '"') f += c; else if (s[i + 1] === '"') { f += '"'; i++; } else q = false; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(f); f = ""; }
    else if (c === "\n") { row.push(f.replace(/\r$/, "")); yield row; row = []; f = ""; }
    else f += c;
  }
  if (f || row.length) { row.push(f); yield row; }
}

type Book = { id: number; title: string; authors: string; hay: string };
const CATALOG = "https://www.gutenberg.org/cache/epub/feeds/pg_catalog.csv";
let catalog: { at: number; books: Promise<Book[]> } | null = null;

/** Project Gutenberg's official catalogue (≈20 MB CSV, published for programs to use), loaded once a day per server. */
export function gutenbergCatalog() {
  if (!catalog || Date.now() - catalog.at > 24 * 3600_000) {
    const books = getText(CATALOG, { timeoutMs: 40_000 }).then((csv) => {
      const out: Book[] = [];
      for (const [id, type, , title, , authors] of csvRows(csv))
        if (type === "Text" && /^\d+$/.test(id)) out.push({ id: Number(id), title: title.replace(/\s+/g, " "), authors, hay: `${title} ${authors}`.toLowerCase() });
      return out;
    });
    catalog = { at: Date.now(), books };
    books.catch(() => { catalog = null; }); // a failed download is retried next time
  }
  return catalog.books;
}
const abortable = <T,>(p: Promise<T>, s: AbortSignal) => new Promise<T>((res, rej) => {
  if (s.aborted) return rej(s.reason);
  s.addEventListener("abort", () => rej(s.reason), { once: true });
  p.then(res, rej);
});

/**
 * Project Gutenberg. Its catalogue covers titles and authors, not book text, so a phrase's most distinctive words are
 * matched against it and the best book's full text is compared. (Gutendex, the API in the spec, stopped answering
 * searches in under 2 minutes in Oct 2026, while lookups by id still took 0.4 s; the official catalogue replaces its search.)
 */
export const gutendex: Adapter = {
  id: "gutendex", label: "Project Gutenberg", group: "lists", missing: () => null, minIntervalMs: 500,
  timeoutMs: 45_000, maxQueries: 3, // the first search waits for the catalogue (~17 s); each hit downloads one whole book
  async search(query, { signal }) {
    const words = query.toLowerCase().match(/[a-z]{5,}/g)?.filter((w) => !STOP.has(w)).sort((a, b) => b.length - a.length).slice(0, 3) ?? [];
    if (!words.length) return [];
    const need = Math.min(2, words.length);
    let best: Book | undefined, bestScore = 0;
    for (const b of await abortable(gutenbergCatalog(), signal)) {
      const score = words.filter((w) => b.hay.includes(w)).length;
      if (score >= need && score > bestScore) { best = b; bestScore = score; }
    }
    if (!best) return [];
    const text = (await getText(`https://www.gutenberg.org/cache/epub/${best.id}/pg${best.id}.txt`, { signal, timeoutMs: 15_000 })).slice(0, 1_500_000);
    return [{ title: best.title, snippet: "", url: `https://www.gutenberg.org/ebooks/${best.id}`, authors: best.authors ? [best.authors] : [], source: "gutendex", text }];
  },
};
