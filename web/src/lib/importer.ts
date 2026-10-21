// Source import (Req 7). Only DOIs, reference strings and URLs the user typed are sent out —
// never document text (Req 11.2).
import type { CiteMeta } from "./engine";
import { DOI_RE, htmlToText } from "./extract";

export interface Imported { name: string; text: string; meta?: CiteMeta; url?: string }
export interface ImportOutcome { entry: string; ok: boolean; message: string; source?: Imported; link?: string }
export interface NetOpts { proxy: boolean; email?: string }

const READER = "https://r.jina.ai/";
const today = () => new Date().toISOString().slice(0, 10);

async function getJson(url: string) {
  const r = await fetch(url, { headers: { Accept: "application/json" } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/** Text of a URL: direct fetch first (works when the site allows it), then the opt-in reader service. */
async function fetchText(url: string, opts: NetOpts): Promise<{ text: string; title?: string }> {
  try {
    const r = await fetch(url);
    if (r.ok) {
      const type = r.headers.get("content-type") ?? "";
      if (type.includes("pdf")) {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/pdf.worker.min.mjs`;
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await r.arrayBuffer()) }).promise;
        let text = "";
        for (let p = 1; p <= doc.numPages; p++)
          text += (await (await doc.getPage(p)).getTextContent()).items.map((i) => ("str" in i ? i.str + (i.hasEOL ? "\n" : "") : "")).join("") + "\n\n";
        return { text };
      }
      const ex = htmlToText(await r.text(), true);
      return { text: ex.text, title: ex.meta?.title };
    }
  } catch { /* usually blocked by the site's CORS policy */ }
  if (!opts.proxy) throw new Error("the site blocks in-browser downloads");
  const r = await fetch(READER + url, { headers: { Accept: "text/plain" } });
  if (!r.ok) throw new Error(`reader service returned HTTP ${r.status}`);
  const raw = await r.text();
  const title = raw.match(/^Title:\s*(.+)$/m)?.[1]?.trim();
  const body = raw.split(/^Markdown Content:\s*$/m)[1] ?? raw;
  const text = body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s*/gm, "")
    .replace(/[*_`>]+/g, "")
    .trim();
  return { text, title };
}

export async function importUrl(url: string, opts: NetOpts): Promise<ImportOutcome> {
  try {
    const { text, title } = await fetchText(url, opts);
    if (text.split(/\s+/).length < 30) throw new Error("no readable text found on the page");
    const host = new URL(url).hostname.replace(/^www\./, "");
    const meta: CiteMeta = { authors: [], title: title || host, container: host, url, accessed: today(), year: undefined };
    return { entry: url, ok: true, message: "Added", source: { name: title ? `${title} (${host})` : url, text, meta, url } };
  } catch (e) {
    return { entry: url, ok: false, message: `Couldn't fetch the page: ${(e as Error).message}. Save it from your browser (Ctrl+S) and upload the file instead.`, link: url };
  }
}

export function crossrefToMeta(m: Record<string, unknown>): CiteMeta {
  const get = <T,>(k: string) => m[k] as T | undefined;
  const parts = (get<{ "date-parts": number[][] }>("issued") ?? get<{ "date-parts": number[][] }>("published"))?.["date-parts"]?.[0];
  return {
    authors: (get<{ family?: string; given?: string; name?: string }[]>("author") ?? []).map((a) => ({ family: a.family ?? a.name ?? "", given: a.given })),
    title: (get<string[]>("title") ?? [""])[0].replace(/<[^>]+>/g, ""),
    year: parts?.[0] ? String(parts[0]) : undefined,
    container: (get<string[]>("container-title") ?? [])[0],
    volume: get<string>("volume"),
    issue: get<string>("issue"),
    pages: get<string>("page")?.replace("-", "–"),
    publisher: get<string>("publisher"),
    doi: get<string>("DOI"),
    url: get<string>("URL"),
  };
}

export async function lookupDoi(doi: string): Promise<CiteMeta> {
  const j = await getJson(`https://api.crossref.org/works/${encodeURIComponent(doi)}`);
  return crossrefToMeta(j.message);
}

async function findDoi(reference: string): Promise<string | null> {
  const j = await getJson(`https://api.crossref.org/works?rows=1&query.bibliographic=${encodeURIComponent(reference.slice(0, 300))}`);
  const item = j.message?.items?.[0];
  return item && item.score >= 60 ? item.DOI : null;
}

/** Open-access full text for a DOI: Europe PMC (when it has the article), then OA links from OpenAlex/Unpaywall. */
async function fullText(doi: string, opts: NetOpts): Promise<{ text?: string; link?: string; why: string }> {
  let pmcid: string | undefined, links: string[] = [];
  try {
    const w = await getJson(`https://api.openalex.org/works/https://doi.org/${encodeURIComponent(doi)}`);
    pmcid = w.ids?.pmcid?.split("/").pop();
    links = [w.best_oa_location?.pdf_url, w.best_oa_location?.landing_page_url, w.open_access?.oa_url].filter(Boolean);
  } catch { /* not in OpenAlex */ }
  if (opts.email)
    try {
      const u = await getJson(`https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(opts.email)}`);
      links.unshift(...[u.best_oa_location?.url_for_pdf, u.best_oa_location?.url].filter(Boolean));
    } catch { /* not in Unpaywall */ }

  if (pmcid)
    try {
      const r = await fetch(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`);
      if (r.ok) {
        const x = new DOMParser().parseFromString(await r.text(), "application/xml");
        x.querySelectorAll("ref-list,table-wrap,fig,xref").forEach((e) => e.remove());
        const text = [...x.querySelectorAll("abstract p, body p, body title")].map((p) => p.textContent?.trim()).filter(Boolean).join("\n\n");
        if (text.split(/\s+/).length > 100) return { text, why: "" };
      }
    } catch { /* fall through */ }

  links = [...new Set(links)];
  for (const link of links)
    try {
      const { text } = await fetchText(link, opts);
      if (text.split(/\s+/).length > 100) return { text, link, why: "" };
    } catch { /* try the next link */ }
  return links.length
    ? { link: links[0], why: "An open-access copy exists, but its host blocks in-browser downloads. Download it and add the file." }
    : { why: "No open-access full text found. Add the PDF yourself if you have access." };
}

/** Import a pasted reference list or list of DOIs, one entry per line. */
export async function importReferences(input: string, opts: NetOpts, onProgress?: (done: number, total: number) => void) {
  const entries = input.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 6);
  const out: ImportOutcome[] = [];
  for (const [i, entry] of entries.entries()) {
    onProgress?.(i, entries.length);
    try {
      const doi = entry.match(DOI_RE)?.[0] ?? (await findDoi(entry));
      if (!doi) { out.push({ entry, ok: false, message: "Couldn't identify this reference in Crossref. Add a DOI or upload the file." }); continue; }
      const meta = await lookupDoi(doi);
      meta.accessed = today();
      const ft = await fullText(doi, opts);
      const name = `${meta.authors[0]?.family ?? ""}${meta.authors[0] ? " " : ""}${meta.year ? `(${meta.year}) ` : ""}${meta.title}`.trim();
      if (ft.text) out.push({ entry, ok: true, message: "Full text added", source: { name, text: ft.text, meta, url: ft.link ?? `https://doi.org/${doi}` } });
      else out.push({ entry, ok: false, message: ft.why, link: ft.link ?? `https://doi.org/${doi}` });
    } catch (e) {
      out.push({ entry, ok: false, message: `Lookup failed (${(e as Error).message}).` });
    }
  }
  onProgress?.(entries.length, entries.length);
  return out;
}
