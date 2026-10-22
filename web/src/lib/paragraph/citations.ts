// In-text citations in a paragraph (APA 7, Harvard, IEEE): find them, match them to the sources, check them
// against the chosen style and format the reference list (citation-js with CSL styles; built-in templates as fallback).
import { type Seg, type Style, inText, orderForList, reference, segText } from "../citations";
import type { CiteMeta } from "../similarity";

export interface PSource { id: string; title: string; text: string; meta: CiteMeta; page?: string; /** Open-access full text (Unpaywall), when known. */ oaUrl?: string }

export interface Cite {
  s: number; e: number; raw: string;
  /** How it's written: "apa" (Name, 2024), "harvard" (Name 2024), "narrative" Name (2024), "ieee" [1]. */
  form: "apa" | "harvard" | "narrative" | "ieee";
  names: string[]; year?: string; nums: number[]; page?: string;
  /** Index of the matching source, or -1. */
  src: number;
}

const YEAR = String.raw`(?:1[5-9]\d\d|20\d\d)[a-z]?|n\.d\.`;
const PAGE = String.raw`(?:,\s*(?:p|pp|para)\.\s*[\w–-]+)?`;
const NAME = String.raw`[\p{Lu}"“][\p{L}'’".”-]*(?:\s+[\p{Lu}][\p{L}'’-]*)*`;
const WHO = String.raw`${NAME}(?:(?:\s*,\s*|\s+)(?:&|and)\s+${NAME}|\s+et\s+al\.)?`;
const PAREN = new RegExp(String.raw`\((${WHO})(,?)\s+(${YEAR})(${PAGE})\)`, "gu");
const NARR = new RegExp(String.raw`(${WHO})\s+\((${YEAR})(${PAGE})\)`, "gu");
const IEEE = /\[(\d+(?:\s*[,–-]\s*\d+)*)(?:,\s*(?:p|pp)\.\s*[\w–-]+)?\]/g;

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/["“”]/g, "").trim();
const namesOf = (who: string) => who.replace(/\s+et\s+al\./, "").split(/\s*(?:,\s*)?(?:&|\band\b)\s*/).map((x) => x.trim()).filter(Boolean);
const pageOf = (p: string) => p.replace(/^,\s*/, "").trim() || undefined;

/** First-author key of a source: family name, or the first words of the title when there is no author. */
const keyOf = (m: CiteMeta) => norm(m.authors[0]?.family || m.title.split(/\s+/).slice(0, 4).join(" "));

export function findCites(text: string, sources: PSource[]): Cite[] {
  const out: Cite[] = [];
  const taken = (s: number, e: number) => out.some((c) => c.s < e && c.e > s);
  const match = (names: string[], year?: string) => {
    const first = norm(names[0] ?? ""), y = year?.replace(/[a-z]$/, "");
    return sources.findIndex((x) => keyOf(x.meta).startsWith(first) && first.length > 1 && (!y || (x.meta.year?.trim() || "n.d.") === y));
  };
  for (const m of text.matchAll(PAREN)) {
    const names = namesOf(m[1]);
    out.push({ s: m.index!, e: m.index! + m[0].length, raw: m[0], form: m[2] ? "apa" : "harvard", names, year: m[3], nums: [], page: pageOf(m[4]), src: match(names, m[3]) });
  }
  for (const m of text.matchAll(NARR)) {
    const s = m.index!, e = s + m[0].length;
    if (taken(s, e)) continue;
    const names = namesOf(m[1]);
    out.push({ s, e, raw: m[0], form: "narrative", names, year: m[2], nums: [], page: pageOf(m[3]), src: match(names, m[2]) });
  }
  for (const m of text.matchAll(IEEE)) {
    const nums: number[] = [];
    for (const part of m[1].split(",")) {
      const [a, b] = part.split(/[–-]/).map((x) => parseInt(x, 10));
      if (b && b >= a && b - a < 50) for (let k = a; k <= b; k++) nums.push(k); else if (a) nums.push(a);
    }
    out.push({ s: m.index!, e: m.index! + m[0].length, raw: m[0], form: "ieee", names: [], nums, page: pageOf(m[0].match(/,\s*(?:p|pp)\.\s*[\w–-]+/)?.[0] ?? ""),
      src: nums.every((n) => n >= 1 && n <= sources.length) ? nums[0] - 1 : -1 });
  }
  return out.sort((a, b) => a.s - b.s);
}

/** The in-text citation for a source in the chosen style, with a page number when known. IEEE numbers follow the source list. */
export function citeFor(sources: PSource[], i: number, style: Style, page = sources[i]?.page): string {
  const base = inText(sources[i].meta, style, i + 1);
  if (!page) return base;
  const p = /^\d+$/.test(page.trim()) ? `p. ${page.trim()}` : page.trim();
  return style === "ieee" ? base.replace("]", `, ${p}]`) : base.replace(/\)$/, `, ${p})`);
}

