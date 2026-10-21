"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { BookOpen, Download, History, Library as LibIcon, Moon, Printer, Sun } from "lucide-react";
import { type CiteMeta, type Result, type Settings, type Source, type Tok, check, tokenize } from "@/lib/engine";
import { type Style, inText } from "@/lib/citations";
import { closeness, type Closeness } from "@/lib/closeness";
import { download, reportHtml, baseName } from "@/lib/exporters";
import {
  type DraftCheck, type Prefs, type SavedDoc, loadHistory, loadMeta, loadPrefs, loadSaved, projectKey,
  storeHistory, storeMeta, storePrefs, storeSaved, uid,
} from "@/lib/store";
import { Logo, cx } from "./ui";
import Setup from "./Setup";
import Report from "./Report";
import Drafts from "./Drafts";
import Library from "./Library";

export type HStyle = "h1" | "h2" | "h3";
export interface Doc { name: string; text: string; toks: Tok[]; headings: Map<string, HStyle>; kind: "file" | "paste" }
export interface Resolution { id: string; action: "cited" | "rewritten" | "removed"; source: string; excerpt: string; at: string }
export interface Recheck { action: Resolution["action"]; source: string; stillMatches: boolean; cited: boolean; meter?: Closeness }
export interface RunState {
  all: Source[];
  skip: Set<number>;
  settings: Settings;
  r: Result;
  checked: Date;
  startIndex: number;
  project: string;
  resolutions: Resolution[];
  undo: { text: string; resolutions: Resolution[] }[];
  recheck?: Recheck;
}

export const DEFAULT_SETTINGS: Settings = { quotes: true, bib: true, minWords: 8, ngram: 5, dropPct: 0, strict: false };

