"use client";
// Rewrite: revise your own wording with AI (Improve my writing), and find the passages that match sources,
// which you rewrite yourself in the plagiarism check (AI revision is off for those).
import type { ReactNode } from "react";
import { FileSearch } from "lucide-react";
import { Button, Card } from "./ui";

interface Props {
  text: string;
  flagged: [number, number][];
  onOpenPlagiarism: () => void;
  children: ReactNode; // the Improve my writing card
}

export default function RewriteTab(p: Props) {
  // merge overlapping flagged ranges, then render the text with them marked
  const ranges = [...p.flagged].sort((a, b) => a[0] - b[0]).reduce<[number, number][]>((acc, [s, e]) => {
    const last = acc[acc.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e); else acc.push([s, e]);
    return acc;
  }, []);
  const parts: ReactNode[] = [];
  let pos = 0;
  ranges.forEach(([s, e], i) => {
    parts.push(p.text.slice(pos, s));
    parts.push(<mark key={i} className="cp bg-transparent text-inherit" title="Matches a source: rewrite this yourself in the plagiarism check">{p.text.slice(s, e)}</mark>);
    pos = e;
  });
  parts.push(p.text.slice(pos));

  return (
    <div className="grid grid-cols-1 items-start gap-5 min-[1000px]:grid-cols-[minmax(0,1fr)_340px]">
      <article className="min-w-0 rounded-xl border border-line bg-panel px-4 py-5 sm:px-8">
        <p className="no-print mb-3 text-[13px] text-mute">Select a passage with your mouse, then choose a goal on the right.
          {ranges.length > 0 && <> <span className="cp">Dashed</span> passages match a source.</>}</p>
        <div id="rwDoc" className="font-serif text-[16.5px] leading-[1.9] whitespace-pre-wrap wrap-anywhere">{parts}</div>
      </article>
      <aside className="grid min-w-0 gap-3.5 min-[1000px]:sticky min-[1000px]:top-[72px]" aria-label="Rewrite tools">
        {p.children}
        <Card className="text-[13.5px]" id="rewriteFlagged">
          <h3 className="flex items-center gap-1.5 font-semibold"><FileSearch size={15} />Passages that match sources</h3>
          {ranges.length
            ? <p className="mt-1 text-mute">{ranges.length} passage{ranges.length > 1 ? "s" : ""} match{ranges.length > 1 ? "" : "es"} a source. Fix these yourself:
                open the passage in the plagiarism check and choose <b>Mark as quoted &amp; cited</b> or <b>Rewrite in my own words</b>,
                which compares your new wording with the source as you type. AI revision is turned off for them.</p>
            : <p className="mt-1 text-mute">No passages match your sources so far. Run the plagiarism check with sources to find any.</p>}
          <Button size="sm" className="mt-2 w-full" onClick={p.onOpenPlagiarism} id="openPlagiarism"><FileSearch size={14} />Open plagiarism check</Button>
        </Card>
      </aside>
    </div>
  );
}
