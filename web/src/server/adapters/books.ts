// Books: Open Library (full-text search inside scanned books) and Project Gutenberg.
import "server-only";
import { getJson, getText } from "../http";
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
function gutenbergCatalog() {
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