export default function App() {
  const [view, setView] = useState<"check" | "drafts" | "library">("check");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [prefs, setPrefsState] = useState<Prefs>({});
  const [useSaved, setUseSaved] = useState(true);
  const [saved, setSaved] = useState<SavedDoc[]>([]);
  const [history, setHistory] = useState<DraftCheck[]>([]);
  const [meta, setMeta] = useState<Record<string, CiteMeta>>({});
  const [run, setRun] = useState<RunState | null>(null);
  const [citeOrder, setCiteOrder] = useState<string[]>([]);
  const [busy, setBusy] = useState("");

  useEffect(() => {
    Promise.all([loadSaved(), loadHistory(), loadMeta()]).then(([s, h, m]) => {
      setPrefsState(loadPrefs());
      setSaved(s);
      setHistory(h);
      setMeta(m);
    });
  }, []);

  const setPrefs = (p: Partial<Prefs>) => setPrefsState((old) => { const n = { ...old, ...p }; storePrefs(n); return n; });
  const style: Style = prefs.style ?? "apa";

  const toggleTheme = () => {
    const cur = document.documentElement.dataset.theme ?? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = cur === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    setPrefs({ theme: next });
  };

  /* ---------- citation details ---------- */
  const metaFor = useCallback((s: Source) => meta[s.name] ?? s.meta, [meta]);
  const saveMeta = (name: string, m: CiteMeta) => {
    const next = { ...meta, [name]: m };
    setMeta(next);
    storeMeta(next);
    setRun((r) => r && { ...r, all: r.all.map((s) => (s.name === name ? { ...s, meta: m } : s)) });
    setSources((ss) => ss.map((s) => (s.name === name ? { ...s, meta: m } : s)));
  };
  const ieeeN = useCallback((name: string, all: Source[] = run?.all ?? []) => {
    const i = citeOrder.indexOf(name);
    if (i >= 0) return i + 1;
    const rest = all.filter((s) => !citeOrder.includes(s.name)).map((s) => s.name);
    return citeOrder.length + 1 + Math.max(0, rest.indexOf(name));
  }, [citeOrder, run?.all]);
  /** In-text citation; `commit` records the source's IEEE number (skip it for previews during render). */
  const citeFor = (s: Source, fresh?: CiteMeta, commit = true) => {
    const m = fresh ?? metaFor(s)!;
    if (commit && !citeOrder.includes(s.name)) setCiteOrder((o) => (o.includes(s.name) ? o : [...o, s.name]));
    const n = citeOrder.includes(s.name) ? citeOrder.indexOf(s.name) + 1 : citeOrder.length + 1;
    return inText(m, style, n);
  };

  /* ---------- checking ---------- */
  const startCheck = async () => {
    if (!doc) return;
    setBusy("Checking…");
    await new Promise((r) => setTimeout(r, 30)); // let the busy state paint
    const project = projectKey(doc.name);
    const all: Source[] = sources.map((s) => ({ ...s, meta: meta[s.name] ?? s.meta }));
    if (useSaved)
      for (const d of saved)
        if (d.text !== doc.text) all.push({ id: d.id, name: d.name, kind: d.own ? "own" : "saved", text: d.text, toks: tokenize(d.text), meta: meta[d.name] });
    const drafts = history.filter((h) => h.project === project && h.text !== doc.text);
    const seen = new Set<string>();
    const skip = new Set<number>();
    for (const h of [...drafts].reverse().slice(0, 10)) {
      if (seen.has(h.text)) continue;
      seen.add(h.text);
      skip.add(all.length); // previous drafts are excluded from the index by default (Req 8.3)
      all.push({ id: h.id, name: `${h.label} (${new Date(h.date).toLocaleDateString()})`, kind: "draft", text: h.text, toks: tokenize(h.text) });
    }
    const r = check(doc, all, settings, skip);
    const checked = new Date();
    setRun({ all, skip, settings, r, checked, startIndex: r.index, project, resolutions: [], undo: [] });
    setCiteOrder([]);
    await addDraft(doc, r, all, project, checked);
    setBusy("");
    scrollTo(0, 0);
  };

  const addDraft = async (d: Doc, r: Result, all: Source[], project: string, date: Date, label?: string) => {
    const prev = (await loadHistory());
    const n = prev.filter((h) => h.project === project).length + 1;
    const entry: DraftCheck = {
      id: uid(), project, docName: d.name, label: label ?? `Draft ${n}`, date: date.toISOString(), index: r.index,
      breakdown: r.order.map((s) => ({ name: all[s].name, kind: all[s].kind, pct: Math.round((1000 * r.counts.get(s)!) / r.total) / 10 })),
      passages: r.passages.map((p) => ({ key: passageKey(d.text.slice(p.s, p.end)), text: d.text.slice(p.s, p.end), source: all[p.sid].name })),
      text: d.text,
    };
    const next = [...prev, entry];
    setHistory(next);
    await storeHistory(next);
  };

  const recompute = (patch: Partial<Pick<RunState, "settings" | "skip">>, text?: string, extra?: Partial<RunState>) => {
    if (!run || !doc) return;
    const d = text === undefined ? doc : { ...doc, text, toks: tokenize(text) };
    if (text !== undefined) setDoc(d);
    const settings = patch.settings ?? run.settings, skip = patch.skip ?? run.skip;
    setRun({ ...run, ...patch, ...extra, r: check(d, run.all, settings, skip) });
  };

  /* ---------- guided revision (Req 2) ---------- */
  const applyEdit = (s: number, e: number, replacement: string, res: Omit<Resolution, "id" | "at">, recheckOf?: { sid: number; mine?: string; sourcePassage?: string }) => {
    if (!run || !doc) return;
    let text = doc.text.slice(0, s) + replacement + doc.text.slice(e);
    let at = s;
    if (!replacement) { // tidy the gap left by a removal
      const before = text.slice(0, s).replace(/[ \t]+$/, ""), after = text.slice(s).replace(/^[ \t]+/, "");
      const glue = /^[.,;:!?)]/.test(after) || /[\n(]$/.test(before) || !before ? "" : " ";
      text = before + glue + after;
      at = before.length;
    }
    const resolutions = [...run.resolutions, { ...res, id: uid(), at: new Date().toISOString() }];
    const toks = tokenize(text);
    const d = { ...doc, text, toks };
    const r = check(d, run.all, run.settings, run.skip);
    let recheck: Recheck | undefined;
    if (recheckOf) {
      const end = at + replacement.length;
      const stillMatches = toks.some((t, i) => t.s >= at && t.e <= end && r.owner.get(i) === recheckOf.sid);
      const cited = res.action !== "removed" && /\(([^()]*\d{4}|[^()]*n\.d\.)[^()]*\)|\[\d+\]/.test(replacement);
      recheck = { action: res.action, source: res.source, stillMatches, cited,
        meter: recheckOf.mine && recheckOf.sourcePassage ? closeness(recheckOf.mine, recheckOf.sourcePassage) : undefined };
    } else recheck = { action: res.action, source: res.source, stillMatches: false, cited: res.action === "cited" };
    setDoc(d);
    setRun({ ...run, r, resolutions, recheck, undo: [...run.undo, { text: doc.text, resolutions: run.resolutions }] });
  };

  const undo = () => {
    if (!run?.undo.length || !doc) return;
    const last = run.undo[run.undo.length - 1];
    const d = { ...doc, text: last.text, toks: tokenize(last.text) };
    setDoc(d);
    setRun({ ...run, r: check(d, run.all, run.settings, run.skip), resolutions: last.resolutions, undo: run.undo.slice(0, -1), recheck: undefined });
  };

  const saveDoc = async (own: boolean) => {
    if (!doc) return;
    const next = [...saved.filter((d) => d.text !== doc.text), { id: uid(), name: doc.name, text: doc.text, own, savedAt: new Date().toISOString() }];
    setSaved(next);
    return storeSaved(next);
  };

  const newCheck = () => { setRun(null); setDoc(null); setView("check"); scrollTo(0, 0); };

  const downloadHtml = () => {
    if (!run || !doc) return;
    download(`${baseName(doc.name)}_similarity_report.html`,
      reportHtml({ docName: doc.name, text: doc.text, toks: doc.toks, r: run.r, sources: run.all, settings: run.settings, checked: run.checked }), "text/html");
  };

  const ctx = useMemo(() => ({ style, metaFor, ieeeN }), [style, metaFor, ieeeN]);

  return (
    <>
      <header className="top sticky top-0 z-30 flex min-h-14 items-center gap-2 bg-top px-4 py-2 text-white sm:gap-3">
        <button onClick={() => setView("check")} className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight cursor-pointer" aria-label="origincheck home">
          <Logo /><span className={cx(run && view === "check" && "max-[479px]:hidden")}>origincheck</span>
        </button>
        {run && doc && view === "check" && <div className="hidden min-w-0 flex-1 truncate text-sm opacity-90 sm:block" title={doc.name}>{doc.name}</div>}
        <nav className="ml-auto flex shrink-0 items-center gap-1.5" aria-label="Main">
          {run && view === "check" && <>
            <TopBtn onClick={newCheck} label="New check" short="New" />
            <TopBtn onClick={downloadHtml} label="Download report" short="" icon={<Download size={15} />} />
            <TopBtn onClick={() => print()} label="Print / PDF" icon={<Printer size={15} />} className="max-sm:hidden" />
          </>}
          <TopBtn onClick={() => setView(view === "drafts" ? "check" : "drafts")} label="Drafts" icon={<History size={15} />} iconOnly pressed={view === "drafts"} />
          <TopBtn onClick={() => setView(view === "library" ? "check" : "library")} label="Saved documents" icon={<LibIcon size={15} />} iconOnly pressed={view === "library"} />
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/guide/`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/30 bg-white/12 px-2.5 text-[13.5px] font-medium hover:bg-white/22" aria-label="Guide to avoiding plagiarism">
            <BookOpen size={15} /><span className="hidden md:inline">Guide</span>
          </a>
          <button onClick={toggleTheme} className="inline-grid size-8 place-items-center rounded-lg border border-white/30 bg-white/12 hover:bg-white/22 cursor-pointer" aria-label="Toggle dark mode">
            <Moon size={16} className="dark:hidden" /><Sun size={16} className="hidden dark:block" />
          </button>
        </nav>
      </header>

      {view === "drafts" && <Drafts history={history} setHistory={(h) => { setHistory(h); storeHistory(h); }} />}
      {view === "library" && <Library saved={saved} setSaved={(s) => { setSaved(s); storeSaved(s); }}
        onDeletedAll={() => { setSaved([]); setHistory([]); setMeta({}); setPrefsState({}); delete document.documentElement.dataset.theme; }} />}
      {view === "check" && (run && doc
        ? <Report doc={doc} run={run} ctx={ctx} citeFor={citeFor} prefs={prefs} setPrefs={setPrefs}
            recompute={recompute} applyEdit={applyEdit} undo={undo} saveDoc={saveDoc} saveMeta={saveMeta}
            saveDraft={(label) => addDraft(doc, run.r, run.all, run.project, new Date(), label)} />
        : <Setup doc={doc} setDoc={setDoc} sources={sources} setSources={setSources} settings={settings} setSettings={setSettings}
            prefs={prefs} setPrefs={setPrefs} saved={saved} useSaved={useSaved} setUseSaved={setUseSaved}
            drafts={doc ? new Set(history.filter((h) => h.project === projectKey(doc.name) && h.text !== doc.text).map((h) => h.text)).size : 0}
            onRun={startCheck} busy={busy} />)}
    </>
  );
}

export const passageKey = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function TopBtn({ onClick, label, short, icon, iconOnly, pressed, className }:
  { onClick: () => void; label: string; short?: string; icon?: React.ReactNode; iconOnly?: boolean; pressed?: boolean; className?: string }) {
  return (
    <button onClick={onClick} aria-label={label} aria-pressed={pressed} title={label}
      className={cx("inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/30 px-2.5 text-[13.5px] font-medium cursor-pointer hover:bg-white/22",
        pressed ? "bg-white/30" : "bg-white/12", className)}>
      {icon}
      {!iconOnly && (short !== undefined ? <><span className="hidden sm:inline">{label}</span>{short && <span className="sm:hidden">{short}</span>}</> : <span>{label}</span>)}
      {iconOnly && <span className="hidden lg:inline">{label}</span>}
    </button>
  );
}
