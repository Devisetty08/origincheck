"use client";
// Write: origincheck's own editor. Writing history (if on) records how the text develops here: snapshots after a
// pause, and whether each part was typed, pasted or AI-assisted. Nothing outside this editor is recorded.
import { type ReactNode, useMemo, useState } from "react";
import { diffWords } from "diff";
import { Circle, Download, History, Save, Trash2 } from "lucide-react";
import { type History as WH, NOTE, ORIGIN_LABEL, type Origin, exportReport, summary, textAt } from "@/lib/writingHistory";
import { baseName, download } from "@/lib/exporters";
import { Button, Card, cx } from "./ui";

const ORIGIN_COLOR: Record<Origin, string> = { typed: "bg-low", pasted: "bg-mid", ai: "bg-close", imported: "bg-accent" };

interface Props {
  title: string;
  text: string;
  onChange: (next: string, origin: Origin) => void;
  history: WH | null;
  on: boolean;
  setOn: (v: boolean) => void;
  onSnapshot: () => void;
  onDelete: () => void;
  /** Passages that match a source, shown above the history (when a plagiarism check has run). */
  matches?: ReactNode;
}

export default function WritePage(p: Props) {
  return (
    <div className="grid grid-cols-1 items-start gap-5 min-[1000px]:grid-cols-[minmax(0,1fr)_360px]">
      <article className="min-w-0 rounded-xl border border-line bg-panel p-3 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <p className={cx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium", p.on ? "bg-low/12 text-low" : "bg-soft text-mute")} id="historyIndicator" role="status">
            <Circle size={9} className={p.on ? "fill-current" : ""} aria-hidden />{p.on ? "Writing history is on" : "Writing history is off"}</p>
          <span className="text-[12px] text-mute">{p.text.split(/\s+/).filter(Boolean).length.toLocaleString()} words</span>
        </div>
        <textarea id="writeEditor" aria-label="Your text" value={p.text} spellCheck
          placeholder="Start writing here. Grammar, plagiarism and the other checks update as you go."
          className="min-h-[65vh] w-full resize-y rounded-lg border border-line bg-bg p-3 font-serif text-[16px] leading-[1.8]"
          onChange={(e) => {
            const kind = (e.nativeEvent as InputEvent).inputType ?? "";
            p.onChange(e.target.value, kind === "insertFromPaste" || kind === "insertFromDrop" || kind === "insertFromPasteAsQuotation" ? "pasted" : "typed");
          }} />
      </article>
      <aside className="grid min-w-0 gap-3.5 min-[1000px]:sticky min-[1000px]:top-[72px]" aria-label="Matches and writing history">
        {p.matches}
        <HistoryPanel {...p} />
      </aside>
    </div>
  );
}

