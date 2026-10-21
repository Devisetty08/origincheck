"use client";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Copy, FileDown, Quote, PenLine, Trash2, Undo2, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { type CiteMeta, type Passage, type Settings, type Source, KIND_LABEL, bibStart, sourceSpan } from "@/lib/engine";
import { type Style, STYLE_LABEL, checkCitations, findCitations, findEntries, orderForList, reference, segText } from "@/lib/citations";
import { closeness } from "@/lib/closeness";
import { feedback } from "@/lib/writing";
import { PALETTE, band, exportDocx, exportSummaryPdf, pctText, settingsText } from "@/lib/exporters";
import type { Prefs } from "@/lib/store";
import { plural } from "@/lib/words";
import { Button, Card, Check, NumberField, Tabs, cx } from "./ui";
import type { Doc, Recheck, Resolution, RunState } from "./App";
import { CitationDialog, ParaphraseDialog } from "./Dialogs";

export interface Ctx { style: Style; metaFor: (s: Source) => CiteMeta | undefined; ieeeN: (name: string) => number }
interface Props {
  doc: Doc; run: RunState; ctx: Ctx; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void;
  citeFor: (s: Source, fresh?: CiteMeta, commit?: boolean) => string;
  recompute: (patch: Partial<Pick<RunState, "settings" | "skip">>) => void;
  applyEdit: (s: number, e: number, rep: string, res: Omit<Resolution, "id" | "at">, recheckOf?: { sid: number; mine?: string; sourcePassage?: string }) => void;
  undo: () => void;
  saveDoc: (own: boolean) => Promise<boolean | undefined>;
  saveMeta: (name: string, m: CiteMeta) => void;
  saveDraft: (label: string) => Promise<void>;
}
type Sel = { kind: "m" | "c"; sid: number; idx: number } | null;
type Remedy = "quote" | "paraphrase" | "remove";

const words = (s: string) => s.split(/\s+/).filter(Boolean);
const excerpt = (s: string, n = 16) => { const w = words(s); return w.slice(0, n).join(" ") + (w.length > n ? " …" : ""); };

