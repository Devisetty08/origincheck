// Text extraction in the browser: mammoth.js for Word, pdf.js for PDF, DOMParser for HTML.
import type { CiteMeta } from "./similarity";

export interface Block { style: "h1" | "h2" | "h3" | "p"; text: string }
export interface Extracted { text: string; blocks: Block[]; meta?: Partial<CiteMeta> }

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
export const SUPPORTED = ".docx,.pdf,.txt,.md,.html,.htm,.rtf";

/** HTML to text with paragraph breaks; also returns heading/paragraph blocks for .docx export. */
export function htmlToText(html: string, readable = false): Extracted {
  const d = new DOMParser().parseFromString(html, "text/html");
  // Same tags as the CLI; `readable` (web pages fetched by URL) also drops page furniture.
  d.querySelectorAll(readable ? "script,style,noscript,nav,footer,header,svg,aside,form" : "script,style,noscript,nav,footer,header,svg").forEach((e) => e.remove());
  const body = d.body ?? d.documentElement;
  const root = readable ? d.querySelector("article") ?? d.querySelector("main") ?? body : body;
  const BLOCK = /^(P|DIV|BR|LI|H[1-6]|TR|TD|TH|SECTION|ARTICLE|TABLE|UL|OL|BLOCKQUOTE|PRE)$/;
  let out = "";
  const walk = (node: Node) => {
    for (const c of node.childNodes) {
      if (c.nodeType === 3) out += c.nodeValue;
      else if (c.nodeType === 1) {
        const b = BLOCK.test((c as Element).tagName);
        if (b) out += "\n";
        walk(c);
        if (b) out += "\n";
      }
    }
  };
  walk(root);
  const text = out.replace(/[ \t]+\n/g, "\n").replace(/\n\s*\n+/g, "\n\n").trim();
  const blocks: Block[] = [];
  root.querySelectorAll("h1,h2,h3,h4,h5,h6,p,li").forEach((e) => {
    const t = (e.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!t) return;
    const tag = e.tagName.toLowerCase();
    blocks.push({ style: tag === "h1" ? "h1" : tag === "h2" ? "h2" : /^h[3-6]$/.test(tag) ? "h3" : "p", text: t });
  });
  const title = d.querySelector("title")?.textContent?.trim();
  return { text, blocks, meta: title ? { title } : undefined };
}

