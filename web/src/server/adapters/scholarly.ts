// Scholarly sources: Crossref, OpenAlex, Semantic Scholar, arXiv, CORE, Europe PMC.
import "server-only";
import { XMLParser } from "fast-xml-parser";
import { config } from "../config";
import { getJson, getText, stripTags } from "../http";
import type { Adapter, NormalizedResult } from "./types";

const enc = encodeURIComponent;
const doiOf = (s?: string | null) => s?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") || undefined;
const snip = (t = "", n = 300) => (t.length > n ? t.slice(0, n).replace(/\s\S*$/, "") + " …" : t);

export const crossref: Adapter = {
  id: "crossref", label: "Crossref", group: "refs", missing: () => null, minIntervalMs: 100,
  async search(query, { signal }) {
    const mailto = config.crossrefMailto ? `&mailto=${enc(config.crossrefMailto)}` : "";
    type R = { message: { items: { DOI: string; title?: string[]; author?: { given?: string; family?: string; name?: string }[]; issued?: { "date-parts"?: number[][] }; URL?: string; abstract?: string; "container-title"?: string[] }[] } };
    const j = await getJson<R>(`https://api.crossref.org/works?query.bibliographic=${enc(query)}&rows=3&select=DOI,title,author,issued,URL,abstract,container-title${mailto}`, { signal });
    return j.message.items.map((i): NormalizedResult => {
      const abs = stripTags(i.abstract);
      return {
        title: i.title?.[0] ?? i.DOI, snippet: snip(abs || (i["container-title"]?.[0] ?? "")), doi: i.DOI, url: i.URL,
        authors: (i.author ?? []).map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(" ")).filter(Boolean),
        year: i.issued?.["date-parts"]?.[0]?.[0], source: "crossref", text: abs || undefined,
      };
    });
  },
};

/** OpenAlex stores abstracts as an inverted index: word → positions. */
export function invertedToText(idx?: Record<string, number[]> | null) {
  if (!idx) return "";
  const words: string[] = [];
  for (const [w, pos] of Object.entries(idx)) for (const p of pos) words[p] = w;
  return words.filter(Boolean).join(" ");
}

export const openalex: Adapter = {
  id: "openalex", label: "OpenAlex", group: "refs", missing: () => null, minIntervalMs: 100,
  async search(query, { signal }) {
    const mailto = config.openalexMailto ? `&mailto=${enc(config.openalexMailto)}` : "";
    type W = { display_name: string; doi?: string; publication_year?: number; abstract_inverted_index?: Record<string, number[]>; authorships: { author: { display_name: string } }[]; primary_location?: { landing_page_url?: string }; best_oa_location?: { pdf_url?: string; landing_page_url?: string } };
    const j = await getJson<{ results: W[] }>(`https://api.openalex.org/works?search=${enc(query)}&per_page=3${mailto}`, { signal });
    return j.results.map((w): NormalizedResult => {
      const abs = invertedToText(w.abstract_inverted_index);
      return {
        title: w.display_name, snippet: snip(abs), doi: doiOf(w.doi), url: w.doi ?? w.primary_location?.landing_page_url ?? undefined,
        authors: w.authorships.map((a) => a.author.display_name), year: w.publication_year, source: "openalex",
        text: abs || undefined, oaUrl: w.best_oa_location?.pdf_url ?? w.best_oa_location?.landing_page_url ?? undefined,
      };
    });
  },
};

export const semanticScholar: Adapter = {
  id: "semanticscholar", label: "Semantic Scholar", group: "refs", missing: () => null,
  minIntervalMs: 1100, // keyless traffic shares a small pool; a key raises the limit
  async search(query, { signal }) {
    type P = { title: string; abstract?: string; authors?: { name: string }[]; year?: number; externalIds?: { DOI?: string }; url?: string; openAccessPdf?: { url?: string } };
    const headers: Record<string, string> = config.semanticScholarKey ? { "x-api-key": config.semanticScholarKey } : {};
    const j = await getJson<{ data?: P[] }>(`https://api.semanticscholar.org/graph/v1/paper/search?query=${enc(query)}&limit=3&fields=title,abstract,authors,year,externalIds,url,openAccessPdf`, { signal, headers });
    return (j.data ?? []).map((p): NormalizedResult => ({
      title: p.title, snippet: snip(p.abstract), doi: p.externalIds?.DOI, url: p.url, authors: (p.authors ?? []).map((a) => a.name),
      year: p.year, source: "semanticscholar", text: p.abstract || undefined, oaUrl: p.openAccessPdf?.url || undefined,
    }));
  },
};

