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
  id: "core", label: "CORE", group: "refs",
  // keyless requests used to work but are refused (429/500) as of Oct 2026; the key is free
  missing: () => (config.coreKey ? null : "needs a free CORE_API_KEY (core.ac.uk/services/api)"),
  minIntervalMs: 1000,
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

/** DataCite: DOIs for theses, dissertations, datasets and reports that Crossref doesn't hold, with their abstracts. */
export const datacite: Adapter = {
  id: "datacite", label: "DataCite (theses & datasets)", group: "refs", missing: () => null, minIntervalMs: 200,
  async search(query, { signal }) {
    type D = { id: string; attributes: { doi?: string; url?: string; publicationYear?: number; titles?: { title: string }[];
      descriptions?: { description?: string; descriptionType?: string }[]; creators?: { name?: string }[] } };
    const j = await getJson<{ data: D[] }>(`https://api.datacite.org/dois?query=${enc(`"${query}"`)}&page%5Bsize%5D=3&fields%5Bdois%5D=doi,url,publicationYear,titles,descriptions,creators`, { signal });
    return j.data.map(({ id, attributes: a }): NormalizedResult => {
      const abs = stripTags((a.descriptions?.find((d) => d.descriptionType === "Abstract") ?? a.descriptions?.[0])?.description);
      const doi = a.doi ?? id;
      return { title: a.titles?.[0]?.title ?? doi, snippet: snip(abs), doi, url: `https://doi.org/${doi}`, year: a.publicationYear,
        authors: (a.creators ?? []).map((c) => c.name ?? "").filter(Boolean), source: "datacite", text: abs || undefined };
    });
  },
};

/** Text of an XML node that may be a string, an object with "#text", or a list of either (inline markup splits text). */
const xmlText = (x: unknown): string =>
  x == null ? "" : typeof x === "string" || typeof x === "number" ? String(x) : Array.isArray(x) ? x.map(xmlText).join(" ")
    : typeof x === "object" ? Object.entries(x as Record<string, unknown>).filter(([k]) => !/^[A-Z][a-z]+$|^Label$|^NlmCategory$/.test(k) || k === "#text").map(([, v]) => xmlText(v)).join(" ") : "";

// titles and abstracts can contain inline markup (<i>, <sup>…); keep them as raw text so word order survives
const pubmedXml = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "", stopNodes: ["*.ArticleTitle", "*.AbstractText"] });

/** PubMed (NCBI E-utilities): search, then fetch the abstracts. NCBI allows 3 requests a second without a key. */
export const pubmed: Adapter = {
  id: "pubmed", label: "PubMed", group: "refs", missing: () => null, minIntervalMs: 700, // two requests per search
  async search(query, { signal }) {
    const who = `&tool=origincheck${config.contactEmail ? `&email=${enc(config.contactEmail)}` : ""}`;
    const ids = (await getJson<{ esearchresult?: { idlist?: string[] } }>(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${enc(`"${query}"`)}&retmax=3&retmode=json${who}`, { signal })).esearchresult?.idlist ?? [];
    if (!ids.length) return [];
    const doc = pubmedXml.parse(await getText(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids.join(",")}&retmode=xml${who}`, { signal }));
    const arts = [doc.PubmedArticleSet?.PubmedArticle ?? []].flat() as { MedlineCitation: { PMID: unknown; Article: Record<string, unknown> } }[];
    return arts.map(({ MedlineCitation: m }): NormalizedResult => {
      const a = m.Article as { ArticleTitle?: unknown; Abstract?: { AbstractText?: unknown }; AuthorList?: { Author?: unknown };
        Journal?: { JournalIssue?: { PubDate?: { Year?: unknown } } }; ELocationID?: unknown };
      const abs = stripTags(xmlText(a.Abstract?.AbstractText)).replace(/\s+/g, " ").trim();
      const pmid = xmlText(m.PMID).trim();
      const authors = [a.AuthorList?.Author ?? []].flat().map((x) => { const p = x as { ForeName?: string; LastName?: string; CollectiveName?: string }; return p.CollectiveName ?? [p.ForeName, p.LastName].filter(Boolean).join(" "); }).filter(Boolean);
      const doi = [a.ELocationID ?? []].flat().map((e) => e as { EIdType?: string; "#text"?: string }).find((e) => e.EIdType === "doi")?.["#text"];
      const year = Number(xmlText(a.Journal?.JournalIssue?.PubDate?.Year)) || undefined;
      return { title: stripTags(xmlText(a.ArticleTitle)).replace(/\s+/g, " ").trim() || `PubMed ${pmid}`, snippet: snip(abs), doi, url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
        authors, year, source: "pubmed", text: abs || undefined };
    });
  },
};

/** OSF preprints (PsyArXiv, SocArXiv and others) through the SHARE full-text index. */
export const osf: Adapter = {
  id: "osf", label: "OSF Preprints", group: "refs", missing: () => null, minIntervalMs: 300,
  async search(query, { signal }) {
    type V = { "@value"?: string }[] | undefined;
    type C = { "@id": string; title?: V; description?: V; creator?: { name?: V }[]; dateCreated?: V; identifier?: V };
    const j = await getJson<{ data?: C[] }>(`https://share.osf.io/api/v3/index-card-search?cardSearchText=${enc(`"${query}"`)}&cardSearchFilter%5BresourceType%5D=Preprint&page%5Bsize%5D=3&acceptMediatype=application/json`,
      { signal, headers: { Accept: "application/json" } });
    const v = (x: V) => x?.[0]?.["@value"] ?? "";
    return (j.data ?? []).map((c): NormalizedResult => {
      const abs = v(c.description);
      const doi = c.identifier?.map((i) => i["@value"] ?? "").find((i) => i.includes("doi.org/"));
      return { title: v(c.title) || c["@id"], snippet: snip(abs), url: c["@id"], doi: doiOf(doi), authors: (c.creator ?? []).map((p) => v(p.name)).filter(Boolean),
        year: Number(v(c.dateCreated).slice(0, 4)) || undefined, source: "osf", text: abs || undefined };
    });
  },
};

/** INSPIRE-HEP: high-energy physics literature with abstracts. Allows 15 requests per 5 seconds. */
export const inspire: Adapter = {
  id: "inspire", label: "INSPIRE-HEP (physics)", group: "refs", missing: () => null, minIntervalMs: 350,
  async search(query, { signal }) {
    type M = { control_number: number; titles?: { title: string }[]; abstracts?: { value: string }[]; authors?: { full_name: string }[]; dois?: { value: string }[]; publication_info?: { year?: number }[] };
    const j = await getJson<{ hits: { hits: { metadata: M }[] } }>(`https://inspirehep.net/api/literature?q=${enc(`abstracts.value:"${query}"`)}&size=3&fields=control_number,titles,abstracts,authors.full_name,dois,publication_info.year`, { signal });
    return j.hits.hits.map(({ metadata: m }): NormalizedResult => {
      const abs = stripTags(m.abstracts?.[0]?.value);
      return { title: m.titles?.[0]?.title ?? `INSPIRE ${m.control_number}`, snippet: snip(abs), url: `https://inspirehep.net/literature/${m.control_number}`,
        doi: m.dois?.[0]?.value, authors: (m.authors ?? []).slice(0, 20).map((a) => a.full_name), year: m.publication_info?.[0]?.year, source: "inspire", text: abs || undefined };
    });
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