/** The citation rewritten in the chosen style, or null when it already fits (or its source isn't known). */
export function expectedForm(c: Cite, sources: PSource[], style: Style): string | null {
  if (c.src < 0) return null;
  const want = style === "ieee" ? "ieee" : style;
  if (c.form === "narrative" && style !== "ieee") return null; // "Microsoft (2024) says" is fine in APA and Harvard
  if (c.form === want) {
    const exp = citeFor(sources, c.src, style, c.page);
    return norm(exp.replace(/\s+/g, " ")) === norm(c.raw.replace(/\s+/g, " ")) || c.form === "ieee" ? null : exp;
  }
  return citeFor(sources, c.src, style, c.page);
}

/* ------------------------------ reference list ------------------------------ */

const CSL_TEMPLATE: Record<Style, string> = { apa: "apa", harvard: "harvard-cite-them-right", ieee: "ieee" };

export function toCsl(m: CiteMeta, id: string) {
  const date = (s?: string) => { const p = s?.match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/); return p ? { "date-parts": [[+p[1], ...(p[2] ? [+p[2]] : []), ...(p[3] ? [+p[3]] : [])]] } : undefined; };
  return {
    id,
    type: m.container && !m.url ? "article-journal" : m.url && !m.doi ? "webpage" : m.container ? "article-journal" : "book",
    title: m.title,
    author: m.authors.map((a) => (a.given ? { family: a.family, given: a.given } : { literal: a.family })),
    issued: date(m.year),
    "container-title": m.container, volume: m.volume, issue: m.issue, page: m.pages, publisher: m.publisher,
    URL: m.doi ? undefined : m.url, DOI: m.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, ""), accessed: date(m.accessed),
  };
}

let loaded: Promise<typeof import("@citation-js/core")> | null = null;
const templates = new Set<string>();

async function citationJs(style: Style) {
  loaded ??= import("@citation-js/core").then(async (core) => { await import("@citation-js/plugin-csl"); return core; });
  const core = await loaded;
  const name = CSL_TEMPLATE[style];
  if (name !== "apa" && !templates.has(name)) {
    const r = await fetch(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/csl/${name}.csl`);
    if (!r.ok) throw new Error(`style ${name} unavailable`);
    (core.plugins.config.get("@csl") as unknown as { templates: { add: (n: string, xml: string) => void } }).templates.add(name, await r.text());
    templates.add(name);
  }
  return { Cite: core.Cite, template: name };
}

export interface RefEntry { sid: number; text: string; segs?: Seg[] }

/** Formatted reference entries for the cited sources (in the style's order), and which formatter made them. */
export async function referenceList(sources: PSource[], cited: number[], style: Style): Promise<{ entries: RefEntry[]; engine: "citation-js" | "built-in" }> {
  const ids = [...new Set(cited)].filter((i) => sources[i]);
  if (!ids.length) return { entries: [], engine: "built-in" };
  try {
    const { Cite, template } = await citationJs(style);
    const cite = new Cite(ids.map((i) => toCsl(sources[i].meta, `s${i}`)));
    const rows = cite.format("bibliography", { format: "text", template, lang: "en-US", asEntryArray: true }) as unknown as [string, string][];
    return { entries: rows.map(([id, t]) => ({ sid: Number(id.slice(1)), text: t.trim() })), engine: "citation-js" };
  } catch {
    const items = orderForList(ids.map((i) => ({ meta: sources[i].meta, n: i + 1, i })), style);
    return { entries: items.map((x) => { const segs = reference(x.meta, style, x.n); return { sid: x.i, text: segText(segs), segs }; }), engine: "built-in" };
  }
}
