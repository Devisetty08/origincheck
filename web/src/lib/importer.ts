// Adding sources from outside the browser. Every external call goes through origincheck's own server routes
// (/api/*): they hold the API keys, avoid CORS problems, and only ever receive short phrases, URLs, DOIs and references.
import type { CiteMeta } from "./similarity";
import { pdfFromBytes } from "./extract";
import { postSse } from "./sse";

export interface Imported { name: string; text: string; meta?: CiteMeta; url?: string }
export interface ImportOutcome { entry: string; ok: boolean; message: string; source?: Imported; link?: string }

const today = () => new Date().toISOString().slice(0, 10);
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Add a web page (or online PDF) by URL. The server fetches it safely; PDFs are parsed here in the browser. */
export async function importUrl(url: string): Promise<ImportOutcome> {
  try {
    const r = await fetch("/api/fetch-url", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    const text: string = j.kind === "pdf" ? (await pdfFromBytes(fromBase64(j.pdfBase64))).text : j.text;
    if (text.split(/\s+/).length < 30) throw new Error("no readable text found");
    const host = new URL(j.url).hostname.replace(/^www\./, "");
    const meta: CiteMeta = { authors: j.byline ? [{ family: j.byline }] : [], title: j.title || host, container: host, url: j.url, accessed: today() };
    return { entry: url, ok: true, message: j.archived ? "Added from the Internet Archive (the live page couldn't be fetched)" : "Added",
      source: { name: j.title ? `${j.title} (${host})` : j.url, text, meta, url: j.url } };
  } catch (e) {
    return { entry: url, ok: false, message: `Couldn't fetch the page: ${(e as Error).message}. Save it from your browser (Ctrl+S) and upload the file instead.`, link: url };
  }
}

export async function lookupDoi(doi: string): Promise<CiteMeta> {
  const r = await fetch(`/api/doi?doi=${encodeURIComponent(doi)}`);
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

/** Resolve a pasted reference list / DOIs (Crossref, OpenAlex, Unpaywall, Europe PMC) and add open-access full texts. */
export async function importReferences(input: string, onProgress?: (done: number, total: number) => void) {
  const entries = input.split(/\n+/).map((l) => l.trim()).filter((l) => l.length > 6);
  const out: ImportOutcome[] = [];
  type E = { index: number; total: number; entry: string; ok: boolean; message: string; meta?: CiteMeta; text?: string; pdfBase64?: string; link?: string };
  onProgress?.(0, entries.length);
  try {
    await postSse("/api/references", { entries }, async (event, data) => {
      if (event !== "entry") return;
      const e = data as E;
      onProgress?.(e.index + 1, e.total);
      let text = e.text;
      if (e.pdfBase64) try { text = (await pdfFromBytes(fromBase64(e.pdfBase64))).text; } catch { text = undefined; }
      if (e.ok && text && e.meta) {
        const m = e.meta;
        const name = `${m.authors[0]?.family ?? ""}${m.authors[0] ? " " : ""}${m.year ? `(${m.year}) ` : ""}${m.title}`.trim();
        out.push({ entry: e.entry, ok: true, message: e.message, source: { name, text, meta: m, url: e.link } });
      } else out.push({ entry: e.entry, ok: false, message: e.ok ? "The full text couldn't be read." : e.message, link: e.link });
    });
  } catch (err) {
    out.push({ entry: "References", ok: false, message: (err as Error).message });
  }
  return out;
}

/* ------------------------------ free book catalogues ------------------------------ */

export interface CatalogItem { title: string; url: string; section: string; note: string }

export const CATALOGS = [
  { id: "fpb-subjects", label: "Free Programming Books — by subject", repo: "EbookFoundation/free-programming-books" },
  { id: "fpb-langs", label: "Free Programming Books — by language", repo: "EbookFoundation/free-programming-books" },
  { id: "aosd", label: "Awesome Open Source Documents", repo: "44bits/awesome-opensource-documents" },
] as const;

/** Markdown list of links → catalogue items. Handles inline [t](url) and reference-style [t][ref] links. */
export function parseCatalog(md: string): CatalogItem[] {
  const refs = new Map<string, string>();
  for (const m of md.matchAll(/^\[([^\]]+)\]:\s*(\S+)/gm)) refs.set(m[1].toLowerCase(), m[2]);
  const out: CatalogItem[] = [];
  let section = "";
  for (const line of md.split("\n")) {
    const h = line.match(/^#{2,4}\s+(.+)/);
    if (h) { section = h[1].trim(); continue; }
    const li = line.match(/^\s*[*-]\s+(.+)/);
    if (!li || /^(index|table of contents|license)$/i.test(section)) continue;
    const links = [...li[1].matchAll(/\[([^\]]+)\](?:\(([^)\s]+)[^)]*\)|\[([^\]]+)\])/g)]
      .map((m) => ({ text: m[1], url: m[2] ?? refs.get((m[3] ?? "").toLowerCase()) ?? "" }))
      .filter((l) => /^https?:\/\//.test(l.url));
    if (!links.length) continue;
    const named = links.find((l) => !/^(site|repo|pdf|html|epub)$/i.test(l.text));
    const title = named?.text ?? li[1].split(/\s*\(/)[0].replace(/\[[^\]]*\]/g, "").trim();
    const url = (links.find((l) => /^site$/i.test(l.text)) ?? named ?? links[0]).url; // the readable site beats the source repo
    const note = li[1].replace(/\(\s*\[(site|repo)\][^)]*\)/gi, "").replace(/\[([^\]]+)\](\([^)]*\)|\[[^\]]*\])/g, "$1")
      .replace(title, "").replace(/^\s*[-–:]\s*/, "").trim();
    if (title) out.push({ title, url, section, note });
  }
  return out;
}

export async function loadCatalog(id: string) {
  const r = await fetch(`/api/catalog?id=${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return parseCatalog(await r.text());
}
