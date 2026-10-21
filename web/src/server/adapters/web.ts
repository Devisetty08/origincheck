// Web search: Tavily (default, free plan without a card), Brave (optional, metered), Jina, and Google Programmable
// Search (existing customers only; never scraped).
import "server-only";
import { config } from "../config";
import { getJson } from "../http";
import { readable } from "../readable";
import { safeFetch } from "../safeFetch";
import type { Adapter, NormalizedResult } from "./types";

const enc = encodeURIComponent;

/** Readable text of a result page, through the SSRF-safe fetcher. Snippets alone rarely contain a whole copied passage. */
async function pageText(url: string) {
  try {
    const r = await safeFetch(url);
    if (!/html|xml/.test(r.contentType)) return undefined;
    return readable(r.body.toString("utf8"), r.url).text.slice(0, 200_000) || undefined;
  } catch { return undefined; }
}

/**
 * Tavily: the default web search. Free plan: 1,000 credits a month, no card; requests stop (not billed) when credits
 * run out. A basic search costs 1 credit. `include_raw_content` returns the page text, so no second fetch is needed.
 * Note: Tavily's terms let it keep and use the queries it receives; only short phrases are ever sent.
 */
export const tavily: Adapter = {
  id: "tavily", label: "Tavily (web search)", group: "web",
  missing: () => (config.tavilyKey ? null : "needs TAVILY_API_KEY (free plan, no card)"),
  minIntervalMs: 300, metered: "tavily", cost: 1,
  async search(query, { signal }) {
    type R = { results?: { title: string; url: string; content?: string; raw_content?: string | null }[] };
    const j = await getJson<R>("https://api.tavily.com/search", { signal, headers: { Authorization: `Bearer ${config.tavilyKey}`, "Content-Type": "application/json" },
      init: { method: "POST", body: JSON.stringify({ query: `"${query}"`, search_depth: "basic", max_results: 3, include_raw_content: "text" }) } });
    return (j.results ?? []).map((h): NormalizedResult => ({
      title: h.title || h.url, snippet: h.content ?? "", url: h.url, authors: [], source: "tavily", text: h.raw_content?.slice(0, 200_000) || h.content || undefined,
    }));
  },
};

/**
 * Brave Search. Off unless BRAVE_API_KEY is set: a card is required and use beyond the monthly free credit is billed,
 * so every call spends from BRAVE_MONTHLY_QUERY_CAP first. Brave's terms forbid storing Search Results beyond transient
 * use, so its results are never cached.
 */
export const brave: Adapter = {
  id: "brave", label: "Brave Search", group: "web",
  missing: () => (config.braveKey ? null : "needs BRAVE_API_KEY"),
  minIntervalMs: 1100, // stays inside the lowest plan's per-second limit
  metered: "brave", cost: 1, noCache: true,
  async search(query, { signal }) {
    type R = { web?: { results?: { title: string; url: string; description?: string; extra_snippets?: string[]; age?: string }[] } };
    const j = await getJson<R>(`https://api.search.brave.com/res/v1/web/search?q=${enc(`"${query}"`)}&count=3&extra_snippets=true`,
      { signal, headers: { "X-Subscription-Token": config.braveKey! } });
    const hits = j.web?.results ?? [];
    return Promise.all(hits.map(async (h, i): Promise<NormalizedResult> => {
      const snippet = [h.description, ...(h.extra_snippets ?? [])].filter(Boolean).join(" … ").replace(/<[^>]+>/g, "");
      return { title: h.title.replace(/<[^>]+>/g, ""), snippet, url: h.url, authors: [], source: "brave",
        text: (i === 0 ? await pageText(h.url) : undefined) ?? snippet };
    }));
  },
};

export const jina: Adapter = {
  id: "jina", label: "Jina Search", group: "web",
  missing: () => (config.jinaKey ? null : "needs JINA_API_KEY"),
  minIntervalMs: 700,
  async search(query, { signal }) {
    type R = { data?: { title?: string; url?: string; description?: string; content?: string }[] };
    const j = await getJson<R>(`https://s.jina.ai/?q=${enc(`"${query}"`)}`, { signal, timeoutMs: 20_000, headers: { Authorization: `Bearer ${config.jinaKey}` } });
    return (j.data ?? []).slice(0, 3).map((d) => ({
      title: d.title ?? d.url ?? "Untitled", snippet: d.description ?? (d.content ?? "").slice(0, 300), url: d.url, authors: [],
      source: "jina" as const, text: d.content?.slice(0, 200_000) || undefined,
    }));
  },
};

export const google: Adapter = {
  id: "google", label: "Google Programmable Search", group: "web",
  missing: () => (config.googleKey && config.googleCx ? null : "needs GOOGLE_API_KEY and GOOGLE_CSE_ID (closed to new customers; ends 2027-01-01)"),
  minIntervalMs: 200,
  async search(query, { signal }) {
    type R = { items?: { title: string; link: string; snippet?: string }[] };
    const j = await getJson<R>(`https://www.googleapis.com/customsearch/v1?key=${enc(config.googleKey!)}&cx=${enc(config.googleCx!)}&num=3&q=${enc(`"${query}"`)}`, { signal });
    return Promise.all((j.items ?? []).map(async (h, i): Promise<NormalizedResult> => ({
      title: h.title, snippet: h.snippet ?? "", url: h.link, authors: [], source: "google",
      text: (i === 0 ? await pageText(h.link) : undefined) ?? h.snippet,
    })));
  },
};
