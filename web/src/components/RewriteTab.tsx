"use client";
// Rewrite: click a sentence or a paragraph (or select any text) on the left; the panel on the right shows the
// original next to the suggestion. Sentences that match a source are highlighted; picking one shows the source wording
// and the fixes (quote and cite, or rewrite it yourself).
import { type ReactNode, useMemo, useState } from "react";
import { FileSearch, Lock } from "lucide-react";
import { Button, Card, cx } from "./ui";

type Range = { s: number; e: number };
interface Props {
  text: string;
  flagged: [number, number][];
  /** Similarity index of the last check, when there is one. */
  index?: number;
  onOpenPlagiarism: () => void;
  renderPanel: (picked: Range | null) => ReactNode;
}

/** Paragraphs with their offsets (blank lines separate paragraphs). */
export function paragraphs(text: string): Range[] {
  return [...text.matchAll(/[^\n]+(?:\n(?![ \t]*\n)[^\n]+)*/g)].map((m) => ({ s: m.index!, e: m.index! + m[0].length })).filter((r) => text.slice(r.s, r.e).trim());
}

/** Sentences of a paragraph with their offsets (trailing spaces left out). */
export function sentences(text: string, para: Range): Range[] {
  const part = text.slice(para.s, para.e);
  return [...part.matchAll(/[^.!?]+(?:[.!?]+["”’)\]]*)?/g)]
    .map((m) => { const t = m[0], lead = t.length - t.trimStart().length; return { s: para.s + m.index! + lead, e: para.s + m.index! + t.trimEnd().length }; })
    .filter((r) => r.e > r.s);
}

export default function RewriteTab(p: Props) {
  // a pick belongs to the text it was made on: after any edit it is cleared
  const [pk, setPk] = useState<{ r: Range; text: string } | null>(null);
  const picked = pk && pk.text === p.text ? pk.r : null;
  const setPicked = (r: Range) => setPk({ r, text: p.text });
  const [unit, setUnit] = useState<"sentence" | "paragraph">("sentence");
  const paras = useMemo(() => paragraphs(p.text).map((r) => ({ ...r, sents: sentences(p.text, r) })), [p.text]);
  const overlaps = (r: Range) => p.flagged.some(([a, b]) => a < r.e && b > r.s);
  const flaggedCount = paras.reduce((n, r) => n + r.sents.filter(overlaps).length, 0);

  // a mouse selection inside the document wins over a click
  const fromSelection = (): Range | null => {
    const t = window.getSelection()?.toString().trim() ?? "";
    if (t.length < 3) return null;
    const s = p.text.indexOf(t); // ponytail: first occurrence; a repeated passage resolves to its first copy
    return s < 0 ? null : { s, e: s + t.length };
  };
  const pick = (r: Range, fallback: Range) => { const sel = fromSelection(); setPicked(sel && sel.s >= r.s && sel.e <= r.e ? sel : fallback); };
  const isPicked = (r: Range) => !!picked && picked.s <= r.s && picked.e >= r.e;

  return (
    <div className="grid grid-cols-1 items-start gap-5 min-[1000px]:grid-cols-[minmax(0,1fr)_400px]">
      <article className="min-w-0 rounded-xl border border-line bg-panel px-3 py-4 sm:px-6">
        <div className="no-print mb-2 flex flex-wrap items-center justify-between gap-2 px-2">
          <p className="text-[13px] text-mute">Click a {unit} to rewrite it, or select any part with your mouse.</p>
          <span className="inline-flex overflow-hidden rounded-lg border border-line text-[12.5px]" role="radiogroup" aria-label="Pick by">
            {(["sentence", "paragraph"] as const).map((u) => <button key={u} role="radio" aria-checked={unit === u} data-unit={u} onClick={() => setUnit(u)}
              className={cx("cursor-pointer px-3 py-1 font-medium capitalize", unit === u ? "bg-accent text-accent-ink" : "bg-panel text-mute hover:text-ink")}>{u}</button>)}
          </span>
        </div>
        <div id="rwDoc" className="grid gap-1 font-serif text-[16px] leading-[1.8]">
          {paras.map((r, i) => {
            const paraOn = unit === "paragraph" && isPicked(r);
            return (
              <div key={r.s} data-para={i} role={unit === "paragraph" ? "button" : undefined} tabIndex={unit === "paragraph" ? 0 : undefined}
                onMouseUp={unit === "paragraph" ? () => pick(r, r) : undefined}
                onKeyDown={unit === "paragraph" ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(r); } } : undefined}
                className={cx("rounded-lg border-l-4 px-3 py-1.5 whitespace-pre-wrap wrap-anywhere transition",
                  paraOn ? "border-accent bg-soft" : "border-transparent", unit === "paragraph" && "cursor-pointer hover:bg-soft/60")}>
                {r.sents.map((s, k) => {
                  const locked = overlaps(s), on = unit === "sentence" && isPicked(s);
                  return <span key={s.s}>
                    {k > 0 && p.text.slice(r.sents[k - 1].e, s.s)}
                    <span data-sent={`${i}.${k}`} role={unit === "sentence" ? "button" : undefined} tabIndex={unit === "sentence" ? 0 : undefined}
                      title={locked ? "Matches a source: click to see the source and fix it" : undefined}
                      onMouseUp={unit === "sentence" ? () => pick(r, s) : undefined}
                      onKeyDown={unit === "sentence" ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(s); } } : undefined}
                      className={cx("rounded", unit === "sentence" && "cursor-pointer hover:bg-soft", on && "bg-accent/15 ring-1 ring-accent", locked && "bg-high/12 underline decoration-high/60 decoration-2 underline-offset-4")}>
                      {locked && <Lock size={12} className="mr-0.5 inline align-[-1px] text-high" aria-hidden />}
                      {p.text.slice(s.s, s.e)}
                    </span>
                  </span>;
                })}
              </div>
            );
          })}
        </div>
      </article>
      <aside className="grid min-w-0 gap-3.5 min-[1000px]:sticky min-[1000px]:top-[72px]" aria-label="Rewrite tools">
        {p.renderPanel(picked)}
        {flaggedCount > 0 && <Card className="text-[13.5px]" id="rewriteFlagged">
          <h3 className="flex items-center gap-1.5 font-semibold"><Lock size={14} className="text-high" />{flaggedCount} sentence{flaggedCount > 1 ? "s" : ""} match a source
            {p.index != null && <span className="ml-auto text-[12.5px] font-normal text-mute">Similarity {p.index}%</span>}</h3>
          <p className="mt-1 text-mute">They are highlighted in red. Click one to see the source and fix it: quote and cite it, or rewrite it in your own words. AI rewriting stays off for these, because reworded copying is still copying. Your other sentences can be rewritten with AI.</p>
          <p className="mt-1 text-[12.5px] text-mute">Similarity is a signal, not proof of plagiarism.</p>
          <Button size="sm" className="mt-2 w-full" onClick={p.onOpenPlagiarism} id="openPlagiarism"><FileSearch size={14} />Full plagiarism report</Button>
        </Card>}
      </aside>
    </div>
  );
}
