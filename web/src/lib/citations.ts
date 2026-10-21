// Citation formatting (APA 7, Harvard, IEEE) and the citation checker.
import type { CiteMeta } from "./similarity";
import { QUOTE_RE, bibStart } from "./similarity";

export type Style = "apa" | "harvard" | "ieee";
export const STYLE_LABEL: Record<Style, string> = { apa: "APA 7", harvard: "Harvard", ieee: "IEEE" };

/** A formatted reference: plain-text segments, some italic. */
export type Seg = { t: string; i?: boolean };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const initials = (given = "") =>
  given.split(/[\s.]+/).filter(Boolean).map((g) => g.split("-").map((p) => p[0].toUpperCase() + ".").join("-")).join(" ");
const year = (m: CiteMeta) => m.year?.trim() || "n.d.";
const doiUrl = (doi: string) => `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}`;
const shortTitle = (t: string) => t.split(/\s+/).slice(0, 4).join(" ");
const endDot = (s: string) => (/[.?!]$/.test(s) ? s : s + ".");

function joinNames(names: string[], and: string) {
  if (names.length <= 1) return names.join("");
  if (names.length === 2) return `${names[0]} ${and} ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, ${and} ${names[names.length - 1]}`;
}

/** In-text citation for one source. `n` is its IEEE number. */
export function inText(m: CiteMeta, style: Style, n = 1): string {
  if (style === "ieee") return `[${n}]`;
  const fam = m.authors.map((a) => a.family).filter(Boolean);
  const who =
    !fam.length ? (style === "apa" ? `"${shortTitle(m.title)}"` : shortTitle(m.title))
    : fam.length === 1 ? fam[0]
    : fam.length === 2 ? `${fam[0]} ${style === "apa" ? "&" : "and"} ${fam[1]}`
    : `${fam[0]} et al.`;
  return style === "apa" ? `(${who}, ${year(m)})` : `(${who} ${year(m)})`;
}