export default function Report(p: Props) {
  const { doc, run } = p, { r, all } = run;
  const [tab, setTab] = useState("overview");
  const [sel, setSel] = useState<Sel>(null);
  const [para, setPara] = useState<Passage | null>(null);
  const [citeEdit, setCiteEdit] = useState<{ sid: number; then?: { remedy: Remedy; p: Passage } } | null>(null);
  const docRef = useRef<HTMLDivElement>(null);

  const num = useMemo(() => new Map(r.order.map((s, i) => [s, i + 1])), [r.order]);
  const color = useMemo(() => new Map(r.order.map((s, i) => [s, PALETTE[i % PALETTE.length]])), [r.order]);
  const bySource = (sid: number, kind: "m" | "c") => (kind === "m" ? r.passages : r.close).filter((x) => x.sid === sid);
  const selected = sel ? bySource(sel.sid, sel.kind)[sel.idx] : undefined;

  // Selection follows edits: drop it if the passage is gone.
  useEffect(() => { if (sel && !selected) setSel(null); }, [sel, selected]);
  useEffect(() => {
    if (!selected) return;
    const el = docRef.current?.querySelector<HTMLElement>(`[data-pid="${selected.id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" });
    el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash");
  }, [selected]);

  const select = (sid: number, kind: "m" | "c", idx: number) => {
    const n = bySource(sid, kind).length;
    if (n) { setSel({ kind, sid, idx: (idx + n) % n }); setTab("overview"); }
  };

  /* ---------- document with highlights ---------- */
  const segments = useMemo(() => {
    const out: React.ReactNode[] = [];
    const { text, toks } = doc;
    const close = new Map(r.close.map((c) => [c.b, c]));
    const pass = new Map(r.passages.map((x) => [x.b, x]));
    let pos = 0;
    for (let i = 0; i < toks.length; ) {
      const m = pass.get(i), c = close.get(i);
      if (m) {
        out.push(text.slice(pos, m.s));
        out.push(<mark key={m.id} className="m" data-pid={m.id} tabIndex={0} title={all[m.sid].name} style={{ ["--c" as string]: color.get(m.sid) }}
          data-sid={m.sid} data-kind="m"><sup>{num.get(m.sid)}</sup>{text.slice(m.s, m.end)}</mark>);
        pos = m.end; i = m.e;
      } else if (c) {
        out.push(text.slice(pos, c.s));
        out.push(<span key={c.id} className="cp" data-pid={c.id} tabIndex={0} data-sid={c.sid} data-kind="c" title={`Possible close paraphrase of ${all[c.sid].name}`}>{text.slice(c.s, c.end)}</span>);
        pos = c.end; i = c.e;
      } else if (r.excl.has(i)) {
        let j = i;
        while (j + 1 < toks.length && r.excl.get(j + 1) === r.excl.get(i) && !pass.has(j + 1)) j++;
        out.push(text.slice(pos, toks[i].s));
        out.push(<span key={`x${i}`} className="ex" title={`Excluded: ${r.excl.get(i)}`}>{text.slice(toks[i].s, toks[j].e)}</span>);
        pos = toks[j].e; i = j + 1;
      } else i++;
    }
    out.push(text.slice(pos));
    return out;
  }, [doc, r, all, color, num]);

  const onDocActivate = (el: HTMLElement | null) => {
    const m = el?.closest<HTMLElement>("[data-pid]");
    if (!m) return;
    const sid = Number(m.dataset.sid), kind = m.dataset.kind as "m" | "c";
    select(sid, kind, bySource(sid, kind).findIndex((x) => x.id === m.dataset.pid));
  };

  /* ---------- remedies ---------- */
  const sourcePassage = (x: Passage, ctxWords = 0) => {
    const src = all[x.sid], [j0, j1] = sourceSpan(r, x, src), st = src.toks;
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

  const b = band(r.index);
  const byKind: Record<string, number> = {};
  for (const s of r.order) byKind[all[s].kind] = (byKind[all[s].kind] ?? 0) + r.counts.get(s)!;
  const kinds = (Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).filter((k) => ["file", "paste", "internet", "saved"].includes(k) || byKind[k] || all.some((s) => s.kind === k));
  const skippedWithRuns = [...run.skip].filter((s) => r.runs.has(s));
  const toggleSkip = (s: number) => { const skip = new Set(run.skip); if (skip.has(s)) skip.delete(s); else skip.add(s); p.recompute({ skip }); };

  const overview = (
    <div>
      <div className="grid gap-2" aria-label="Breakdown by source type">
        {kinds.map((k) => {
          const pc = (100 * (byKind[k] ?? 0)) / r.total;
          return <div key={k} className="grid grid-cols-[118px_1fr_38px] items-center gap-2 text-[13px]">
            <span>{KIND_LABEL[k]}</span>
            <span className="h-[7px] overflow-hidden rounded-full bg-soft"><i className="block h-full rounded-full bg-accent" style={{ width: `${pc.toFixed(1)}%` }} /></span>
            <b className="text-right font-semibold">{pctText(pc)}</b>
          </div>;
        })}
      </div>
      {byKind.own ? <p className="mt-3 flex gap-2 rounded-lg bg-soft p-2.5 text-[13px]"><Info size={16} className="shrink-0 text-accent" aria-hidden />Matches with your own earlier work still need a citation, or your institution’s approval to reuse.</p> : null}

      {selected && <Detail />}

      <ul className="-mx-5 mt-4 -mb-5" id="srcRank" aria-label="Matched sources">
        {r.order.map((s) => <SourceRow key={s} s={s} />)}
        {skippedWithRuns.map((s) => <SourceRow key={s} s={s} off />)}
        {!r.order.length && !skippedWithRuns.length && <li className="border-t border-line px-5 py-3 text-sm text-mute">No matching passages found.</li>}
        {r.close.length > 0 && <li className="border-t border-line px-5 py-3">
          <div className="text-sm font-semibold"><span className="cp">Possible close paraphrase</span> · not counted in the index</div>
          <ul className="mt-1.5 grid gap-1">
            {r.close.map((c) => <li key={c.id}>
              <button className="w-full truncate text-left text-[13px] text-accent hover:underline cursor-pointer" onClick={() => select(c.sid, "c", bySource(c.sid, "c").indexOf(c))}>
                “{excerpt(doc.text.slice(c.s, c.end), 9)}” — {all[c.sid].name}
              </button>
            </li>)}
          </ul>
        </li>}
      </ul>
    </div>
  );

  function SourceRow({ s, off }: { s: number; off?: boolean }) {
    const src = all[s], c = r.counts.get(s) ?? 0;
    return (
      <li className={cx("border-t border-line px-5 py-2.5", sel?.sid === s && sel.kind === "m" && "bg-soft", off && "opacity-65")}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-6 min-w-6 place-items-center rounded-md px-1 text-xs font-bold text-white" style={{ background: off ? "var(--mute)" : color.get(s) }}>{off ? "–" : num.get(s)}</span>
          <div className="min-w-0 flex-1">
            <div className={cx("truncate text-sm font-semibold", off && "line-through")} title={src.name}>{src.name}</div>
            <div className="text-[12.5px] text-mute">{KIND_LABEL[src.kind]} · {off ? "excluded" : `${c.toLocaleString()} matched words`}</div>
          </div>
          {!off && <span className="text-[17px] font-bold">{pctText((100 * c) / r.total)}</span>}
        </div>
        <div className="no-print mt-1 ml-[34px] flex gap-3.5">
          {off ? <Button variant="link" onClick={() => toggleSkip(s)}>Include again</Button>
            : <><Button variant="link" onClick={() => select(s, "m", 0)}>View matches</Button><Button variant="link" onClick={() => toggleSkip(s)}>Exclude source</Button></>}
        </div>
      </li>
    );
  }

  function Detail() {
    if (!selected || !sel) return null;
    const list = bySource(sel.sid, sel.kind), src = all[sel.sid];
    const sp = sourcePassage(selected, 25), mine = doc.text.slice(selected.s, selected.end);
    const guide = closeness(mine, sp.match);
    const c = sel.kind === "m" ? color.get(sel.sid)! : "var(--close)";
    return (
      <div className="no-print mt-4 rounded-lg border border-line p-3" style={{ ["--c" as string]: c }} id="detail">
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold" title={src.name}>{sel.kind === "m" ? `${num.get(sel.sid)}. ` : ""}{src.name}</h3>
            <div className="text-[12.5px] text-mute">{sel.kind === "c" ? "Possible close paraphrase (not counted)" : KIND_LABEL[src.kind]}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSel(null)}>Show all</Button>
        </div>
        <div className="mt-2 flex items-center gap-1.5">
          <Button size="sm" aria-label="Previous match" onClick={() => select(sel.sid, sel.kind, sel.idx - 1)}><ChevronLeft size={16} /></Button>
          <span className="min-w-12 text-center text-[13px] text-mute" id="dCount">{sel.idx + 1} / {list.length}</span>
          <Button size="sm" aria-label="Next match" onClick={() => select(sel.sid, sel.kind, sel.idx + 1)}><ChevronRight size={16} /></Button>
        </div>
        <div className="mt-2.5 grid gap-2 text-[14px] leading-relaxed">
          <div>
            <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-mute">Your text</div>
            <p className="rounded-md bg-bg p-2.5 font-serif">{mine}</p>
          </div>
          <div>
            <div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-mute">In the source</div>
            <p className="rounded-md border-l-4 bg-bg p-2.5 font-serif" style={{ borderColor: c }} id="dPassage">
              {sp.before}<mark className="rounded-sm" style={{ background: `color-mix(in srgb, ${c} 22%, transparent)`, color: "inherit" }}>{sp.match}</mark>{sp.after}
            </p>
          </div>
        </div>
        <ul className="mt-2.5 grid gap-1 text-[13px]">
          {guide.reasons.map((x) => <li key={x} className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-mid" aria-hidden />{x}</li>)}
          <li className="flex gap-1.5 text-mute"><Info size={14} className="mt-0.5 shrink-0" aria-hidden />Start with your own point, then use the source as evidence — quoted or in your own words, and cited.</li>
        </ul>
        {sel.kind === "m" && <Remedies x={selected} />}
      </div>
    );
  }

  function Remedies({ x, compact }: { x: Passage; compact?: boolean }) {
    return (
      <div className={cx("flex flex-wrap gap-1.5", compact ? "mt-1.5" : "mt-3")}>
        <Button size="sm" onClick={() => remedy("quote", x)}><Quote size={14} />Quote and cite</Button>
        <Button size="sm" onClick={() => remedy("paraphrase", x)}><PenLine size={14} />Paraphrase and cite</Button>
        <Button size="sm" variant="danger" onClick={() => remedy("remove", x)}><Trash2 size={14} />Remove</Button>
      </div>
    );
  }

  /* ---------- revise ---------- */
  const resolved = run.resolutions.length, open = r.passages.length, totalFlagged = resolved + open;
  const [draftLabel, setDraftLabel] = useState("");
  const [savedDraft, setSavedDraft] = useState(false);
  const citedSources = useMemo(() => {
    const b0 = bibStart(doc.text), body = b0 >= 0 ? doc.text.slice(0, b0) : doc.text;
    const keys = new Set(findCitations(body).map((c) => c.key));
    const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    return all.map((s, i) => ({ s, i, meta: p.ctx.metaFor(s), n: p.ctx.ieeeN(s.name) }))
      .filter((x) => x.s.kind !== "draft" && x.meta?.title)
      .filter((x) => keys.has(`#${x.n}`) || (x.meta!.authors[0] && keys.has(`${norm(x.meta!.authors[0].family)}|${x.meta!.year?.trim() || "n.d."}`))
        || norm(body).includes(norm(x.meta!.title.split(/\s+/).slice(0, 4).join(" "))))
      .map((x) => ({ ...x, meta: x.meta! }));
  }, [all, doc.text, p.ctx]);

  const exportWord = () => {
    const entries = findEntries(doc.text);
    // An existing entry counts only if a reader could find it from the in-text citation (same key the checker uses).
    const missing = citedSources.filter((c) => {
      const fam = c.meta.authors[0]?.family?.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
      return !entries.some((e) => p.ctx.style === "ieee" ? e.keys.includes(`#${c.n}`) : fam ? e.fam === fam && e.year === (c.meta.year?.trim() ?? "") : e.text.toLowerCase().includes(c.meta.title.toLowerCase().slice(0, 40)));
    });
    exportDocx({ docName: doc.name, text: doc.text, headings: doc.headings, style: p.ctx.style, hasBib: bibStart(doc.text) >= 0,
      refs: orderForList(missing, p.ctx.style).map((c) => reference(c.meta, p.ctx.style, c.n)) });
  };
  const exportSummary = () => exportSummaryPdf({
    docName: doc.name, checked: run.checked, startIndex: run.startIndex, index: r.index, sources: all, r, settings: run.settings, style: p.ctx.style,
    resolved,
    rows: [
      ...run.resolutions.map((x) => ({ excerpt: x.excerpt, source: x.source, status: x.action === "cited" ? "resolved – quoted and cited" : x.action === "rewritten" ? "resolved – paraphrased and cited" : "resolved – removed" })),
      ...r.passages.map((x) => ({ excerpt: excerpt(doc.text.slice(x.s, x.end), 22), source: all[x.sid].name, status: "open – not yet resolved" })),
    ],
  });

  const revise = (
    <div className="grid gap-4">
      <div>
        <div className="flex items-baseline justify-between text-sm"><b>{resolved} of {totalFlagged} flagged passages resolved</b><span className="text-mute">index {run.startIndex}% → <b className="text-ink">{r.index}%</b></span></div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuemin={0} aria-valuemax={totalFlagged} aria-valuenow={resolved} aria-label="Revision progress">
          <i className="block h-full rounded-full bg-low transition-all" style={{ width: `${totalFlagged ? (100 * resolved) / totalFlagged : 100}%` }} />
        </div>
      </div>
      <p className="flex gap-2 rounded-lg bg-soft p-2.5 text-[13px]"><Info size={16} className="shrink-0 text-accent" aria-hidden />
        A moderate score made up of correctly quoted and cited material is normal and acceptable. The goal is that every borrowed idea is credited — not 0%.</p>
      {run.recheck && <RecheckCard rc={run.recheck} />}
      <div className="flex flex-wrap gap-1.5 no-print">
        <Button size="sm" onClick={p.undo} disabled={!run.undo.length}><Undo2 size={14} />Undo</Button>
        <Button size="sm" onClick={exportWord}><FileDown size={14} />Export .docx</Button>
        <Button size="sm" onClick={exportSummary}><FileDown size={14} />Self-check summary (PDF)</Button>
      </div>
      <div className="no-print flex flex-wrap items-center gap-1.5">
        <input className="h-8 min-w-0 flex-1 rounded-md border border-line bg-bg px-2 text-sm" placeholder="Version label, e.g. Draft 2 after revision" aria-label="Draft label" value={draftLabel} onChange={(e) => { setDraftLabel(e.target.value); setSavedDraft(false); }} />
        <Button size="sm" variant="primary" disabled={savedDraft} onClick={async () => { await p.saveDraft(draftLabel.trim() || `Revised ${new Date().toLocaleString()}`); setSavedDraft(true); }}>{savedDraft ? "Saved" : "Save as new draft"}</Button>
      </div>
      <div>
        <h3 className="text-sm font-semibold">Still flagged ({open})</h3>
        {!open && <p className="mt-1 text-[13px] text-mute">Nothing left to resolve.</p>}
        <ul className="mt-1.5 grid gap-2">
          {r.passages.map((x) => <li key={x.id} className="rounded-lg border border-line p-2.5" style={{ ["--c" as string]: color.get(x.sid) }}>
            <button className="text-left text-[13px] cursor-pointer hover:underline" onClick={() => select(x.sid, "m", bySource(x.sid, "m").indexOf(x))}>
              <span className="mr-1.5 inline-grid h-5 min-w-5 place-items-center rounded px-1 text-[11px] font-bold text-white" style={{ background: color.get(x.sid) }}>{num.get(x.sid)}</span>
              “{excerpt(doc.text.slice(x.s, x.end), 14)}”
            </button>
            <div className="text-[12px] text-mute">{all[x.sid].name}</div>
            <Remedies x={x} compact />
          </li>)}
        </ul>
      </div>
      {resolved > 0 && <div>
        <h3 className="text-sm font-semibold">Resolved ({resolved})</h3>
        <ul className="mt-1.5 grid gap-1.5 text-[13px]">
          {run.resolutions.map((x) => <li key={x.id} className="flex gap-1.5"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-low" aria-hidden />
            <span><b className="font-semibold">{x.action === "cited" ? "Quoted and cited" : x.action === "rewritten" ? "Paraphrased and cited" : "Removed"}</b> · {x.source}<br /><span className="text-mute">“{x.excerpt}”</span></span></li>)}
        </ul>
      </div>}
    </div>
  );

  /* ---------- citations ---------- */
  const citeIssues = useMemo(() => checkCitations(doc.text, r.order.filter((s) => all[s].kind !== "draft").map((s) => ({ name: all[s].name, meta: p.ctx.metaFor(all[s]), n: p.ctx.ieeeN(all[s].name) }))),
    [doc.text, r.order, all, p.ctx]);
  const refList = orderForList(citedSources, p.ctx.style).map((c) => reference(c.meta, p.ctx.style, c.n));
  const [copied, setCopied] = useState(false);
  const citations = (
    <div className="grid gap-4">
      <label className="flex items-center gap-2 text-sm">Citation style
        <select className="h-8 rounded-md border border-line bg-bg px-2" value={p.ctx.style} onChange={(e) => p.setPrefs({ style: e.target.value as Style })}>
          {Object.entries(STYLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <div>
        <h3 className="text-sm font-semibold">Citation check</h3>
        {!citeIssues.length ? <p className="mt-1 flex gap-1.5 text-[13px] text-low"><CheckCircle2 size={15} className="mt-0.5" aria-hidden />No citation problems found.</p>
          : <ul className="mt-1.5 grid gap-1.5 text-[13px]" id="citeIssues">
            {citeIssues.map((x, i) => <li key={i} className="flex gap-1.5"><AlertTriangle size={14} className="mt-0.5 shrink-0 text-mid" aria-hidden />{x.message}</li>)}
          </ul>}
      </div>
      <div>
        <h3 className="text-sm font-semibold">Sources and citation details</h3>
        <ul className="mt-1.5 grid gap-1.5">
          {all.map((s, i) => s.kind === "draft" ? null : <li key={s.id} className="flex items-center gap-2 text-[13px]">
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium" title={s.name}>{s.name}</div>
              <div className="truncate text-mute">{p.ctx.metaFor(s)?.title ? segText(reference(p.ctx.metaFor(s)!, p.ctx.style, p.ctx.ieeeN(s.name))) : "No citation details yet"}</div>
            </div>
            <Button size="sm" onClick={() => setCiteEdit({ sid: i })}>{p.ctx.metaFor(s)?.title ? "Edit" : "Add details"}</Button>
          </li>)}
        </ul>
      </div>
      <div>
        <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">Reference list ({STYLE_LABEL[p.ctx.style]})</h3>
          {refList.length > 0 && <Button size="sm" variant="ghost" onClick={async () => { try { await navigator.clipboard.writeText(refList.map(segText).join("\n")); setCopied(true); } catch {} }}><Copy size={14} />{copied ? "Copied" : "Copy"}</Button>}</div>
        {!refList.length ? <p className="mt-1 text-[13px] text-mute">Sources you cite (with details added) appear here.</p>
          : <ol className="mt-1.5 grid gap-1.5 font-serif text-[14px]">{refList.map((ref, i) => <li key={i} className="pl-6 -indent-6">{ref.map((sg, k) => sg.i ? <i key={k}>{sg.t}</i> : <Fragment key={k}>{sg.t}</Fragment>)}</li>)}</ol>}
      </div>
    </div>
  );

  /* ---------- writing feedback ---------- */
  const fb = useMemo(() => (tab === "writing" ? feedback(doc.text) : null), [tab, doc.text]);
  const writing = fb && (
    <div className="grid gap-4 text-[13.5px]">
      <p className="text-mute">Advisory only — separate from the similarity report.</p>
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Reading ease" value={String(fb.flesch)} />
        <Stat label="Grade level" value={String(fb.grade)} />
        <Stat label="Passive" value={`${fb.passivePct}%`} />
      </div>
      <p>{fb.fleschLabel}. {plural(fb.words, "word")} in {plural(fb.sentences, "sentence")}, {Math.round(fb.words / Math.max(1, fb.sentences))} words per sentence on average.</p>
      <FbList title="Overly long sentences (35+ words)" items={fb.long.map((x) => `${x.words} words: ${excerpt(x.text, 18)}`)} empty="None." />
      <FbList title="Passive voice" items={fb.passive.map((x) => excerpt(x.text, 18))} empty="Little or none." note={fb.passivePct > 25 ? "Heavy use of passive voice. Try naming who does the action." : undefined} />
      <FbList title="Repeated words in a sentence" items={fb.repeated.map((x) => `“${x.word}”: ${excerpt(x.text, 14)}`)} empty="None." />
      <FbList title="Most-used words" items={fb.overused.map((x) => `${x.word} (${x.count}×)`)} empty="Nothing stands out." />
      <FbList title="Inconsistent terminology" items={fb.terms.map((t) => t.variants.map((v, i) => `${v} (${t.counts[i]})`).join(" vs "))} empty="None found." note={fb.terms.length ? "Pick one form and use it throughout." : undefined} />
    </div>
  );

  /* ---------- filters ---------- */
  const [f, setF] = useState<Settings>(run.settings);
  useEffect(() => setF(run.settings), [run.settings]);
  const filters = (
    <div className="grid gap-3.5">
      <Check id="fQuotes" label="Exclude quotes" checked={f.quotes} onChange={(v) => setF({ ...f, quotes: v })} />
      <Check id="fBib" label="Exclude bibliography" checked={f.bib} onChange={(v) => setF({ ...f, bib: v })} />
      <Check id="fStrict" label="Stricter mode (possible close paraphrase)" checked={f.strict} onChange={(v) => setF({ ...f, strict: v })} />
      <NumberField id="fMin" label="Exclude matches under" suffix="words" value={f.minWords} min={1} max={200} onChange={(v) => setF({ ...f, minWords: v })} />
      <NumberField id="fPct" label="Exclude sources under" suffix="%" step={0.5} value={f.dropPct} min={0} max={100} onChange={(v) => setF({ ...f, dropPct: v })} />
      <NumberField id="fNgram" label="Fingerprint size" suffix="words" value={f.ngram} min={2} max={12} onChange={(v) => setF({ ...f, ngram: v })} />
      <div><Button variant="primary" id="applyBtn" onClick={() => {
        const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo));
        p.recompute({ settings: { ...f, minWords: Math.round(clamp(f.minWords, 1, 200)), ngram: Math.round(clamp(f.ngram, 2, 12)), dropPct: clamp(f.dropPct, 0, 100) } });
        setTab("overview");
      }}>Apply</Button></div>
    </div>
  );

  const [own, setOwn] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  return (
    <main className="print-block mx-auto grid max-w-[1400px] grid-cols-1 items-start gap-5 px-4 pt-5 pb-12 min-[900px]:grid-cols-[minmax(0,1fr)_400px]">
      <article className="print-plain min-w-0 rounded-xl border border-line bg-panel px-4 py-6 shadow-sm sm:px-9 sm:pt-7 sm:pb-9">
        <h1 className="text-[19px] font-bold [overflow-wrap:anywhere]" id="rName">{doc.name}</h1>
        <p className="mt-1 text-[13px] text-mute">Checked {run.checked.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}</p>
        <hr className="my-4 border-line" />
        <div ref={docRef} id="rDoc" className={cx("font-serif text-[16.5px] leading-[1.75] whitespace-pre-wrap [overflow-wrap:anywhere]", sel && "focus")}
          onClick={(e) => onDocActivate(e.target as HTMLElement)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { const t = (e.target as HTMLElement).closest("[data-pid]"); if (t) { e.preventDefault(); onDocActivate(t as HTMLElement); } } }}>
          {segments}
        </div>
      </article>

      <aside className="print-plain grid min-w-0 gap-3.5 max-[899px]:order-first min-[900px]:sticky min-[900px]:top-[72px] min-[900px]:max-h-[calc(100vh-88px)] min-[900px]:overflow-auto" aria-label="Similarity results">
        <Card className="flex items-center gap-4 py-4">
          <ScoreRing index={r.index} color={b.color} />
          <div className="min-w-0">
            <div className="text-base font-bold" style={{ color: b.color }} id="bandLabel">{b.label}</div>
            <div className="text-[13.5px] text-mute">{r.total.toLocaleString()} words checked · {plural(r.order.length, "matched source")}</div>
            {run.startIndex !== r.index && <div className="text-[13px] text-mute">First check: {run.startIndex}%</div>}
          </div>
        </Card>
        <Card>
          <Tabs value={tab} onValueChange={setTab} tabs={[
            { id: "overview", label: "Match overview", content: overview },
            { id: "revise", label: <>Revise{open ? <span className="ml-1 rounded-full bg-soft px-1.5 text-[11px] text-accent">{open}</span> : null}</>, content: revise },
            { id: "citations", label: <>Citations{citeIssues.length ? <span className="ml-1 rounded-full bg-soft px-1.5 text-[11px] text-mid">{citeIssues.length}</span> : null}</>, content: citations },
            { id: "writing", label: "Writing", content: writing },
            { id: "filters", label: "Filters", content: filters },
          ]} />
        </Card>
        <Card className="no-print">
          <p className="text-[13.5px] text-mute">Save this document in your browser so later checks also compare against it.</p>
          <div className="mt-2"><Check id="ownWork" checked={own} onChange={setOwn} label="This is my own earlier work (report matches as self-plagiarism)" /></div>
          <Button size="sm" className="mt-2" id="saveBtn" onClick={async () => setSavedMsg((await p.saveDoc(own)) ? "Saved to your documents." : "Your browser blocked saving.")}>Save to my documents</Button>
          {savedMsg && <p className="mt-1.5 text-[13px] text-mute" role="status">{savedMsg}</p>}
        </Card>
        <Card className="text-[12.5px] text-mute">
          <p>Highlights show shared wording only — not proof of plagiarism. For each match, quote it and cite the source, or rewrite it in your own words and still cite it.</p>
          <p className="mt-2" id="settingsUsed">Settings: {settingsText(run.settings)}. {plural(all.length, "source")} compared.</p>
          <p className="mt-2">Made with <a className="text-accent underline" href="https://github.com/Devisetty08/origincheck">origincheck</a> (open source).</p>
        </Card>
      </aside>

      {para && <ParaphraseDialog open onClose={() => setPara(null)} sourceName={all[para.sid].name} original={doc.text.slice(para.s, para.end)}
        sourcePassage={sourcePassage(para).match} cite={p.citeFor(all[para.sid], undefined, false)} onSave={(mine) => savePara(para, mine)} />}
      {citeEdit && <CitationDialog open onClose={() => setCiteEdit(null)} source={all[citeEdit.sid]} initial={p.ctx.metaFor(all[citeEdit.sid])}
        style={p.ctx.style} internet={!!p.prefs.internet}
        onSave={(m) => {
          p.saveMeta(all[citeEdit.sid].name, m);
          const then = citeEdit.then;
          setCiteEdit(null);
          if (then) {
            if (then.remedy === "paraphrase") setPara(then.p);
            else remedy(then.remedy, then.p, m);
          }
        }} />}
    </main>
  );
}

