"use client";
// Paragraph check: a paragraph and its sources in; sentence-by-sentence integrity checks, one-click fixes for quotation
// marks, citations and grammar, and a guided editor for rewriting borrowed wording. The user writes every new word.
import { Fragment, useEffect, useMemo, useState } from "react";
import { diffWords } from "diff";
import { AlertCircle, CheckCircle2, Copy, Download, FileText, History, Quote, Redo2, Save, Trash2, Undo2, XCircle } from "lucide-react";
import { type Style, STYLE_LABEL } from "@/lib/citations";
import { type Issue, applyAll } from "@/lib/grammar";
import { harperCheck } from "@/lib/harper";
import { type PSource, type RefEntry, citeFor, referenceList } from "@/lib/paragraph/citations";
import { runParagraph } from "@/lib/paragraph/client";
import { STATUS_TEXT, type Summary, exportParagraphDocx, exportParagraphHtml, exportParagraphTxt } from "@/lib/paragraph/export";
import { type Fixed, addCitation, fixFormat, grammarFix, quoteAndCite, replaceSentence } from "@/lib/paragraph/fixes";
import { type Analysis, DEFAULT_ALLOW, type FixKind, type IssueKind, type Options, type PIssue, type Status } from "@/lib/paragraph/rules";
import { Button, Card, NumberField, cx, inputCls } from "../ui";
import RewriteEditor from "./RewriteEditor";
import SourcesPanel from "./SourcesPanel";

export interface Seed { key: number; text: string; sources: PSource[] }

const STATUS: Record<Status, { icon: typeof CheckCircle2; text: string; bg: string; emoji: string }> = {
  original: { icon: CheckCircle2, text: "text-low", bg: "bg-low/12", emoji: "🟢" },
  "needs-citation": { icon: AlertCircle, text: "text-mid", bg: "bg-mid/15", emoji: "🟡" },
  quoted: { icon: Quote, text: "text-mid2", bg: "bg-mid2/12", emoji: "🟠" },
  "too-close": { icon: XCircle, text: "text-high", bg: "bg-high/12", emoji: "🔴" },
};
const ORDER: Status[] = ["too-close", "needs-citation", "quoted", "original"];
const FIX_LABEL: Record<FixKind, string> = { "quote-cite": "Quote and cite", "add-citation": "Add citation", "fix-format": "Fix citation format", rewrite: "Rewrite in my own words" };
const HELP: Partial<Record<IssueKind, [string, string]>> = {
  copied: ["#quote", "How to quote"], "quote-uncited": ["#quote", "How to quote"], "quote-long": ["#quote", "How to quote"], "quote-heavy": ["#paraphrase", "How to paraphrase"],
  patchwriting: ["#paraphrase", "How to paraphrase"], "idea-uncited": ["#cite", "How to cite"], "cite-no-ref": ["#cite", "How to cite"], "cite-format": ["#cite", "How to cite"],
};
const HISTORY_KEY = "oc-paragraph-history", ALLOW_KEY = "oc-allow";
type Saved = { id: string; at: string; text: string; sources: PSource[]; style: Style };
type Step = { t: string; g: number };

const readLs = <T,>(key: string, fallback: T): T => { try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : fallback; } catch { return fallback; } };
const writeLs = (key: string, v: unknown) => { try { localStorage.setItem(key, JSON.stringify(v)); return true; } catch { return false; } };
const countBy = (a: Analysis | null) => {
  const c: Record<Status, number> = { original: 0, "needs-citation": 0, quoted: 0, "too-close": 0 };
  for (const s of a?.sentences ?? []) c[s.status]++;
  return c;
};

export function StatusBadge({ status }: { status: Status }) {
  const S = STATUS[status], Icon = S.icon;
  return <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold", S.bg, S.text)} data-status={status}>
    <Icon size={13} aria-hidden /><span aria-hidden>{S.emoji}</span>{STATUS_TEXT[status]}</span>;
}

