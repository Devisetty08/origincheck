"use client";
// Fixing a matched passage: quote and cite it, cite a paraphrase, rewrite it in your own words (the user writes; the
// meter only advises) or remove it. Shared by the plagiarism report and the Rewrite page.
import { useMemo, useState } from "react";
import { Eye, EyeOff, FileWarning, PenLine, Quote, Trash2 } from "lucide-react";
import { closeness, LEVEL_LABEL } from "@/lib/closeness";
import { Button, Card, cx } from "./ui";
import { type CiteMeta, type Passage, type Source, sourceSpan } from "@/lib/similarity";
import type { PassageMatch } from "@/lib/hybrid";
import type { Ctx } from "./Report";
import type { Doc, Hybrid, Resolution, RunState } from "./App";
import { CitationDialog, ParaphraseDialog } from "./Dialogs";

export type HPassage = Passage & { type: "near-verbatim" | "paraphrase"; similarity: number; srcStart: number; srcEnd: number };
export type Remedy = "quote" | "paraphrase" | "remove" | "cite";
export type ApplyEdit = (s: number, e: number, rep: string, res: Omit<Resolution, "id" | "at">, recheckOf?: { sid: number; mine?: string; sourcePassage?: string }) => void;

const words = (s: string) => s.split(/\s+/).filter(Boolean);
export const excerpt = (s: string, n = 16) => { const w = words(s); return w.slice(0, n).join(" ") + (w.length > n ? " …" : ""); };

/** Hybrid matches (near-verbatim, paraphrase) as passages; any that overlap a verbatim or stricter-mode match are dropped. */
export function useHybridPassages(toks: Doc["toks"], r: RunState["r"], hybrid: Hybrid) {
  return useMemo(() => {
    const taken = new Set<number>();
    for (const x of [...r.passages, ...r.close]) for (let k = x.b; k < x.e; k++) taken.add(k);
    const conv = (ms: PassageMatch[], pre: "n" | "p"): HPassage[] => ms.flatMap((m) => {
      const idx = toks.map((t, i) => [t, i] as const).filter(([t]) => t.s >= m.docStart && t.e <= m.docEnd).map(([, i]) => i);
      if (!idx.length || idx.some((i) => taken.has(i))) return [];
      const b = idx[0], e = idx[idx.length - 1] + 1;
      return [{ id: `${pre}${m.sid}:${b}`, sid: m.sid, b, e, s: toks[b].s, end: toks[e - 1].e, type: m.type as HPassage["type"], similarity: m.similarity, srcStart: m.srcStart, srcEnd: m.srcEnd }];
    });
    return { n: conv(hybrid.near, "n"), p: conv(hybrid.para, "p") };
  }, [hybrid, r, toks]);
}

export interface RemedyDeps { doc: Doc; run: RunState; ctx: Ctx; citeFor: (s: Source, fresh?: CiteMeta, commit?: boolean) => string; applyEdit: ApplyEdit; saveMeta: (name: string, m: CiteMeta) => void }

