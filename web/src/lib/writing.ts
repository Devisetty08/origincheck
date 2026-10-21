// Advisory writing feedback (Req 9). Heuristics, shown separately from the similarity report.
import { bibStart } from "./similarity";
import { STOP, words } from "./words";

export interface Feedback {
  words: number;
  sentences: number;
  flesch: number;
  fleschLabel: string;
  grade: number;
  long: { text: string; words: number; at: number }[];
  passive: { text: string; at: number }[];
  passivePct: number;
  repeated: { word: string; text: string; at: number }[];
  overused: { word: string; count: number }[];
  terms: { variants: string[]; counts: number[] }[];
}

function syllables(w: string) {
  w = w.toLowerCase().replace(/[^a-z]/g, "");
  if (w.length <= 3) return 1;
  w = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  return Math.max(1, (w.match(/[aeiouy]{1,2}/g) ?? []).length);
}

const IRREGULAR = `arisen awoken been born borne beaten become begun bent bound bitten blown broken brought built burnt bought
caught chosen come cost cut dealt done drawn drunk driven eaten fallen fed felt fought found flown forbidden forgotten
forgiven frozen got gotten given gone ground grown hung had heard hidden hit held hurt kept known laid led left lent let
lain lit lost made meant met paid put quit read ridden rung risen run said seen sought sold sent set shaken shown shut
sung sunk sat slept slid spoken spent spun spread stood stolen stuck stung struck sworn swept swum taken taught torn told
thought thrown understood woken worn won withdrawn written`.split(/\s+/);
const PASSIVE = new RegExp(String.raw`\b(?:am|is|are|was|were|be|been|being)\s+(?:\w+ly\s+)?(?:\w+ed|${IRREGULAR.join("|")})\b`, "i");

function sentences(text: string) {
  const out: { text: string; at: number }[] = [];
  for (const m of text.matchAll(/[^.!?\n]+(?:[.!?]+["”’)]*|\n|$)/g)) {
    const t = m[0].trim();
    if (words(t).length >= 3) out.push({ text: t, at: m.index! + m[0].indexOf(t) });
  }
  return out;
}

/** Spelling or form variants of the same term used side by side. */
function termVariants(text: string) {
  const ws = words(text);
  const count = new Map<string, number>();
  for (const w of ws) count.set(w, (count.get(w) ?? 0) + 1);
  for (let i = 0; i + 1 < ws.length; i++) {
    const pair = `${ws[i]} ${ws[i + 1]}`;
    if (count.has(ws[i] + ws[i + 1])) count.set(pair, (count.get(pair) ?? 0) + 1);
  }
  for (const m of text.toLowerCase().matchAll(/\b([a-z]+)-([a-z]+)\b/g)) count.set(`${m[1]}-${m[2]}`, (count.get(`${m[1]}-${m[2]}`) ?? 0) + 1);

  const groups = new Map<string, Set<string>>();
  const add = (key: string, form: string) => {
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key)!.add(form);
  };
  for (const w of count.keys()) {
    if (w.includes(" ") || w.includes("-")) add(w.replace(/[ -]/g, ""), w);
    else {
      add(w, w);
      const us = w.replace(/is(e|ed|es|ing|ation|ations)$/, "iz$1").replace(/ys(e|ed|es|ing)$/, "yz$1").replace(/our(s|ed|ing)?$/, "or$1");
      if (us !== w && w.length > 4) add(us, w);
    }
  }
  const out: { variants: string[]; counts: number[] }[] = [];
  for (const forms of groups.values())
    if (forms.size > 1) {
      const v = [...forms].filter((f) => (count.get(f) ?? 0) > 0);
      if (v.length > 1) out.push({ variants: v, counts: v.map((f) => count.get(f)!) });
    }
  return out;
}

export function feedback(text: string): Feedback {
  const b = bibStart(text);
  const body = b >= 0 ? text.slice(0, b) : text;
  const sents = sentences(body);
  const ws = words(body);
  const syl = ws.reduce((a, w) => a + syllables(w), 0);
  const wps = ws.length / Math.max(1, sents.length), spw = syl / Math.max(1, ws.length);
  const flesch = Math.round(206.835 - 1.015 * wps - 84.6 * spw);
  const grade = Math.max(0, Math.round((0.39 * wps + 11.8 * spw - 15.59) * 10) / 10);

  const passive = sents.filter((s) => PASSIVE.test(s.text));
  const repeated: Feedback["repeated"] = [];
  for (const s of sents) {
    const sw = words(s.text).filter((w) => w.length >= 4 && !STOP.has(w));
    const seen = new Set<string>();
    for (const w of sw) {
      if (seen.has(w) && !repeated.some((r) => r.at === s.at && r.word === w)) repeated.push({ word: w, text: s.text, at: s.at });
      seen.add(w);
    }
  }
  const freq = new Map<string, number>();
  for (const w of ws) if (w.length >= 5 && !STOP.has(w) && !/^\d+$/.test(w)) freq.set(w, (freq.get(w) ?? 0) + 1);
  const overused = [...freq].filter(([, c]) => c >= 4 && c / ws.length > 0.012)
    .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([word, count]) => ({ word, count }));

  return {
    words: ws.length,
    sentences: sents.length,
    flesch,
    fleschLabel: flesch >= 60 ? "Plain English" : flesch >= 50 ? "Fairly difficult" : flesch >= 30 ? "Difficult (typical for academic writing)" : "Very difficult",
    grade,
    long: sents.map((s) => ({ ...s, words: words(s.text).length })).filter((s) => s.words > 35).slice(0, 12),
    passive: passive.slice(0, 12),
    passivePct: Math.round((100 * passive.length) / Math.max(1, sents.length)),
    repeated: repeated.slice(0, 12),
    overused,
    terms: termVariants(body),
  };
}
