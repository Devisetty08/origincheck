import "server-only";
import { config } from "../config";
import { getJson } from "../http";
import { googlebooks, gutendex, openlibrary, poetrydb } from "./books";
import { arxiv, core, crossref, datacite, europepmc, inspire, openalex, osf, pubmed, semanticScholar } from "./scholarly";
import type { Adapter, NormalizedResult, SourceId } from "./types";
import { brave, google, jina } from "./web";
import { wikipedia } from "./wikipedia";

export const ADAPTERS: Adapter[] = [
  wikipedia("en"), wikipedia("ko"), crossref, openalex, semanticScholar, arxiv, core, europepmc, pubmed, datacite, osf, inspire,
  openlibrary, googlebooks, gutendex, poetrydb, brave, jina, google,
];

export const GROUPS = { refs: "References & DOIs", web: "Search the web", books: "Books (Open Library)", lists: "Free book lists" } as const;
export type Group = keyof typeof GROUPS;

export function sourceStatus() {
  return ADAPTERS.map((a) => ({ id: a.id, label: a.label, group: a.group, missing: a.missing() }));
}

/** Adapters for the enabled groups. English Wikipedia always runs; Korean Wikipedia joins it for text containing Hangul. */
export function pick(groups: Group[], korean: boolean): Adapter[] {
  return ADAPTERS.filter((a) => groups.includes(a.group as Group) && (a.id !== "wikipedia-ko" || korean));
}

/** Unpaywall: DOI lookup only (it has no text search). Adds open-access links to results that have a DOI. */
export async function addOpenAccess(results: NormalizedResult[], signal: AbortSignal, max = 10) {
  if (!config.unpaywallEmail) return;
  const todo = results.filter((r) => r.doi && !r.oaUrl).slice(0, max);
  await Promise.all(todo.map(async (r) => {
    try {
      const j = await getJson<{ best_oa_location?: { url_for_pdf?: string; url?: string } }>(
        `https://api.unpaywall.org/v2/${encodeURIComponent(r.doi!)}?email=${encodeURIComponent(config.unpaywallEmail!)}`, { signal, timeoutMs: 6000 });
      r.oaUrl = j.best_oa_location?.url_for_pdf ?? j.best_oa_location?.url ?? undefined;
    } catch { /* no OA record */ }
  }));
}

export type { Adapter, NormalizedResult, SourceId };
