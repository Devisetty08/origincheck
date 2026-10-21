"use client";
// Rewrite: click a paragraph (or select any text) on the left; the panel on the right shows the
// original next to the suggestion. Passages that match a source are locked: those you rewrite yourself.
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

export default function RewriteTab(p: Props) {
  const [picked, setPicked] = useState<Range | null>(null);
  const paras = useMemo(() => paragraphs(p.text), [p.text]);
  const overlaps = (r: Range) => p.flagged.some(([a, b]) => a < r.e && b > r.s);
  const flaggedCount = paras.filter(overlaps).length;

  // a mouse selection inside the document wins over clicking the whole paragraph
  const fromSelection = (): Range | null => {
    const t = window.getSelection()?.toString().trim() ?? "";
    if (t.length < 3) return null;
    const s = p.text.indexOf(t); // ponytail: first occurrence; a repeated passage resolves to its first copy
    return s < 0 ? null : { s, e: s + t.length };
  };

  return (
    <div className="grid grid-cols-1 items-start gap-5 min-[1000px]:grid-cols-[minmax(0,1fr)_400px]">
      <article className="min-w-0 rounded-xl border border-line bg-panel px-3 py-4 sm:px-6">
        <p className="no-print mb-2 px-2 text-[13px] text-mute">Click a paragraph to rewrite it, or select part of one with your mouse.</p>
        <div id="rwDoc" className="grid gap-1 font-serif text-[16px] leading-[1.8]">
          {paras.map((r, i) => {
            const locked = overlaps(r), on = picked && picked.s >= r.s && picked.e <= r.e;
            return (
              <div key={r.s} role="button" tabIndex={0} data-para={i} aria-pressed={!!on}
                aria-label={locked ? "Paragraph that matches a source" : undefined}
                onMouseUp={() => { const sel = fromSelection(); setPicked(sel && sel.s >= r.s && sel.e <= r.e ? sel : r); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(r); } }}
                className={cx("cursor-pointer rounded-lg border-l-4 px-3 py-1.5 whitespace-pre-wrap wrap-anywhere transition",
                  on ? "border-accent bg-soft" : "border-transparent hover:bg-soft/60", locked && "text-mute")}>
                {locked && <Lock size={13} className="mr-1 inline align-[-1px] text-close" aria-hidden />}
                {p.text.slice(r.s, r.e)}
              </div>
            );
          })}
        </div>
      </article>
      <aside className="grid min-w-0 gap-3.5 min-[1000px]:sticky min-[1000px]:top-[72px]" aria-label="Rewrite tools">
        {p.renderPanel(picked)}
        {flaggedCount > 0 && <Card className="text-[13.5px]" id="rewriteFlagged">
          <h3 className="flex items-center gap-1.5 font-semibold"><Lock size={14} className="text-close" />{flaggedCount} locked paragraph{flaggedCount > 1 ? "s" : ""}</h3>
          <p className="mt-1 text-mute">These contain wording that matches a source. Fix them yourself in the plagiarism check: quote and cite, or rewrite in your own words.</p>
          <Button size="sm" className="mt-2 w-full" onClick={p.onOpenPlagiarism} id="openPlagiarism"><FileSearch size={14} />Open plagiarism check</Button>
        </Card>}
      </aside>
    </div>
  );
}