export function useRemedies(p: RemedyDeps) {
  const { doc, run: { r, all } } = p;
  const [para, setPara] = useState<Passage | null>(null);
  const [citeEdit, setCiteEdit] = useState<{ sid: number; then?: { remedy: Remedy; p: Passage } } | null>(null);

  const sourcePassage = (x: Passage, ctxWords = 0) => {
    const src = all[x.sid], st = src.toks, h = x as Partial<HPassage>;
    let j0: number, j1: number;
    if (h.srcStart != null && h.srcEnd != null) { // hybrid matches carry their source offsets
      j0 = Math.max(0, st.findIndex((t) => t.s >= h.srcStart!));
      const last = st.findLastIndex((t) => t.e <= h.srcEnd!);
      j1 = Math.max(j0, last);
    } else [j0, j1] = sourceSpan(r, x, src);
    const a = Math.max(0, j0 - ctxWords), z = Math.min(st.length - 1, j1 + ctxWords);
    return { before: (a > 0 ? "… " : "") + src.text.slice(st[a].s, st[j0].s), match: src.text.slice(st[j0].s, st[j1].e), after: src.text.slice(st[j1].e, st[z].e) + (z < st.length - 1 ? " …" : "") };
  };
  const remedy = (kind: Remedy, x: Passage, fresh?: CiteMeta) => {
    const src = all[x.sid];
    if (kind === "remove") {
      return p.applyEdit(x.s, x.end, "", { action: "removed", source: src.name, excerpt: excerpt(doc.text.slice(x.s, x.end)) });
    }
    if (!fresh && !p.ctx.metaFor(src)?.title) return setCiteEdit({ sid: x.sid, then: { remedy: kind, p: x } });
    if (kind === "paraphrase") return setPara(x);
    const cite = p.citeFor(src, fresh);
    const t = doc.text.slice(x.s, x.end);
    if (kind === "cite") { // a paraphrase keeps its wording but credits the source
      const end = /[.!?]["”’)]*$/.test(t) ? t.replace(/([.!?]["”’)]*)$/, ` ${cite}$1`) : `${t} ${cite}`;
      return p.applyEdit(x.s, x.end, end, { action: "cited", source: src.name, excerpt: excerpt(t) });
    }
    p.applyEdit(x.s, x.end, `“${t}” ${cite}`, { action: "cited", source: src.name, excerpt: excerpt(t) });
  };
  const savePara = (x: Passage, mine: string) => {
    const src = all[x.sid], cite = p.citeFor(src);
    let body = mine.trim().replace(/\s*\n+\s*/g, " ");
    const next = doc.text[x.end] ?? "";
    body = /[.!?]/.test(next) ? `${body.replace(/[.!?]+$/, "")} ${cite}` : /[.!?]$/.test(body) ? body.replace(/([.!?])$/, ` ${cite}$1`) : `${body} ${cite}`;
    p.applyEdit(x.s, x.end, body, { action: "rewritten", source: src.name, excerpt: excerpt(doc.text.slice(x.s, x.end)) },
      { sid: x.sid, mine, sourcePassage: sourcePassage(x).match });
    setPara(null);
  };

  const dialogs = <>
    {para && <ParaphraseDialog open onClose={() => setPara(null)} sourceName={all[para.sid].name} original={doc.text.slice(para.s, para.end)}
      sourcePassage={sourcePassage(para).match} cite={p.citeFor(all[para.sid], undefined, false)} onSave={(mine) => savePara(para, mine)} />}
    {citeEdit && <CitationDialog open onClose={() => setCiteEdit(null)} source={all[citeEdit.sid]} initial={p.ctx.metaFor(all[citeEdit.sid])}
      style={p.ctx.style} internet
      onSave={(m) => {
        p.saveMeta(all[citeEdit.sid].name, m);
        const then = citeEdit.then;
        setCiteEdit(null);
        if (then) {
          if (then.remedy === "paraphrase") setPara(then.p);
          else remedy(then.remedy, then.p, m);
        }
      }} />}
  </>;
  return { remedy, sourcePassage, editCitation: (sid: number) => setCiteEdit({ sid }), dialogs };
}

const KIND = { m: "Exact match", n: "Slightly changed", p: "Reworded (same meaning)" } as const;

/**
 * Where the range [s, e) of `before` is in `now`, after edits. Edits inside the range stretch it, edits before it shift
 * it, edits after it leave it alone. Note: edits on both sides since `before` widen the range to cover them.
 */
export function track(before: string, s: number, e: number, now: string): [number, number] {
  let pre = 0;
  while (pre < before.length && pre < now.length && before[pre] === now[pre]) pre++;
  let suf = 0;
  while (suf < before.length - pre && suf < now.length - pre && before[before.length - 1 - suf] === now[now.length - 1 - suf]) suf++;
  const tailB = before.length - e, tailA = before.length - s;
  if (pre >= e) return [s, e]; // edited after
  if (suf >= tailA) return [s + now.length - before.length, e + now.length - before.length]; // edited before
  return [Math.min(s, pre), now.length - Math.min(tailB, suf)];
}

