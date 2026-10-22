"use client";
// The guided rewrite editor. The user writes the new sentence; the editor only measures how close it is to the source,
// keeps the citation, and asks questions about the user's own work. It never suggests wording.
import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { Style } from "@/lib/citations";
import { type PSource, citeFor, findCites } from "@/lib/paragraph/citations";
import { addCitation } from "@/lib/paragraph/fixes";
import { type Level, type Options, assessRewrite } from "@/lib/paragraph/rules";
import { Button, Dialog, cx, inputCls } from "../ui";

export const HINTS = [
  "How did this apply in your project?",
  "Why did your team choose this option?",
  "What result or decision followed from this?",
  "Can you explain this the way you'd explain it to a colleague?",
  "Put your own point first, then use the source as support.",
];
const LABEL: Record<Level, string> = { "too-close": "Too close", borderline: "Borderline", original: "Original wording" };
const BG: Record<Level, string> = { "too-close": "bg-high", borderline: "bg-mid", original: "bg-low" };

interface Props {
  original: string; sid: number; sources: PSource[]; sourcePassage: string; style: Style; opts: Options;
  onApply: (mine: string) => void; onCancel: () => void;
}

export default function RewriteEditor(p: Props) {
  const [mine, setMine] = useState("");
  const [show, setShow] = useState(false);
  const src = p.sources[p.sid], cite = citeFor(p.sources, p.sid, p.style);
  const m = useMemo(() => assessRewrite(mine, src, p.opts), [mine, src, p.opts]);
  const hasCite = findCites(mine, p.sources).some((c) => c.src === p.sid);
  const final = () => { const t = mine.trim(); return hasCite ? t : addCitation(t, 0, t.length, cite).text; };

  return (
    <Dialog open onOpenChange={(o) => !o && p.onCancel()} wide title="Rewrite in my own words"
      description="Write the idea your own way. origincheck checks your wording and keeps the citation; it never writes the sentence for you.">
      <div className="grid gap-3 text-[13.5px]" id="pRewrite">
        <details open className="rounded-lg bg-soft p-2.5">
          <summary className="cursor-pointer font-semibold">Your original sentence</summary>
          <p className="mt-1 font-serif text-[14.5px] text-mute" id="pRewriteOriginal">{p.original}</p>
        </details>
        <div className="rounded-lg border border-line p-2.5">
          <div className="flex items-center gap-2">
            <b className="flex-1">Source {p.sid + 1}: {src.title}</b>
            <Button size="sm" variant="ghost" onClick={() => setShow(!show)} aria-expanded={show} id="pShowSource">{show ? <EyeOff size={14} /> : <Eye size={14} />}{show ? "Hide source" : "Show source"}</Button>
          </div>
          {show ? <p className="mt-1 font-serif text-[14.5px]">{p.sourcePassage}</p>
            : <p className="mt-0.5 text-mute">Writing without looking at the source keeps your wording original.</p>}
        </div>
        <label className="grid gap-1 font-medium">Your sentence
          <textarea className={cx(inputCls, "min-h-28 font-serif text-[15px]")} value={mine} onChange={(e) => setMine(e.target.value)} autoFocus id="pRewriteText"
            placeholder="Start with your own point…" />
        </label>
        <div aria-live="polite" id="pMeter">
          <div className="flex items-center gap-2"><span className="font-semibold">Closeness:</span>
            <span className={cx("rounded-full px-2 py-0.5 text-xs font-bold text-white", m.level ? BG[m.level] : "bg-mute")} data-level={m.level ?? ""}>{m.level ? LABEL[m.level] : "Start writing"}</span>
            <span className="text-mute">{m.reason}</span></div>
          <p className="mt-1.5" id="pCiteGuard">{hasCite ? <>✓ Citation kept: <b>{cite}</b></> : <>The citation <b>{cite}</b> will be added. Rewritten ideas still need a citation.</>}</p>
        </div>
        <div>
          <div className="font-semibold">Questions to get you started</div>
          <ul className="mt-1 grid gap-0.5 text-mute">{HINTS.map((h) => <li key={h}>• {h}</li>)}</ul>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={p.onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!mine.trim()} onClick={() => p.onApply(final())} id="pRewriteApply">Apply</Button>
        </div>
      </div>
    </Dialog>
  );
}