function ScoreRing({ index, color }: { index: number; color: string }) {
  const C = 2 * Math.PI * 50, frac = Math.min(index, 100) / 100;
  return (
    <svg viewBox="0 0 120 120" className="size-28 shrink-0" role="img" aria-label={`Similarity index ${index}%`} id="ring">
      <circle cx="60" cy="60" r="50" fill="none" stroke="var(--soft)" strokeWidth="12" />
      <circle className="ring-arc" cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={`${(C * frac).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 60 60)" />
      <text x="60" y="69" textAnchor="middle" className="fill-ink text-[26px] font-bold">{index}%</text>
    </svg>
  );
}

function RecheckCard({ rc }: { rc: Recheck }) {
  const ok = !rc.stillMatches && (rc.cited || rc.action === "removed") && rc.meter?.level !== "too-close";
  return (
    <div className={cx("rounded-lg border-l-4 bg-bg p-3 text-[13px]", ok ? "border-low" : "border-mid")} role="status" id="recheck">
      <b className="block text-sm">Re-checked against {rc.source}</b>
      {rc.action === "removed" ? <p>Passage removed. It no longer counts toward the index.</p> : <>
        <p>{rc.stillMatches ? "⚠ The wording still matches the source closely enough to be flagged." : "✓ The passage no longer matches the source."}</p>
        <p>{rc.cited ? "✓ Citation present." : "⚠ No citation found — add one."}</p>
        {rc.meter?.level && <p>Closeness: <b>{rc.meter.level === "too-close" ? "Too close" : rc.meter.level === "borderline" ? "Borderline" : "Original wording"}</b> — {rc.meter.reasons[0]}</p>}
        {rc.action === "cited" && <p className="text-mute">Quoted text is excluded from the index when “Exclude quotes” is on.</p>}
      </>}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg bg-soft p-2"><div className="text-lg font-bold">{value}</div><div className="text-[11.5px] text-mute">{label}</div></div>;
}

function FbList({ title, items, empty, note }: { title: string; items: string[]; empty: string; note?: string }) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      {note && <p className="text-mute">{note}</p>}
      {items.length ? <ul className="mt-1 grid list-disc gap-1 pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul> : <p className="text-mute">{empty}</p>}
    </div>
  );
}