const xml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
export const arxiv: Adapter = {
  id: "arxiv", label: "arXiv", group: "refs", missing: () => null,
  minIntervalMs: 3000, // arXiv asks for no more than one request every 3 seconds
  async search(query, { signal }) {
    const body = await getText(`https://export.arxiv.org/api/query?search_query=${enc(`all:"${query}"`)}&max_results=3`, { signal, timeoutMs: 12_000 });
    const feed = xml.parse(body).feed ?? {};
    const entries = feed.entry ? (Array.isArray(feed.entry) ? feed.entry : [feed.entry]) : [];
    type E = { title: string; summary: string; id: string; published?: string; author?: { name: string } | { name: string }[]; "arxiv:doi"?: string | { "#text": string }; link?: { href: string; title?: string } | { href: string; title?: string }[] };
    return (entries as E[]).map((e): NormalizedResult => {
      const authors = e.author ? (Array.isArray(e.author) ? e.author : [e.author]).map((a) => a.name) : [];
      const links = e.link ? (Array.isArray(e.link) ? e.link : [e.link]) : [];
      const doi = e["arxiv:doi"];
      const summary = String(e.summary ?? "").replace(/\s+/g, " ").trim();
      return {
        title: String(e.title).replace(/\s+/g, " ").trim(), snippet: snip(summary), url: e.id, authors, source: "arxiv", text: summary,
        year: e.published ? Number(e.published.slice(0, 4)) : undefined, doi: typeof doi === "string" ? doi : doi?.["#text"],
        oaUrl: links.find((l) => l.title === "pdf")?.href,
      };
    });
  },
};

export const core: Adapter = {
  id: "core", label: "CORE", group: "refs", missing: () => null,
  minIntervalMs: 1000, // keyless requests are allowed at a low rate; CORE_API_KEY raises it
  async search(query, { signal }) {
    type W = { title?: string; abstract?: string; fullText?: string; authors?: { name: string }[]; yearPublished?: number; doi?: string; downloadUrl?: string; links?: { type: string; url: string }[] };
    const headers: Record<string, string> = config.coreKey ? { Authorization: `Bearer ${config.coreKey}` } : {};
    const j = await getJson<{ results?: W[] }>(`https://api.core.ac.uk/v3/search/works/?q=${enc(`"${query}"`)}&limit=3`, { signal, headers, timeoutMs: 12_000 });
    return (j.results ?? []).map((w): NormalizedResult => ({
      title: w.title ?? "Untitled", snippet: snip(w.abstract ?? w.fullText), doi: doiOf(w.doi), authors: (w.authors ?? []).map((a) => a.name),
      url: w.links?.find((l) => l.type === "display")?.url ?? w.downloadUrl, year: w.yearPublished, source: "core",
      text: (w.fullText || w.abstract)?.slice(0, 300_000) || undefined, oaUrl: w.downloadUrl || undefined,
    }));
  },
};

export const europepmc: Adapter = {
  id: "europepmc", label: "Europe PMC", group: "refs", missing: () => null, minIntervalMs: 100,
  async search(query, { signal }) {
    type R = { title?: string; abstractText?: string; doi?: string; authorString?: string; pubYear?: string; pmcid?: string; id?: string; source?: string; fullTextUrlList?: { fullTextUrl?: { url: string; availabilityCode?: string }[] } };
    const j = await getJson<{ resultList: { result: R[] } }>(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${enc(`"${query}"`)}&format=json&resultType=core&pageSize=3`, { signal });
    return j.resultList.result.map((r): NormalizedResult => {
      const abs = stripTags(r.abstractText);
      return {
        title: stripTags(r.title) || "Untitled", snippet: snip(abs), doi: r.doi, authors: r.authorString ? r.authorString.replace(/\.$/, "").split(/,\s*/) : [],
        year: r.pubYear ? Number(r.pubYear) : undefined, source: "europepmc", text: abs || undefined,
        url: r.doi ? `https://doi.org/${r.doi}` : r.id ? `https://europepmc.org/article/${r.source}/${r.id}` : undefined,
        oaUrl: r.fullTextUrlList?.fullTextUrl?.find((u) => u.availabilityCode === "OA")?.url,
      };
    });
  },
};
