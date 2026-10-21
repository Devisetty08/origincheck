// "References & DOIs": resolve each entry with Crossref, enrich with OpenAlex, find open-access full text with
// Unpaywall / Europe PMC, and fetch it through the SSRF-safe fetcher. Only the references and DOIs the user typed are sent.
import "server-only";
import { DOMParser } from "linkedom";
import { DOI_RE, crossrefToMeta } from "@/lib/crossref";
import type { CiteMeta } from "@/lib/similarity";
import { config } from "./config";
import { getJson, getText } from "./http";
import { readable } from "./readable";
import { safeFetch } from "./safeFetch";

const enc = encodeURIComponent;
const mailto = (m?: string) => (m ? `mailto=${enc(m)}` : "");

export interface RefOutcome { entry: string; ok: boolean; message: string; meta?: CiteMeta; text?: string; pdfBase64?: string; link?: string }

export async function lookupDoi(doi: string) {
  const j = await getJson<{ message: Record<string, unknown> }>(`https://api.crossref.org/works/${enc(doi)}?${mailto(config.crossrefMailto)}`);
  return crossrefToMeta(j.message);
}

async function findDoi(reference: string) {
  const j = await getJson<{ message: { items?: { DOI: string; score: number }[] } }>(
    `https://api.crossref.org/works?rows=1&query.bibliographic=${enc(reference.slice(0, 300))}&${mailto(config.crossrefMailto)}`);
  const item = j.message.items?.[0];
  return item && item.score >= 60 ? item.DOI : null;
}

async function europePmcText(pmcid: string) {
  const xml = await getText(`https://www.ebi.ac.uk/europepmc/webservices/rest/${pmcid}/fullTextXML`, { timeoutMs: 12_000 });
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  doc.querySelectorAll("ref-list,table-wrap,fig,xref").forEach((e: Element) => e.remove());
  return [...doc.querySelectorAll("abstract p, body p, body title")].map((p: Element) => p.textContent?.trim()).filter(Boolean).join("\n\n");
}

export async function resolveReference(entry: string): Promise<RefOutcome> {
  try {
    const doi = entry.match(DOI_RE)?.[0] ?? (await findDoi(entry));
    if (!doi) return { entry, ok: false, message: "Couldn't identify this reference in Crossref. Add a DOI or upload the file." };
    const meta = await lookupDoi(doi);
    meta.accessed = new Date().toISOString().slice(0, 10);

    let pmcid: string | undefined, links: string[] = [];
    try {
      type W = { ids?: { pmcid?: string }; best_oa_location?: { pdf_url?: string; landing_page_url?: string }; open_access?: { oa_url?: string } };
      const w = await getJson<W>(`https://api.openalex.org/works/https://doi.org/${enc(doi)}?${mailto(config.openalexMailto)}`);
      pmcid = w.ids?.pmcid?.split("/").pop();
      links = [w.best_oa_location?.pdf_url, w.best_oa_location?.landing_page_url, w.open_access?.oa_url].filter((x): x is string => !!x);
    } catch { /* not in OpenAlex */ }
    if (config.unpaywallEmail)
      try {
        const u = await getJson<{ best_oa_location?: { url_for_pdf?: string; url?: string } }>(`https://api.unpaywall.org/v2/${enc(doi)}?email=${enc(config.unpaywallEmail)}`);
        links.unshift(...[u.best_oa_location?.url_for_pdf, u.best_oa_location?.url].filter((x): x is string => !!x));
      } catch { /* not in Unpaywall */ }

    if (pmcid)
      try {
        const text = await europePmcText(pmcid);
        if (text.split(/\s+/).length > 100) return { entry, ok: true, message: "Full text added (Europe PMC)", meta, text, link: `https://europepmc.org/article/PMC/${pmcid}` };
      } catch { /* fall through */ }

    for (const link of [...new Set(links)]) {
      try {
        const r = await safeFetch(link);
        if (r.contentType.includes("pdf") || r.body.subarray(0, 5).toString() === "%PDF-")
          return { entry, ok: true, message: "Open-access PDF added", meta, pdfBase64: r.body.toString("base64"), link };
        const { text } = readable(r.body.toString("utf8"), r.url);
        if (text.split(/\s+/).length > 300) return { entry, ok: true, message: "Open-access full text added", meta, text, link };
      } catch { /* try the next link */ }
    }
    return links.length
      ? { entry, ok: false, meta, link: links[0], message: "An open-access copy is listed, but it couldn't be downloaded. Open it, save the PDF and add the file." }
      : { entry, ok: false, meta, link: `https://doi.org/${doi}`, message: "No open-access full text found. Add the PDF yourself if you have access." };
  } catch (e) {
    return { entry, ok: false, message: `Lookup failed (${(e as Error).message}).` };
  }
}