function accessedText(m: CiteMeta, style: Style) {
  if (!m.accessed) return "";
  const d = new Date(m.accessed + "T00:00:00");
  if (isNaN(+d)) return "";
  return style === "ieee"
    ? `accessed ${MONTHS[d.getMonth()].slice(0, 3)}. ${d.getDate()}, ${d.getFullYear()}`
    : `Accessed: ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function reference(m: CiteMeta, style: Style, n = 1): Seg[] {
  const out: Seg[] = [];
  const t = (s: string, i = false) => s && out.push({ t: s, i });
  const vol = [m.volume, m.issue && `(${m.issue})`].filter(Boolean).join("");
  const link = m.doi ? doiUrl(m.doi) : m.url ?? "";

  if (style === "apa") {
    const names = m.authors.map((a) => [a.family, initials(a.given)].filter(Boolean).join(", "));
    const who = names.length > 1 ? `${names.slice(0, -1).join(", ")}, & ${names[names.length - 1]}` : names[0];
    if (who) t(`${endDot(who)} (${year(m)}). `);
    t(endDot(m.title), !m.container);
    if (!who) t(` (${year(m)}).`);
    if (m.container) {
      t(" ");
      t(m.container, true);
      if (vol) { t(", "); t(m.volume ?? "", true); t(m.issue ? `(${m.issue})` : ""); }
      t(m.pages ? `, ${m.pages}.` : ".");
    }
    if (m.publisher && m.publisher !== m.container) t(` ${endDot(m.publisher)}`);
    if (link) t(` ${link}`);
  } else if (style === "harvard") {
    const names = m.authors.map((a) => [a.family, initials(a.given)].filter(Boolean).join(", "));
    t(names.length ? `${joinNames(names, "and")} (${year(m)}) ` : "");
    t(m.container ? `'${m.title}', ` : `${m.title}. `, !m.container);
    if (!names.length) t(`(${year(m)}) `);
    if (m.container) {
      t(m.container, true);
      t([vol && `, ${vol}`, m.pages && `, pp. ${m.pages}`].filter(Boolean).join("") + ". ");
    }
    if (m.publisher && m.publisher !== m.container) t(`${endDot(m.publisher)} `);
    if (m.doi) t(`doi: ${m.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}.`);
    else if (m.url) t(`Available at: ${m.url} (${accessedText(m, style) || "Accessed: n.d."}).`);
  } else {
    const names = m.authors.map((a) => [initials(a.given), a.family].filter(Boolean).join(" "));
    t(`[${n}] `);
    if (names.length) t(`${names.length > 6 ? `${names[0]} et al.` : joinNames(names, "and")}, `);
    if (m.container) {
      t(`"${m.title}," `);
      t(m.container, true);
      t([m.volume && `, vol. ${m.volume}`, m.issue && `, no. ${m.issue}`, m.pages && `, pp. ${m.pages}`, `, ${year(m)}`].filter(Boolean).join(""));
    } else {
      t(m.title, true);
      t(`${m.publisher ? `. ${m.publisher}` : ""}, ${year(m)}`);
    }
    if (m.doi) t(`, doi: ${m.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}.`);
    else if (m.url) t(`. [Online]. Available: ${m.url}${m.accessed ? ` (${accessedText(m, style)})` : ""}`);
    else t(".");
  }
  return out;
}

export const segText = (s: Seg[]) => s.map((x) => x.t).join("");

/** Sort reference entries as the style expects. */
export function orderForList<T extends { meta: CiteMeta; n: number }>(items: T[], style: Style) {
  return [...items].sort((a, b) =>
    style === "ieee" ? a.n - b.n
    : (a.meta.authors[0]?.family || a.meta.title).localeCompare(b.meta.authors[0]?.family || b.meta.title),
  );
}

/* ------------------------------ citation checker ------------------------------ */

export interface CiteIssue {
  kind: "no-entry" | "uncited-entry" | "uncited-quote" | "uncited-source" | "long-quote" | "quote-heavy" | "uncited-claim";
  message: string;
  at?: number; // char offset in the document, for "show me"
}

interface Found { key: string; label: string; at: number }

const YEAR = String.raw`(?:1[5-9]\d\d|20\d\d)[a-z]?|n\.d\.`;
const PAREN = new RegExp(String.raw`\(([^()]*?(?:${YEAR})[^()]*)\)`, "g");
const NARR = new RegExp(String.raw`\b([A-Z][\p{L}'’-]+)(?:\s+(?:and|&)\s+[A-Z][\p{L}'’-]+|\s+et al\.)?,?\s+\((${YEAR})[^)]*\)`, "gu");
const IEEE = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function expandNums(s: string) {
  const out: number[] = [];
  for (const part of s.split(",")) {
    const [a, b] = part.split(/[–-]/).map((x) => parseInt(x, 10));
    if (b && b >= a && b - a < 50) for (let k = a; k <= b; k++) out.push(k);
    else if (a) out.push(a);
  }
  return out;
}

/** In-text citations in the body (before the bibliography). */
export function findCitations(body: string): Found[] {
  const out: Found[] = [];
  for (const m of body.matchAll(PAREN))
    for (const part of m[1].split(";")) {
      const y = part.match(new RegExp(YEAR));
      const name = part.replace(/\b(e\.g\.|see|cf\.)\s*/gi, "").match(/[A-Z][\p{L}'’-]+/u);
      if (y && name) out.push({ key: `${norm(name[0])}|${y[0].replace(/[a-z]$/, "")}`, label: part.trim(), at: m.index! });
    }
  for (const m of body.matchAll(NARR))
    out.push({ key: `${norm(m[1])}|${m[2].replace(/[a-z]$/, "")}`, label: m[0], at: m.index! });
  for (const m of body.matchAll(IEEE)) for (const k of expandNums(m[1])) out.push({ key: `#${k}`, label: `[${k}]`, at: m.index! });
  return out;
}