export function rtfToText(raw: string) {
  return raw.replace(/\\pard?/g, "\n").replace(/\\'[0-9a-f]{2}/g, "").replace(/\\[a-z]+-?\d* ?/g, "").replace(/[{}]/g, "");
}

function parseAuthors(s?: string): CiteMeta["authors"] {
  // Tools often stamp a placeholder author; that's not a real citation.
  if (!s?.trim() || /^(anonymous|unknown|user|author|admin(istrator)?|owner|microsoft office user)$/i.test(s.trim())) return [];
  return s.split(/\s*(?:;|\band\b|&)\s*/).filter(Boolean).map((a) => {
    if (a.includes(",")) { const [family, given] = a.split(/\s*,\s*/); return { family, given }; }
    const parts = a.trim().split(/\s+/);
    return { family: parts.pop()!, given: parts.join(" ") || undefined };
  });
}

async function docx(buf: ArrayBuffer): Promise<Extracted> {
  const mammoth = (await import("mammoth")).default;
  const r = await mammoth.convertToHtml({ arrayBuffer: buf });
  const ex = htmlToText(r.value);
  ex.meta = undefined; // mammoth output has no <title>; read the Word properties instead
  try {
    const JSZip = (await import("jszip")).default;
    const core = await (await JSZip.loadAsync(buf)).file("docProps/core.xml")?.async("string");
    if (core) {
      const x = new DOMParser().parseFromString(core, "application/xml");
      const pick = (tag: string) => x.getElementsByTagNameNS("*", tag)[0]?.textContent?.trim();
      const title = pick("title"), creator = pick("creator"), created = pick("created");
      ex.meta = { title: title || undefined, authors: parseAuthors(creator), year: created?.slice(0, 4) };
    }
  } catch { /* properties are optional */ }
  return ex;
}

export type PdfItem = { str?: string; transform: number[]; height?: number };

/** pdf.js text items → text: line breaks on y changes, paragraph breaks on large gaps, hyphenation and soft wraps undone (as the CLI does). */
export function pdfText(pages: PdfItem[][]) {
  return pages.map((items) => {
    let out = "", lastY: number | null = null, lastH = 0;
    for (const it of items) {
      if (!it.str) continue;
      const y = it.transform[5], h = Math.abs(it.transform[3]) || it.height || 10;
      if (lastY !== null && Math.abs(y - lastY) > 0.5) out += Math.abs(y - lastY) > 1.6 * Math.max(h, lastH) ? "\n\n" : "\n";
      out += it.str;
      lastY = y; lastH = h;
    }
    return out;
  }).join("\n\n").replace(/-\n(\w)/g, "$1").replace(/(?<![.\n:])\n(?!\n)/g, " ");
}

/** Text of a PDF given as bytes (e.g. one the server fetched); parsed here in the browser with pdf.js. */
export const pdfFromBytes = (bytes: Uint8Array) => pdf(bytes.slice().buffer);

async function pdf(buf: ArrayBuffer): Promise<Extracted> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = `${BASE}/pdf.worker.min.mjs`;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages: PdfItem[][] = [];
  for (let p = 1; p <= doc.numPages; p++) pages.push((await (await doc.getPage(p)).getTextContent()).items as PdfItem[]);
  const text = pdfText(pages);
  let meta: Partial<CiteMeta> | undefined;
  try {
    const info = (await doc.getMetadata()).info as Record<string, string>;
    const y = (info.CreationDate ?? "").match(/(\d{4})/)?.[1];
    meta = { title: info.Title?.trim() || undefined, authors: parseAuthors(info.Author), year: y };
  } catch { /* optional */ }
  return { text, blocks: text.split(/\n\n+/).map((t) => ({ style: "p" as const, text: t.trim() })).filter((b) => b.text), meta };
}

const plainBlocks = (text: string): Block[] =>
  text.split(/\n\s*\n+/).map((t) => t.trim()).filter(Boolean).map((t) => {
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    return h ? { style: (["h1", "h2", "h3"] as const)[h[1].length - 1], text: h[2] } : { style: "p" as const, text: t.replace(/\s*\n\s*/g, " ") };
  });

export const MAX_FILE_MB = 50;
export const PARSE_TIMEOUT_MS = 60_000;

/** Reads a file in the browser, with a size cap and a time limit so a malformed file can't hang the page. */
export async function extract(file: File): Promise<Extracted> {
  const ext = (file.name.match(/\.[^.]+$/)?.[0] ?? "").toLowerCase();
  if (!SUPPORTED.split(",").includes(ext)) throw new Error(`${file.name}: unsupported file type. Use .docx, .pdf, .txt, .md, .html or .rtf.`);
  if (file.size > MAX_FILE_MB * 1e6) throw new Error(`${file.name} is larger than ${MAX_FILE_MB} MB.`);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${file.name} took too long to read (over ${PARSE_TIMEOUT_MS / 1000} s). Try saving it again or as .txt.`)), PARSE_TIMEOUT_MS);
  });
  try { return await Promise.race([read(file, ext), timeout]); } finally { clearTimeout(timer); }
}

async function read(file: File, ext: string): Promise<Extracted> {
  let ex: Extracted;
  if (ext === ".docx") ex = await docx(await file.arrayBuffer());
  else if (ext === ".pdf") ex = await pdf(await file.arrayBuffer());
  else {
    const raw = await file.text();
    if (ext === ".html" || ext === ".htm") ex = htmlToText(raw);
    else if (ext === ".rtf") { const t = rtfToText(raw); ex = { text: t, blocks: plainBlocks(t) }; }
    else if (ext === ".txt" || ext === ".md") ex = { text: raw, blocks: plainBlocks(raw) };
    else throw new Error(`${file.name}: unsupported file type. Use .docx, .pdf, .txt, .md, .html or .rtf.`);
  }
  ex.text = ex.text.replace(/\r\n?/g, "\n");
  return ex;
}

export { DOI_RE } from "./crossref";