export default function ParagraphCheck({ seed, defaultStyle = "apa" }: { seed?: Seed | null; defaultStyle?: Style }) {
  const [text, setTextRaw] = useState(seed?.text ?? "");
  // undo history: each step keeps the text and how many grammar fixes had been applied
  const [past, setPast] = useState<Step[]>([]), [future, setFuture] = useState<Step[]>([]), [typedAt, setTypedAt] = useState(-1e9);
  const [gFixes, setGFixes] = useState(0);
  const [sources, setSources] = useState<PSource[]>(seed?.sources ?? []);
  const [style, setStyle] = useState<Style>(defaultStyle);
  const [minWords, setMinWords] = useState(6), [longQuote, setLongQuote] = useState(40);
  const [allow, setAllow] = useState<string[]>(() => (typeof window === "undefined" ? DEFAULT_ALLOW : readLs(ALLOW_KEY, DEFAULT_ALLOW)));
  const [derived, setDerived] = useState<{ text: string; sid: number }[]>([]);
  const [findOn, setFindOn] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [before, setBefore] = useState<{ counts: Record<Status, number>; cites: number } | null>(null); // the first check, for the summary
  const [refs, setRefs] = useState<RefEntry[]>([]);
  const [grammar, setGrammar] = useState<Issue[]>([]), [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [preview, setPreview] = useState<Fixed | null>(null);
  const [editor, setEditor] = useState<{ i: number; sid: number } | null>(null);
  const [saved, setSaved] = useState<Saved[]>(() => (typeof window === "undefined" ? [] : readLs<Saved[]>(HISTORY_KEY, [])));
  const [copied, setCopied] = useState("");

  const opts: Options = useMemo(() => ({ style, minWords, longQuote, allow, derived }), [style, minWords, longQuote, allow, derived]);

  /* ---------- edits with undo/redo ---------- */
  /** A fix, or typing (with the input event's time stamp: typing is grouped into one undo step per pause). */
  const commit = (next: string, kind: "fix" | number, g = gFixes) => {
    if (next === text) return;
    if (kind === "fix" || kind - typedAt > 1500) setPast((p) => [...p.slice(-99), { t: text, g: gFixes }]);
    if (kind !== "fix") setTypedAt(kind);
    setFuture([]);
    setGFixes(g);
    setTextRaw(next);
  };
  const go = (to: Step) => { setTextRaw(to.t); setGFixes(to.g); setTypedAt(-1e9); };
  const undo = () => { if (!past.length) return; setFuture((f) => [{ t: text, g: gFixes }, ...f]); go(past[past.length - 1]); setPast(past.slice(0, -1)); };
  const redo = () => { if (!future.length) return; setPast((p) => [...p, { t: text, g: gFixes }]); go(future[0]); setFuture(future.slice(1)); };

  /* ---------- checks (debounced; Ctrl+Enter runs at once) ---------- */
  const check = () => runParagraph(text, sources, opts).then((a) => {
    setAnalysis(a);
    setBefore((b) => b ?? (text.trim() && sources.length ? { counts: countBy(a), cites: a.cites.length } : null));
  }).catch(() => {});
  useEffect(() => {
    const t = setTimeout(check, 300);
    return () => clearTimeout(t);
  }, [text, sources, opts]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!text.trim()) return;
    let off = false;
    const t = setTimeout(() => harperCheck(text).then((g) => { if (!off) setGrammar(g); }).catch(() => {}), 700);
    return () => { off = true; clearTimeout(t); };
  }, [text]);

  // the reference list: every source the paragraph cites, plus sources rewritten from
  const cited = useMemo(() => [...new Set((analysis?.cites ?? []).filter((c) => c.src >= 0).map((c) => c.src))].sort((a, b) => a - b), [analysis]);
  useEffect(() => {
    let off = false;
    referenceList(sources, cited, style).then((r) => { if (!off) setRefs(r.entries); });
    return () => { off = true; };
  }, [sources, cited, style]);

  const issues = analysis?.issues ?? [];
  const gIssues = text.trim() ? grammar.filter((g) => !ignored.has(g.id) && g.end <= text.length) : [];

  /* ---------- fixes ---------- */
  const fix = (x: PIssue, kind: FixKind) => {
    const sent = analysis!.sentences[x.sentence];
    const sid = x.sid ?? sent?.match?.sid ?? 0;
    if (kind === "rewrite") return setEditor({ i: x.sentence, sid });
    const cite = citeFor(sources, sid, style);
    const fixed = kind === "quote-cite" ? quoteAndCite(text, x.s, x.e, cite) : kind === "add-citation" ? addCitation(text, sent.s, sent.e, cite) : fixFormat(text, x.s, x.e, x.expected!);
    setPreview(fixed);
  };
  const applyPreview = () => { if (preview) commit(preview.text, "fix"); setPreview(null); };
  const applyRewrite = (mine: string) => {
    const sent = analysis!.sentences[editor!.i];
    commit(replaceSentence(text, sent.s, sent.e, mine).text, "fix");
    setDerived((d) => [...d, { text: mine, sid: editor!.sid }]);
    setEditor(null);
  };
  const acceptGrammar = (g: Issue, k: number) => commit(grammarFix(text, g, g.suggestions[k]).text, "fix", gFixes + 1);
  const acceptSpelling = () => {
    const sp = gIssues.filter((g) => g.category === "spelling" && g.suggestions.length);
    if (sp.length) commit(applyAll(text, sp), "fix", gFixes + sp.length);
  };

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea, select, [contenteditable]");
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); check(); }
      else if (e.altKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
        const cards = [...document.querySelectorAll<HTMLElement>("[data-issue-card]")];
        if (!cards.length) return;
        e.preventDefault();
        const at = cards.indexOf(document.activeElement as HTMLElement);
        cards[(at + (e.key === "ArrowDown" ? 1 : -1) + cards.length) % cards.length].focus();
      } else if (!typing && (e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "y" || e.key === "Z")) {
        e.preventDefault();
        if (e.key === "y" || e.shiftKey) redo(); else undo();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  });

  /* ---------- history ---------- */
  const saveCheck = () => {
    const next = [{ id: Date.now().toString(36), at: new Date().toISOString(), text, sources, style }, ...saved].slice(0, 20);
    if (writeLs(HISTORY_KEY, next)) setSaved(next);
  };
  const load = (h: Saved) => { setTextRaw(h.text); setSources(h.sources); setStyle(h.style); setPast([]); setFuture([]); setDerived([]); setBefore(null); setGFixes(0); };
  const remove = (id: string) => { const next = saved.filter((x) => x.id !== id); if (writeLs(HISTORY_KEY, next)) setSaved(next); };

  const copy = async (what: string, t: string) => { try { await navigator.clipboard.writeText(t); setCopied(what); } catch { /* clipboard blocked */ } };
  const after = countBy(analysis);
  // citations added: counted from the text itself, so undo and redo are always reflected
  const summary: Summary = { before: before?.counts ?? after, after, citationsAdded: Math.max(0, (analysis?.cites.length ?? 0) - (before?.cites ?? 0)), grammarFixes: gFixes };
  const sel = selected != null ? analysis?.sentences[selected] : undefined;
  const words = text.split(/\s+/).filter(Boolean).length;

  return (
    <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-6 pb-12" id="paragraphCheck">
      <div>
        <h1 className="text-[clamp(23px,4vw,30px)] font-bold leading-tight tracking-tight">Paragraph check</h1>
        <p className="mt-1 max-w-3xl text-[15px] text-mute">Paste a paragraph and the source it&apos;s based on. Each sentence is checked against academic-integrity rules.
          Quotation marks, citations, the reference list and grammar are fixed for you; borrowed wording you rewrite yourself, with guidance. origincheck never writes the wording for you.</p>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 min-[900px]:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* ---------- input ---------- */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
          <Card>
            <label className="grid gap-1.5" htmlFor="pText">
              <span className="flex items-center justify-between font-semibold">Paragraph<span className="text-[12px] font-normal text-mute" id="pWords">{words} word{words === 1 ? "" : "s"}</span></span>
              <textarea id="pText" className={cx(inputCls, "min-h-40 font-serif text-[15px] leading-relaxed")} value={text} placeholder="Type or paste your paragraph"
                onChange={(e) => commit(e.target.value, e.timeStamp)} />
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button size="sm" onClick={undo} disabled={!past.length} id="pUndo" aria-keyshortcuts="Control+Z"><Undo2 size={14} />Undo</Button>
              <Button size="sm" onClick={redo} disabled={!future.length} id="pRedo" aria-keyshortcuts="Control+Y"><Redo2 size={14} />Redo</Button>
              <Button size="sm" variant="primary" onClick={check} id="pRun" aria-keyshortcuts="Control+Enter">Check now</Button>
            </div>
            <p className="mt-1.5 text-[12px] text-mute">Shortcuts: Ctrl+Enter check · Alt+↓/↑ next or previous issue · Ctrl+Z / Ctrl+Y undo / redo</p>
          </Card>
          <Card><SourcesPanel sources={sources} setSources={setSources} style={style} paragraph={text} findOn={findOn} setFindOn={setFindOn} /></Card>
          <Card className="grid gap-2.5 text-sm">
            <h2 className="font-semibold">Settings</h2>
            <label className="flex items-center gap-2">Citation style
              <select className="h-8 rounded-md border border-line bg-bg px-2" value={style} onChange={(e) => setStyle(e.target.value as Style)} id="pStyle">
                {Object.entries(STYLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <NumberField id="pMin" label="Copied wording from" suffix="words in a row" value={minWords} min={3} max={20} onChange={setMinWords} />
            <NumberField id="pLong" label="Long quotation over" suffix="words" value={longQuote} min={10} max={200} onChange={setLongQuote} />
            <label className="grid gap-1">Technical terms (never counted as borrowed wording)
              <textarea className={cx(inputCls, "min-h-16")} defaultValue={allow.join("\n")} id="pAllow"
                onBlur={(e) => { const v = [...new Set(e.target.value.split(/\n|,/).map((x) => x.trim()).filter(Boolean))]; setAllow(v); writeLs(ALLOW_KEY, v); }} />
            </label>
          </Card>
        </div>

        {/* ---------- results ---------- */}
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4" aria-live="polite">
          {!analysis || !text.trim() ? <Card className="text-[14px] text-mute">Add a paragraph and at least one source to start. The check runs as you type.</Card> : <>
            <Card id="pSummary">
              <div className="flex flex-wrap items-center gap-2">
                {ORDER.map((s) => <span key={s} className="flex items-center gap-1"><StatusBadge status={s} /><b data-count={s}>{after[s]}</b></span>)}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13.5px]">
                <span>Quoted: <b id="pQuoted">{analysis.quotedPct}%</b></span>
                <span>Grammar: <b>{gIssues.length}</b></span>
                <span className={cx("font-bold", analysis.verdict === "Ready" ? "text-low" : "text-mid")} id="pVerdict">{analysis.verdict}</span>
              </div>
              {!sources.some((s) => s.text.trim()) && <p className="mt-1.5 text-[13px] text-mid">No source text yet, so wording can&apos;t be compared. Add a source.</p>}
              <p className="mt-1.5 text-[12px] text-mute">Matches are signals, not proof. Check each one yourself.</p>
            </Card>

            <Card>
              <h2 className="font-semibold">Your paragraph, sentence by sentence</h2>
              <p className="mt-0.5 text-[12.5px] text-mute">Underlined words match the source. Click a sentence to compare it with the source.</p>
              <div className="mt-2 font-serif text-[16px] leading-[1.9] wrap-anywhere" id="pView">
                {analysis.sentences.map((s, i) => {
                  const S = STATUS[s.status], Icon = S.icon;
                  const prev = i ? analysis.sentences[i - 1].e : 0;
                  const spans = s.match?.docSpans ?? [];
                  const parts: React.ReactNode[] = [];
                  let at = s.s;
                  for (const [a, b] of spans) { if (a < at) continue; parts.push(text.slice(at, a)); parts.push(<span key={a} className="underline decoration-high decoration-2 underline-offset-4">{text.slice(a, b)}</span>); at = b; }
                  parts.push(text.slice(at, s.e));
                  return <Fragment key={s.s}>{text.slice(prev, s.s)}
                    <span role="button" tabIndex={0} data-sentence={i} data-status={s.status} aria-pressed={selected === i} onClick={() => setSelected(i)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSelected(i); } }}
                      aria-label={`Sentence ${i + 1}: ${STATUS_TEXT[s.status]}`}
                      className={cx("cursor-pointer rounded px-0.5 box-decoration-clone", S.bg, selected === i && "ring-2 ring-accent")}>
                      <Icon size={13} className={cx("mr-0.5 inline align-[-1px]", S.text)} aria-hidden />{parts}
                    </span></Fragment>;
                })}
              </div>
              {sel && <div className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 border-t border-line pt-3 text-[14px] wrap-anywhere min-[700px]:grid-cols-2" id="pCompare">
                <div><div className="mb-1 flex items-center gap-2 text-[11.5px] font-semibold uppercase tracking-wide text-mute">Your sentence <StatusBadge status={sel.status} /></div>
                  <p className="rounded-md bg-bg p-2.5 font-serif">{sel.text}</p></div>
                <div><div className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-mute">{sel.match ? `Source ${sel.match.sid + 1}: ${sources[sel.match.sid]?.title ?? ""}` : "Source"}</div>
                  {sel.match ? (() => {
                    const src = sources[sel.match.sid];
                    const a = Math.max(0, sel.match.srcS - 120), z = Math.min(src.text.length, sel.match.srcE + 120);
                    return <p className="rounded-md border-l-4 border-high/60 bg-bg p-2.5 font-serif" id="pSourcePassage">{a > 0 && "… "}{src.text.slice(a, sel.match.srcS)}
                      <mark className="rounded-sm bg-high/20 text-inherit">{src.text.slice(sel.match.srcS, sel.match.srcE)}</mark>{src.text.slice(sel.match.srcE, z)}{z < src.text.length && " …"}</p>;
                  })() : <p className="text-mute">This sentence doesn&apos;t match any of your sources.</p>}
                </div>
              </div>}
            </Card>

            <Card id="pIssues">
              <h2 className="font-semibold">Issues ({issues.length})</h2>
              {!issues.length && <p className="mt-1 flex items-center gap-1.5 text-[13.5px] text-low"><CheckCircle2 size={15} />No integrity issues found.</p>}
              <ul className="mt-2 grid gap-2">
                {issues.map((x) => {
                  const st = x.sentence >= 0 ? analysis.sentences[x.sentence].status : null;
                  const help = HELP[x.kind];
                  return <li key={x.id} tabIndex={0} data-issue-card data-kind={x.kind}
                    onFocus={(e) => e.target === e.currentTarget && x.sentence >= 0 && setSelected(x.sentence)} // the card itself (Alt+↓/↑), not its buttons: no layout shift under the pointer
                    className={cx("rounded-lg border-l-4 bg-bg p-3 text-[13.5px] outline-none focus:ring-2 focus:ring-accent", x.severity === "error" ? "border-high" : "border-mid")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <b className={x.severity === "error" ? "text-high" : "text-mid"}>{x.severity === "error" ? "Error" : "Warning"}</b>
                      {x.sentence >= 0 && <span className="text-mute">Sentence {x.sentence + 1}</span>}{st && <StatusBadge status={st} />}
                    </div>
                    <p className="mt-1 font-medium">{x.message}</p>
                    <p className="mt-0.5 text-mute">{x.why}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {x.fixes.map((f) => <Button key={f} size="sm" variant={f === "rewrite" ? "primary" : "outline"} onClick={() => fix(x, f)} data-fix={f}>{FIX_LABEL[f]}</Button>)}
                      {help && <a className="ml-1 text-[12.5px] text-accent underline" href={`guide${help[0]}`} target="_blank" rel="noreferrer">{help[1]}</a>}
                    </div>
                  </li>;
                })}
              </ul>
            </Card>

            {preview && <Card id="pPreview" className="border-accent">
              <h2 className="font-semibold">Preview: {preview.change.label}</h2>
              <p className="mt-1 rounded-md bg-bg p-2.5 font-serif text-[14.5px]">
                {diffWords(text, preview.text).map((d, k) => d.added ? <ins key={k} className="bg-low/20 no-underline">{d.value}</ins> : d.removed ? <del key={k} className="text-high">{d.value}</del> : <span key={k}>{d.value.length > 160 ? `${d.value.slice(0, 60)} … ${d.value.slice(-60)}` : d.value}</span>)}
              </p>
              <div className="mt-2 flex gap-2"><Button size="sm" variant="primary" onClick={applyPreview} id="pApplyFix">Apply</Button><Button size="sm" variant="ghost" onClick={() => setPreview(null)}>Cancel</Button></div>
            </Card>}

            {gIssues.length > 0 && <Card id="pGrammar">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Grammar and spelling ({gIssues.length})</h2>
                {gIssues.some((g) => g.category === "spelling" && g.suggestions.length) && <Button size="sm" onClick={acceptSpelling}>Accept all spelling fixes</Button>}</div>
              <ul className="mt-2 grid gap-1.5 text-[13.5px]">
                {gIssues.slice(0, 20).map((g) => <li key={g.id} className="flex flex-wrap items-center gap-1.5 rounded-md bg-bg p-2">
                  <span className="min-w-0 flex-1"><b>“{text.slice(g.start, g.end)}”</b> <span className="text-mute">{g.message}</span></span>
                  {g.suggestions.slice(0, 3).map((s, k) => <Button key={k} size="sm" onClick={() => acceptGrammar(g, k)}>{s.kind === "remove" ? "Remove" : s.text}</Button>)}
                  <Button size="sm" variant="ghost" onClick={() => setIgnored((x) => new Set(x).add(g.id))}>Ignore</Button>
                </li>)}
              </ul>
            </Card>}

            <Card id="pFinal">
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold">Final paragraph</h2>
                <Button size="sm" onClick={() => copy("all", `${text.trim()}${refs.length ? `\n\nReferences\n${refs.map((r) => r.text).join("\n")}` : ""}`)} id="pCopyAll"><Copy size={14} />{copied === "all" ? "Copied" : "Copy all"}</Button></div>
              <p className="mt-2 rounded-md bg-bg p-3 font-serif text-[15px] leading-relaxed whitespace-pre-wrap wrap-anywhere" id="pFinalText">{text}</p>
              <h3 className="mt-3 text-sm font-semibold">References ({STYLE_LABEL[style]})</h3>
              {!refs.length ? <p className="mt-1 text-[13px] text-mute">Sources you cite appear here.</p>
                : <ul className="mt-1 grid gap-1.5" id="pRefs">{refs.map((r) => <li key={r.sid} className="flex items-start gap-2 text-[13.5px]">
                  <span className="min-w-0 flex-1 pl-6 -indent-6 font-serif wrap-anywhere" data-ref>{r.segs ? r.segs.map((g, k) => g.i ? <i key={k}>{g.t}</i> : <Fragment key={k}>{g.t}</Fragment>) : r.text}</span>
                  <Button size="sm" variant="ghost" onClick={() => copy(`r${r.sid}`, r.text)} aria-label="Copy reference"><Copy size={14} />{copied === `r${r.sid}` ? "Copied" : ""}</Button></li>)}</ul>}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => exportParagraphDocx(text, refs, style)} id="pDocx"><Download size={14} />.docx</Button>
                <Button size="sm" onClick={() => exportParagraphTxt(text, refs)} id="pTxt"><Download size={14} />.txt</Button>
                <Button size="sm" onClick={() => exportParagraphHtml(text, analysis, refs, style, summary)} id="pHtml"><FileText size={14} />HTML report</Button>
                <Button size="sm" onClick={saveCheck} id="pSave"><Save size={14} />Save to history</Button>
              </div>
            </Card>

            <Card id="pCheckSummary" className="text-[13.5px]">
              <h2 className="font-semibold">Check summary</h2>
              <p className="mt-1">Before: {ORDER.map((s) => `${STATUS[s].emoji} ${summary.before[s]}`).join("  ")}</p>
              <p>After: {ORDER.map((s) => `${STATUS[s].emoji} ${summary.after[s]}`).join("  ")}</p>
              <p className="mt-1 text-mute">{analysis.quotedPct}% quoted · {summary.citationsAdded} citation{summary.citationsAdded === 1 ? "" : "s"} added · {gFixes} grammar fix{gFixes === 1 ? "" : "es"} applied</p>
            </Card>
          </>}

          {saved.length > 0 && <Card id="pHistory">
            <h2 className="flex items-center gap-1.5 font-semibold"><History size={15} />Recent checks</h2>
            <p className="text-[12px] text-mute">Kept in this browser only.</p>
            <ul className="mt-2 grid gap-1.5">{saved.map((h) => <li key={h.id} className="flex items-center gap-2 text-[13px]">
              <span className="min-w-0 flex-1 truncate">{new Date(h.at).toLocaleString()} · {h.text.slice(0, 60)}</span>
              <Button size="sm" onClick={() => load(h)}>Load</Button>
              <Button size="sm" variant="ghost" aria-label="Delete" onClick={() => remove(h.id)}><Trash2 size={14} /></Button></li>)}</ul>
          </Card>}
        </div>
      </div>

      {editor && analysis && (() => {
        const live = sources, s = analysis.sentences[editor.i], m = s.match;
        const src = live[editor.sid];
        return src ? <RewriteEditor original={s.text} sid={editor.sid} sources={live} style={style} opts={opts}
          sourcePassage={m ? src.text.slice(m.srcS, m.srcE) : src.text.slice(0, 400)} onApply={applyRewrite} onCancel={() => setEditor(null)} /> : null;
      })()}
    </div>
  );
}