function HistoryPanel(p: Props) {
  const h = p.history;
  const [at, setAt] = useState<number | null>(null);
  const s = h ? summary(h) : null;
  const last = h ? h.snapshots.length - 1 : 0;
  const i = at == null ? last : Math.min(at, last);
  const view = useMemo(() => {
    if (!h) return null;
    const cur = textAt(h, i), prev = i > 0 ? textAt(h, i - 1) : "";
    return { cur, parts: diffWords(prev, cur) };
  }, [h, i]);

  const exportJson = () => h && download(`${baseName(h.title)}_writing_history.json`, JSON.stringify(exportReport(h), null, 2), "application/json");
  const exportPdf = async () => {
    if (!h) return;
    const r = exportReport(h);
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "pt", format: "a4" });
    let y = 56;
    const line = (t: string, size = 11, bold = false) => {
      pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size);
      for (const l of pdf.splitTextToSize(t, 480)) { if (y > 790) { pdf.addPage(); y = 56; } pdf.text(l, 56, y); y += size * 1.45; }
    };
    line(`Writing history: ${r.title}`, 16, true);
    line(`Started ${new Date(r.started).toLocaleString()} · report made ${new Date(r.generated).toLocaleString()}`, 9);
    y += 8;
    line("Summary", 12, true);
    line(r.summary.line);
    line(`About ${r.summary.minutes} minutes of writing in ${r.summary.sessions} session${r.summary.sessions === 1 ? "" : "s"}; ${r.summary.snapshots} saved versions; ${r.summary.pastes} pastes${r.summary.largestPaste ? ` (largest ${r.summary.largestPaste} characters)` : ""}.`);
    y += 8;
    line("Versions", 12, true);
    for (const m of r.milestones) line(`${new Date(m.at).toLocaleString()} — ${m.words} words (${m.reason})`, 10);
    if (r.pastes.length) { y += 8; line("Pastes", 12, true); for (const x of r.pastes) line(`${new Date(x.at).toLocaleString()} — ${x.characters} characters`, 10); }
    y += 12;
    line(r.note, 10, true);
    pdf.save(`${baseName(h.title)}_writing_history.pdf`);
  };

  return (
    <Card className="text-[13.5px]" id="historyPanel">
      <h3 className="flex items-center gap-1.5 font-semibold"><History size={15} />Writing history</h3>
      <label className="mt-2 flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 size-4.5 accent-accent" checked={p.on} onChange={(e) => p.setOn(e.target.checked)} id="historyToggle" />
        <span>Record how this document develops<span className="block text-[12px] text-mute">Only in this editor and origincheck&apos;s own tools, only in this browser. No keystrokes, nothing outside origincheck, nothing sent anywhere.</span></span>
      </label>

      {h && s ? <>
        <div className="mt-3" id="historySummary">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-soft" aria-hidden>
            {(["typed", "pasted", "ai", "imported"] as Origin[]).map((o) => <i key={o} className={ORIGIN_COLOR[o]} style={{ width: `${s.share[o]}%` }} />)}
          </div>
          <p className="mt-1.5" data-summary>
            {(["typed", "pasted", "ai", "imported"] as Origin[]).filter((o) => s.share[o] || o !== "imported").map((o) => `${s.share[o]}% ${ORIGIN_LABEL[o]}`).join(", ")}</p>
          <p className="text-[12px] text-mute">About {s.minutes} min of writing · {s.sessions} session{s.sessions === 1 ? "" : "s"} · {s.pastes} paste{s.pastes === 1 ? "" : "s"}</p>
        </div>

        <div className="mt-3 border-t border-line pt-3">
          <div className="flex items-center justify-between text-[12.5px]">
            <span className="font-semibold">Version {i + 1} of {last + 1}</span>
            <span className="text-mute">{new Date(h.snapshots[i].at).toLocaleString()} · {h.snapshots[i].words} words</span>
          </div>
          <input type="range" min={0} max={last} value={i} onChange={(e) => setAt(Number(e.target.value))} aria-label="Version" className="mt-1 w-full accent-accent" id="historySlider" disabled={!last} />
          <div className="mt-1 max-h-56 overflow-auto rounded-lg border border-line bg-bg p-2 font-serif text-[13px] leading-[1.6] whitespace-pre-wrap" id="historyDiff">
            {view?.parts.map((x, k) => x.added ? <ins key={k} className="bg-low/15 text-low no-underline">{x.value}</ins>
              : x.removed ? <del key={k} className="text-high">{x.value}</del> : <span key={k}>{x.value}</span>)}
            {!view?.cur && <span className="font-sans text-mute">Empty.</span>}
          </div>
          <p className="mt-1 text-[11.5px] text-mute">Green: added in this version. Red: removed.</p>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" onClick={p.onSnapshot} disabled={!p.on} id="historySave"><Save size={14} />Save version</Button>
          <Button size="sm" onClick={exportPdf} id="historyPdf"><Download size={14} />PDF</Button>
          <Button size="sm" onClick={exportJson} id="historyJson"><Download size={14} />JSON</Button>
          <Button size="sm" variant="ghost" id="historyDelete" onClick={() => { if (confirm("Delete this document's writing history from this browser? This can't be undone.")) p.onDelete(); }}>
            <Trash2 size={14} />Delete</Button>
        </div>
        <p className="mt-2 text-[11.5px] text-mute">{NOTE}</p>
      </> : <p className="mt-2 text-mute">Loading…</p>}
    </Card>
  );
}