/** Write page: the passages that match a source, and a live closeness meter while you rewrite one in the editor. */
export function WriteMatches({ hybrid, editorId, ...deps }: RemedyDeps & { hybrid: Hybrid; editorId: string }) {
  const { remedy, sourcePassage, dialogs } = useRemedies(deps);
  const { doc, run: { r, all } } = deps;
  const hyb = useHybridPassages(doc.toks, r, hybrid);
  const list = [...r.passages.map((x) => ({ x, k: "m" as const })), ...hyb.n.map((x) => ({ x, k: "n" as const })), ...hyb.p.map((x) => ({ x, k: "p" as const }))]
    .sort((a, b) => a.x.s - b.x.s);
  // the passage being rewritten: kept even after it stops matching, so the meter can say so
  const [focus, setFocus] = useState<{ text: string; s: number; e: number; sid: number; source: string } | null>(null);
  const [show, setShow] = useState(false);

  const pick = (x: Passage) => {
    setFocus({ text: doc.text, s: x.s, e: x.end, sid: x.sid, source: sourcePassage(x).match });
    setShow(false);
    const el = document.getElementById(editorId) as HTMLTextAreaElement | null;
    if (el) { el.blur(); el.setSelectionRange(x.s, x.s); el.focus(); el.setSelectionRange(x.s, x.end); } // focusing scrolls the caret into view
  };

  let live = null;
  if (focus) {
    const [s, e] = track(focus.text, focus.s, focus.e, doc.text);
    const mine = doc.text.slice(s, e), m = closeness(mine, focus.source);
    const still = list.some(({ x }) => x.sid === focus.sid && x.s < e && x.end > s);
    const cited = /\(([^()]*\d{4}|[^()]*n\.d\.)[^()]*\)|\[\d+\]/.test(doc.text.slice(s, Math.min(doc.text.length, e + 40)));
    live = (
      <div className="mt-3 rounded-lg border border-line p-2.5" id="writeFix">
        <div className="flex items-center gap-2">
          <b className="min-w-0 flex-1 truncate" title={all[focus.sid].name}>Rewriting: {all[focus.sid].name}</b>
          <Button size="sm" variant="ghost" onClick={() => setFocus(null)}>Done</Button>
        </div>
        <p className="mt-1 text-[12.5px] text-mute">Rewrite the selected passage in the editor, in your own words. Explain the idea the way you understand it, then cite the source.</p>
        <div className="mt-2 rounded-md bg-soft p-2">
          <div className="flex items-center gap-2">
            <span className="flex-1 text-[12.5px] font-semibold">Source wording</span>
            <Button size="sm" variant="ghost" onClick={() => setShow(!show)} aria-expanded={show} id="writeShowSrc">{show ? <EyeOff size={14} /> : <Eye size={14} />}{show ? "Hide" : "Show"}</Button>
          </div>
          {show ? <p className="mt-1 font-serif text-[14px]">{focus.source}</p>
            : <p className="mt-0.5 text-[12px] text-mute">Hidden, so you write from understanding rather than editing its sentences.</p>}
        </div>
        <div className="mt-2" aria-live="polite" id="writeMeter">
          <div className="flex items-center gap-2 text-[13px]"><span className="font-semibold">Closeness:</span>
            <span className={cx("rounded-full px-2 py-0.5 text-xs font-bold text-white", m.level ? LEVEL_BG[m.level] : "bg-mute")} data-level={m.level ?? ""}>{m.level ? LEVEL_LABEL[m.level] : "Start writing"}</span></div>
          {m.level && <ul className="mt-1.5 grid gap-0.5 text-[12.5px]">
            {m.reasons.map((x) => <li key={x}>• {x}</li>)}
            {m.tips.map((x) => <li key={x} className="text-mute">→ {x}</li>)}
          </ul>}
          <ul className="mt-1.5 grid gap-0.5 text-[12.5px]" id="writeStatus">
            <li>{still ? "⚠ Still matches the source." : "✓ No longer matches the source."}</li>
            <li>{cited ? "✓ Citation present." : "⚠ No citation yet."}</li>
          </ul>
        </div>
        {!cited && <Button size="sm" className="mt-2" id="writeCite" onClick={() => remedy("cite", { id: "w", sid: focus.sid, b: 0, e: 0, s, end: e })}><Quote size={14} />Add citation</Button>}
      </div>
    );
  }

  return (
    <Card className="no-print text-[13.5px]" id="writeMatches" aria-label="Passages that match a source">
      <h3 className="flex items-center gap-1.5 font-semibold"><FileWarning size={15} className={list.length ? "text-high" : "text-low"} />
        {list.length ? `${list.length} passage${list.length > 1 ? "s" : ""} match a source` : "No passages match a source"}
        <span className="ml-auto text-[12.5px] font-normal text-mute">Similarity {r.index}%</span></h3>
      {list.length > 0 && <ul className="mt-2 grid max-h-52 gap-1 overflow-auto">
        {list.map(({ x, k }) => <li key={x.id}>
          <button className="w-full cursor-pointer rounded-md px-1.5 py-1 text-left hover:bg-soft" onClick={() => pick(x)} data-match={x.id}>
            <span className="block truncate font-serif">“{excerpt(doc.text.slice(x.s, x.end), 10)}”</span>
            <span className="block truncate text-[12px] text-mute">{all[x.sid].name} · {KIND[k]}</span>
          </button>
        </li>)}
      </ul>}
      {live}
      <p className="mt-2 text-[12px] text-mute">Similarity is a signal, not proof. Quoting and citing is also fine: you can do that on the Rewrite page.</p>
      {dialogs}
    </Card>
  );
}

