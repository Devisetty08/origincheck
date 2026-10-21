"use client";
// Rewrite: click a sentence or a paragraph (or select any text) on the left; the panel on the right shows the
// original next to the suggestion. Only the parts that match a source are locked: those you rewrite yourself.
import { type ReactNode, useMemo, useState } from "react";
import { FileSearch, Lock } from "lucide-react";
import { Button, Card, cx } from "./ui";

type Range = { s: number; e: number };
interface Props {
  text: string;
  flagged: [number, number][];
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
  const [picked, setPicked] = useState<Range | null>(null);
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
                      title={locked ? "Matches a source: rewrite this yourself in the plagiarism check" : undefined}
                      onMouseUp={unit === "sentence" ? () => pick(r, s) : undefined}
                      onKeyDown={unit === "sentence" ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(s); } } : undefined}
                      className={cx("rounded", unit === "sentence" && "cursor-pointer hover:bg-soft", on && "bg-accent/15 ring-1 ring-accent", locked && "cp text-mute")}>
                      {locked && <Lock size={12} className="mr-0.5 inline align-[-1px] text-close" aria-hidden />}
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
          <h3 className="flex items-center gap-1.5 font-semibold"><Lock size={14} className="text-close" />{flaggedCount} locked sentence{flaggedCount > 1 ? "s" : ""}</h3>
          <p className="mt-1 text-mute">These contain wording that matches a source. Quote and cite them, or rewrite them in your own words in the plagiarism check, which compares your wording with the source as you type. Every other sentence can be rewritten here.</p>
          <Button size="sm" className="mt-2 w-full" onClick={p.onOpenPlagiarism} id="openPlagiarism"><FileSearch size={14} />Open plagiarism check</Button>
        </Card>}
      </aside>
    </div>
  );
}
