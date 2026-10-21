// Books: Open Library (full-text search inside scanned books) and Gutendex (Project Gutenberg).
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

/** Gutendex searches titles and authors, not book text, so it is queried with the phrase's most distinctive words. */
export const gutendex: Adapter = {
  id: "gutendex", label: "Project Gutenberg (Gutendex)", group: "lists", missing: () => null, minIntervalMs: 500,
  async search(query, { signal }) {
    const words = query.toLowerCase().match(/[a-z]{5,}/g)?.filter((w) => !STOP.has(w)).sort((a, b) => b.length - a.length).slice(0, 3) ?? [];
    if (!words.length) return [];
    type B = { id: number; title: string; authors: { name: string }[]; formats: Record<string, string>; summaries?: string[] };
    const j = await getJson<{ results: B[] }>(`https://gutendex.com/books/?search=${enc(words.join(" "))}`, { signal, timeoutMs: 12_000 });
    const out: NormalizedResult[] = [];
    for (const b of j.results.slice(0, 1)) { // full text of the best match (books are large: one per query)
      const txtUrl = Object.entries(b.formats).find(([k]) => k.startsWith("text/plain"))?.[1];
      const text = txtUrl ? (await getText(txtUrl, { signal, timeoutMs: 15_000 })).slice(0, 1_500_000) : undefined;
      out.push({
        title: b.title, snippet: b.summaries?.[0]?.slice(0, 300) ?? "", url: `https://www.gutenberg.org/ebooks/${b.id}`,
        authors: b.authors.map((a) => a.name), source: "gutendex", text,
      });
    }
    return out;
  },
};
