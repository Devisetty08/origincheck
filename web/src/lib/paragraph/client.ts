"use client";
// Paragraph check in the browser: the rules run in a Web Worker; sources come from lookups. Keyless APIs that allow it
// (Open Library, Google Books, Wikipedia) are called directly; Crossref, Unpaywall and the source search go through
// origincheck's server routes, which hold the contact email and keys.
import type { SearchHit } from "../checks";
import { pickQueries } from "../queries";
import type { CiteMeta } from "../similarity";
import type { PSource } from "./citations";
import { type Analysis, type Options, analyze } from "./rules";

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (a: Analysis) => void; reject: (e: Error) => void }>();

export function runParagraph(text: string, sources: PSource[], opts: Options): Promise<Analysis> {
  if (typeof Worker === "undefined") return Promise.resolve(analyze(text, sources, opts));
  if (!worker) {
    worker = new Worker(new URL("../../workers/paragraph.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id: number; result?: Analysis; error?: string }>) => {
      const p = pending.get(e.data.id);
      pending.delete(e.data.id);
      if (e.data.error) p?.reject(new Error(e.data.error)); else p?.resolve(e.data.result!);
    };
  }
  const id = ++seq;
  return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); worker!.postMessage({ id, text, sources, opts }); });
}

const today = () => new Date().toISOString().slice(0, 10);
/** "Gilles Darold" → { family: "Darold", given: "Gilles" }; an organisation stays whole. */
export const splitName = (n: string): CiteMeta["authors"][number] => {
  const p = n.trim().split(/\s+/);
  return p.length > 1 && !/\b(inc|ltd|corporation|university|institute|foundation|contributors)\b/i.test(n) ? { family: p[p.length - 1], given: p.slice(0, -1).join(" ") } : { family: n.trim() };
};

/** Crossref metadata for a DOI, with Unpaywall's open-access link when the server knows one. */
export async function fromDoi(doi: string): Promise<{ meta: CiteMeta; oaUrl?: string }> {
  const clean = doi.trim().replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").replace(/^doi:\s*/i, "");
  const r = await fetch(`/api/doi?oa=1&doi=${encodeURIComponent(clean)}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  const { oaUrl, ...meta } = j as CiteMeta & { oaUrl?: string };
  return { meta: { ...meta, accessed: today() }, oaUrl };
}

/** Book details for an ISBN from Open Library, falling back to Google Books. */
export async function fromIsbn(isbn: string): Promise<CiteMeta> {
  const clean = isbn.replace(/[^0-9Xx]/g, "").toUpperCase();
  if (clean.length !== 10 && clean.length !== 13) throw new Error("An ISBN has 10 or 13 digits.");
  try {
    const r = await fetch(`https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`);
    const b = (await r.json())[`ISBN:${clean}`] as { title?: string; authors?: { name: string }[]; publishers?: { name: string }[]; publish_date?: string; url?: string } | undefined;
    if (b?.title) return { authors: (b.authors ?? []).map((a) => splitName(a.name)), title: b.title, publisher: b.publishers?.[0]?.name, year: b.publish_date?.match(/\d{4}/)?.[0] };
  } catch { /* try Google Books */ }
  const r = await fetch(`https://www.googleapis.com/books/v1/volumes?q=isbn:${clean}`);
  const v = (await r.json()).items?.[0]?.volumeInfo as { title?: string; subtitle?: string; authors?: string[]; publisher?: string; publishedDate?: string } | undefined;
  if (!v?.title) throw new Error("No book found for that ISBN.");
  return { authors: (v.authors ?? []).map(splitName), title: v.subtitle ? `${v.title}: ${v.subtitle}` : v.title, publisher: v.publisher, year: v.publishedDate?.slice(0, 4) };
}

/** A Wikipedia article as plain text (MediaWiki Action API). Accepts a URL or a title. */
export async function fromWikipedia(input: string): Promise<{ meta: CiteMeta; text: string }> {
  const m = input.trim().match(/^https?:\/\/([a-z-]+)\.(?:m\.)?wikipedia\.org\/wiki\/([^?#]+)/i);
  const lang = m?.[1] ?? "en", title = m ? decodeURIComponent(m[2]).replace(/_/g, " ") : input.trim();
  const url = `https://${lang}.wikipedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&redirects=1&prop=extracts|info&explaintext=1&inprop=url&titles=${encodeURIComponent(title)}`;
  const r = await fetch(url, { headers: { "Api-User-Agent": "origincheck (https://github.com/Devisetty08/origincheck)" } });
  const page = (await r.json()).query?.pages?.[0] as { title: string; extract?: string; fullurl?: string; touched?: string; missing?: boolean } | undefined;
  if (!page || page.missing || !page.extract) throw new Error("No Wikipedia article with that title.");
  return { meta: { authors: [{ family: "Wikipedia contributors" }], title: page.title, container: "Wikipedia", year: page.touched?.slice(0, 4), url: page.fullurl, accessed: today() }, text: page.extract };
}

/** "Find possible sources": a few distinctive phrases from the paragraph, searched on Wikipedia, Crossref and OpenAlex. */
export async function findPossibleSources(paragraph: string): Promise<SearchHit[]> {
  const queries = pickQueries(paragraph, { max: 4, minWords: 6, skipQuotedAndCited: false });
  if (!queries.length) return [];
  const { postSse } = await import("../sse");
  const hits: SearchHit[] = [];
  await postSse("/api/search", { queries, groups: ["web", "refs"], only: ["wikipedia-en", "crossref", "openalex"] }, (event, data) => {
    if (event === "source") hits.push(...((data as { results?: SearchHit[] }).results ?? []));
  });
  const seen = new Set<string>();
  return hits.filter((h) => { const k = (h.doi || h.url || h.title).toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 6);
}

/** A search hit as a source with citation details. */
export const hitToSource = (h: SearchHit): PSource => ({
  id: `hit-${h.doi ?? h.url ?? h.title}`, title: h.title, text: h.text ?? h.snippet,
  meta: { authors: h.authors.map(splitName), title: h.title, year: h.year ? String(h.year) : undefined, url: h.doi ? undefined : h.url, doi: h.doi, accessed: today(),
    container: /wikipedia/i.test(h.source) ? "Wikipedia" : undefined },
});