/** Reference-list entries: one per paragraph/line after the bibliography heading. */
export function findEntries(text: string) {
  const b = bibStart(text);
  if (b < 0) return [];
  const lines = text.slice(b).split(/\n+/).slice(1).map((l) => l.trim()).filter((l) => l.split(/\s+/).length >= 3);
  return lines.map((l) => {
    const num = l.match(/^\[(\d+)\]/);
    const fam = l.replace(/^\[\d+\]\s*/, "").match(/[A-Z][\p{L}'’-]+/u)?.[0] ?? "";
    const y = l.match(new RegExp(`\\b(${YEAR})`))?.[1]?.replace(/[a-z]$/, "") ?? "";
    return { text: l, keys: num ? [`#${num[1]}`] : [`${norm(fam)}|${y}`], fam: norm(fam), year: y };
  });
}

const LONG_QUOTE = 40, QUOTE_SHARE = 0.15;
const CLAIM = /\b\d+(?:\.\d+)?\s?(?:%|per ?cent\b)|\b(?:studies|research|researchers|surveys?|reports?|experts|evidence|statistics|data)\s+(?:show|shows|showed|found|finds|suggest|suggests|indicate|indicates|estimate|estimates|reveal|reveals)\b|\baccording to\b|\bit (?:is|has been) (?:widely )?(?:known|reported|estimated|shown|argued)\b/i;
const OWN = /\b(?:I|we|my|our|us|this (?:study|project|report|thesis|dissertation))\b/i; // your own findings need no citation

export function checkCitations(
  text: string,
  matched: { name: string; meta?: CiteMeta; n: number }[],
): CiteIssue[] {
  const b = bibStart(text);
  const body = b >= 0 ? text.slice(0, b) : text;
  const cites = findCitations(body);
  const entries = findEntries(text);
  const issues: CiteIssue[] = [];
  const citeKeys = new Set(cites.map((c) => c.key));
  const entryKeys = new Set(entries.flatMap((e) => e.keys));

  if (entries.length) {
    const seen = new Set<string>();
    for (const c of cites)
      if (!entryKeys.has(c.key) && !seen.has(c.key)) {
        seen.add(c.key);
        issues.push({ kind: "no-entry", message: `In-text citation ${c.label} has no matching reference-list entry.`, at: c.at });
      }
  } else if (cites.length) issues.push({ kind: "no-entry", message: `The document cites ${cites.length} time(s) but has no reference list (no "References" heading found).` });

  for (const e of entries)
    if (!e.keys.some((k) => citeKeys.has(k)))
      issues.push({ kind: "uncited-entry", message: `Reference-list entry is never cited in the text: "${e.text.slice(0, 90)}${e.text.length > 90 ? "…" : ""}"` });

  for (const q of body.matchAll(QUOTE_RE)) {
    if (q[1].split(/\s+/).length < 4) continue;
    const end = q.index! + q[0].length;
    const after = body.slice(end, end + 120).split(/(?<=[.!?])\s/)[0];
    const before = body.slice(Math.max(0, q.index! - 160), q.index!).split(/(?<=[.!?])\s/).pop() ?? "";
    const cited = /\([^()]*\d{4}[^()]*\)|\[\d+/.test(after) || new RegExp(`\\((?:${YEAR})`).test(before);
    if (!cited) issues.push({ kind: "uncited-quote", message: `Quotation has no citation: ${q[0].slice(0, 80)}${q[0].length > 80 ? "…" : ""}`, at: q.index! });
  }

  // quotes: keep the ones where the exact wording matters, summarise the rest
  let quoted = 0;
  for (const q of body.matchAll(QUOTE_RE)) {
    const n = q[1].split(/\s+/).filter(Boolean).length;
    quoted += n;
    if (n >= LONG_QUOTE) issues.push({ kind: "long-quote", message: `Long quotation (${n} words): ${q[0].slice(0, 60)}… Keep it only if the exact wording matters; otherwise summarise it in your own words and cite. APA sets quotations of 40 or more words as an indented block.`, at: q.index! });
  }
  const bodyWords = body.split(/\s+/).filter(Boolean).length;
  if (bodyWords >= 200 && quoted / bodyWords > QUOTE_SHARE)
    issues.push({ kind: "quote-heavy", message: `About ${Math.round((100 * quoted) / bodyWords)}% of your text is quoted. Keep the quotations where the exact wording matters and summarise the rest in your own words, with citations.` });

  // claims that usually come from a source: statistics, "studies show", "according to"
  for (const m of body.matchAll(/[^.!?\n]+[.!?]*/g)) {
    const t = m[0].trim();
    if (!CLAIM.test(t) || OWN.test(t) || /\([^()]*\d{4}[^()]*\)|\[\d+|\(n\.d\.\)/.test(t) || /["“”][^"“”]{3,}["“”]/.test(t)) continue;
    issues.push({ kind: "uncited-claim", message: `No citation for this claim: "${t.slice(0, 90)}${t.length > 90 ? "…" : ""}" If it isn't your own finding or common knowledge, cite where you learned it.`, at: m.index! + m[0].indexOf(t) });
  }

  for (const s of matched) {
    if (!s.meta?.title) {
      issues.push({ kind: "uncited-source", message: `Matched source "${s.name}" has no citation details, so origincheck can't tell whether you cite it. Add its details on the Citations tab.` });
      continue;
    }
    const fam = s.meta.authors[0]?.family;
    const keys = [`#${s.n}`, fam ? `${norm(fam)}|${s.meta.year?.trim() || "n.d."}` : ""];
    const titleCited = !fam && norm(body).includes(norm(shortTitle(s.meta.title)));
    if (!keys.some((k) => k && citeKeys.has(k)) && !titleCited)
      issues.push({ kind: "uncited-source", message: `Matched source "${s.name}" is not cited anywhere in the document.` });
  }
  return issues;
}
