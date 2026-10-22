// Reference files exported from Zotero, Mendeley, EndNote and others: BibTeX (.bib) and RIS (.ris).
// Each entry becomes citation details plus a lookup line for the reference importer, which finds legal open-access
// full texts (Crossref, OpenAlex, Unpaywall, Europe PMC).
import type { CiteMeta } from "./similarity";

export interface RefEntry { title?: string; authors: string[]; year?: string; doi?: string; url?: string; isbn?: string; container?: string; publisher?: string; volume?: string; issue?: string; pages?: string }

/** BibTeX: @type{key, field = {value} | "value" | number, ...}. Braces inside values are balanced. */
export function parseBibtex(src: string): RefEntry[] {
  const out: RefEntry[] = [];
  for (const m of src.matchAll(/@(\w+)\s*\{/g)) {
    if (/^(comment|preamble|string)$/i.test(m[1])) continue;
    let i = m.index! + m[0].length, depth = 1;
    const start = i;
    while (i < src.length && depth) { if (src[i] === "{") depth++; else if (src[i] === "}") depth--; i++; }
    const body = src.slice(start, i - 1);
    const f: Record<string, string> = {};
    let k = body.indexOf(",") + 1; // skip the citation key
    while (k > 0 && k < body.length) {
      const fm = body.slice(k).match(/^\s*([\w-]+)\s*=\s*/);
      if (!fm) break;
      k += fm[0].length;
      let v = "";
      if (body[k] === "{") { let d = 0; const s = k; do { if (body[k] === "{") d++; else if (body[k] === "}") d--; k++; } while (k < body.length && d); v = body.slice(s + 1, k - 1); }
      else if (body[k] === '"') { const e = body.indexOf('"', k + 1); v = body.slice(k + 1, e); k = e + 1; }
      else { const e = body.slice(k).search(/[,}]|$/); v = body.slice(k, k + e); k += e; }
      f[fm[1].toLowerCase()] = v.replace(/[{}]/g, "").replace(/\s+/g, " ").trim();
      k = body.indexOf(",", k) + 1;
    }
    out.push({
      title: f.title, authors: (f.author ?? "").split(/\s+and\s+/i).map((a) => a.trim()).filter(Boolean), year: f.year ?? f.date?.slice(0, 4),
      doi: f.doi, url: f.url, isbn: f.isbn, container: f.journal ?? f.journaltitle ?? f.booktitle, publisher: f.publisher, volume: f.volume, issue: f.number, pages: f.pages,
    });
  }
  return out;
}

/** RIS: "TY  - JOUR" ... "ER  -", one tag per line. */
export function parseRis(src: string): RefEntry[] {
  const out: RefEntry[] = [];
  let cur: RefEntry | null = null;
  for (const line of src.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9])\s{2}-\s?(.*)$/);
    if (!m) continue;
    const [, tag, v] = m, val = v.trim();
    if (tag === "TY") { cur = { authors: [] }; continue; }
    if (!cur) continue;
    if (tag === "ER") { out.push(cur); cur = null; continue; }
    if ((tag === "TI" || tag === "T1") && !cur.title) cur.title = val;
    else if (tag === "AU" || tag === "A1") cur.authors.push(val);
    else if ((tag === "PY" || tag === "Y1" || tag === "DA") && !cur.year) cur.year = val.match(/\d{4}/)?.[0];
    else if (tag === "DO") cur.doi = val;
    else if (tag === "UR" && !cur.url) cur.url = val;
    else if (tag === "SN" && /^(97[89])?[\d-]{9,}[\dX]$/i.test(val.replace(/\s/g, ""))) cur.isbn = val;
    else if ((tag === "T2" || tag === "JO" || tag === "JF") && !cur.container) cur.container = val;
    else if (tag === "PB") cur.publisher = val;
    else if (tag === "VL") cur.volume = val;
    else if (tag === "IS") cur.issue = val;
    else if (tag === "SP") cur.pages = val;
    else if (tag === "EP" && cur.pages) cur.pages = `${cur.pages}–${val}`;
  }
  return out;
}

export const parseReferenceFile = (name: string, text: string) => (/\.ris$/i.test(name) ? parseRis(text) : parseBibtex(text));

/** "Darold, Gilles" or "Gilles Darold" → { family, given }. */
const nameOf = (a: string): CiteMeta["authors"][number] => {
  if (a.includes(",")) { const [f, g] = a.split(/\s*,\s*/); return { family: f, given: g || undefined }; }
  const p = a.split(/\s+/);
  return p.length > 1 ? { family: p[p.length - 1], given: p.slice(0, -1).join(" ") } : { family: a };
};

export const toMeta = (e: RefEntry): CiteMeta => ({
  authors: e.authors.map(nameOf), title: e.title ?? "Untitled", year: e.year, container: e.container, publisher: e.publisher,
  volume: e.volume, issue: e.issue, pages: e.pages, doi: e.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""), url: e.url, isbn: e.isbn,
});

/** The line the reference importer resolves: the DOI when there is one, otherwise author, year and title. */
export const lookupLine = (e: RefEntry) =>
  e.doi ? e.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") : [e.authors[0] && nameOf(e.authors[0]).family, e.year && `(${e.year})`, e.title].filter(Boolean).join(" ");

/** Where to read or borrow a book or paper that can't be fetched: never a download of a copyrighted copy. */
export function findCopyLinks(m: Pick<CiteMeta, "title" | "isbn" | "doi" | "authors">): { label: string; url: string }[] {
  const isbn = m.isbn?.replace(/[^0-9X]/gi, "");
  const q = encodeURIComponent([m.title, m.authors?.[0]?.family].filter(Boolean).join(" "));
  const links = [
    { label: "Open Library (read or borrow)", url: isbn ? `https://openlibrary.org/isbn/${isbn}` : `https://openlibrary.org/search?q=${q}` },
    { label: "WorldCat (find it in a library near you)", url: isbn ? `https://search.worldcat.org/search?q=bn:${isbn}` : `https://search.worldcat.org/search?q=${q}` },
    { label: "Google Books (preview)", url: isbn ? `https://books.google.com/books?vid=ISBN${isbn}` : `https://www.google.com/books?q=${q}` },
  ];
  if (m.doi) links.unshift({ label: "Publisher page (DOI)", url: `https://doi.org/${m.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}` });
  return links;
}