const LEVEL_BG = { "too-close": "bg-high", borderline: "bg-mid", original: "bg-low" } as const;

/** Rewrite page: the matches inside the picked sentence or paragraph, each with the source wording and the fixes. */
export function FixMatches({ picked, hybrid, ...deps }: RemedyDeps & { picked: { s: number; e: number }; hybrid: Hybrid }) {
  const { remedy, sourcePassage, dialogs } = useRemedies(deps);
  const { doc, run: { r, all } } = deps;
  const hyb = useHybridPassages(doc.toks, r, hybrid);
  const hits = [...r.passages.map((x) => ({ x, k: "m" as const })), ...hyb.n.map((x) => ({ x, k: "n" as const })), ...hyb.p.map((x) => ({ x, k: "p" as const }))]
    .filter(({ x }) => x.s < picked.e && x.end > picked.s);
  const label = "mb-1 mt-2.5 text-[11.5px] font-semibold uppercase tracking-wide text-mute";
  return (
    <Card className="no-print text-[13.5px]" id="fixMatch" aria-label="Fix this match">
      <h3 className="flex items-center gap-1.5 font-semibold"><FileWarning size={15} className="text-high" />Matches a source</h3>
      <p className="mt-1 text-mute">Make it your own work: quote it and cite the source, or rewrite it in your own words. The citation is added for you, and the passage is checked again.</p>
      {hits.map(({ x, k }) => {
        const h = x as Partial<HPassage>;
        return <div key={x.id} className="mt-3 border-t border-line pt-2.5" data-fix={x.id}>
          <div className="font-semibold">{all[x.sid].name}</div>
          <div className="text-[12.5px] text-mute">{KIND[k]}{h.similarity != null ? ` · ${Math.round(100 * h.similarity)}% similar` : ""}</div>
          <div className={label}>Your text</div>
          <p className="rounded-md bg-bg p-2 font-serif">{doc.text.slice(x.s, x.end)}</p>
          <div className={label}>In the source</div>
          <p className="rounded-md border-l-4 border-high/60 bg-bg p-2 font-serif" data-source-text>{sourcePassage(x).match}</p>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {k === "p"
              ? <Button size="sm" onClick={() => remedy("cite", x)} data-remedy="cite"><Quote size={14} />Cite this source</Button>
              : <Button size="sm" onClick={() => remedy("quote", x)} data-remedy="quote"><Quote size={14} />Quote &amp; cite</Button>}
            <Button size="sm" variant="primary" onClick={() => remedy("paraphrase", x)} data-remedy="paraphrase"><PenLine size={14} />Rewrite in my own words</Button>
            <Button size="sm" variant="danger" onClick={() => remedy("remove", x)} data-remedy="remove"><Trash2 size={14} />Remove</Button>
          </div>
        </div>;
      })}
      {!hits.length && <p className="mt-2 text-mute">Open the plagiarism check to see this match.</p>}
      {dialogs}
    </Card>
  );
}
