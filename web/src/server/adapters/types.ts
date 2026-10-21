export type SourceId =
  | "wikipedia" | "wikipedia-ko" | "crossref" | "openalex" | "semanticscholar" | "arxiv" | "core" | "europepmc"
  | "openlibrary" | "gutendex" | "brave" | "jina" | "google"
  | "datacite" | "pubmed" | "osf" | "inspire" | "googlebooks" | "poetrydb";

/** One search hit, the same shape for every source. `text` is the fuller passage used for matching, when the API gives one. */
export interface NormalizedResult {
  title: string;
  snippet: string;
  url?: string;
  doi?: string;
  authors: string[];
  year?: number;
  source: SourceId;
  text?: string;
  oaUrl?: string; // open-access copy (Unpaywall / OpenAlex)
}

export interface Adapter {
  id: SourceId;
  label: string;
  /** Which "Sources to compare against" input this belongs to. */
  group: "refs" | "web" | "books" | "lists";
  /** null when usable; otherwise why it's skipped (e.g. "needs BRAVE_API_KEY"). */
  missing(): string | null;
  /** Minimum gap between this source's requests, from its published rate guidance. */
  minIntervalMs: number;
  /** For slow services: time allowed per request (default 8 s) and how many of the run's phrases to search (default all). */
  timeoutMs?: number;
  maxQueries?: number;
  search(query: string, ctx: { signal: AbortSignal }): Promise<NormalizedResult[]>;
}

export type Status = "success" | "no results" | "failed" | "rate-limited" | "not configured";

export interface SourceEvent {
  source: SourceId;
  label: string;
  status: Status;
  ms: number;
  queries: number;
  results: NormalizedResult[];
  error?: string;
}
