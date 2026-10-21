"use client";
// Fixing a matched passage: quote and cite it, cite a paraphrase, rewrite it in your own words (the user writes; the
// meter only advises) or remove it. Shared by the plagiarism report and the Rewrite page.
import { useMemo, useState } from "react";
import { FileWarning, PenLine, Quote, Trash2 } from "lucide-react";
import { Button, Card } from "./ui";
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
