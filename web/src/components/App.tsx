"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MotionConfig } from "motion/react";
import { BookOpen, Bot, Download, FileCheck, FileSearch, History, Library as LibIcon, Moon, Printer, SpellCheck, Sun } from "lucide-react";
import { Tabs as T } from "radix-ui";
import { type CiteMeta, type Result, type Settings, type Source, type Tok, bibStart, tokenize } from "@/lib/similarity";
import { bookSearch, webSearch } from "@/lib/importer";
import { plural } from "@/lib/words";
import { type Style, inText } from "@/lib/citations";
import { closeness, type Closeness } from "@/lib/closeness";
import { aiScore } from "@/lib/aiScore";
import { type Issue, applyAll, applySuggestion, mergeIssues, writingScore } from "@/lib/grammar";
import { bodySentences, runAi, runSimilarity, wordCount } from "@/lib/checks";
import { harperCheck, languageToolCheck, warmGrammar } from "@/lib/harper";
import { baseName, download, exportDocx, reportHtml } from "@/lib/exporters";
import { extract } from "@/lib/extract";
import {
  type DraftCheck, type Prefs, type SavedDoc, loadHistory, loadMeta, loadPrefs, loadSaved, projectKey,
  storeHistory, storeMeta, storePrefs, storeSaved, uid,
} from "@/lib/store";
import { Button, Logo, type Status, cx } from "./ui";
import Setup, { SourcesCard } from "./Setup";
import Report from "./Report";
import Drafts from "./Drafts";
import Library from "./Library";
import Dashboard, { type Tab } from "./Dashboard";
import GrammarTab from "./GrammarTab";
import AiTab, { type AiState } from "./AiTab";

export type HStyle = "h1" | "h2" | "h3";
export interface Doc { id: string; name: string; text: string; toks: Tok[]; headings: Map<string, HStyle>; kind: "file" | "paste" }
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
type View = "check" | "history" | "library";
type PendingRecheck = { res: Omit<Resolution, "id" | "at">; at: number; len: number; sid?: number; mine?: string; sourcePassage?: string };

export default function App() {
  const [view, setView] = useState<View>("check");
  const [tab, setTab] = useState<Tab>("similarity");
  const [doc, setDoc] = useState<Doc | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [found, setFound] = useState<Source[]>([]); // web and book search results for this document
  const [priorDrafts, setPriorDrafts] = useState<Source[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [skipIds, setSkipIds] = useState<Set<string>>(new Set());
  const [prefs, setPrefsState] = useState<Prefs>({});
  const [useSaved, setUseSaved] = useState(true);
  const [saved, setSaved] = useState<SavedDoc[]>([]);
  const [history, setHistory] = useState<DraftCheck[]>([]);
  const [meta, setMeta] = useState<Record<string, CiteMeta>>({});
  const [citeOrder, setCiteOrder] = useState<string[]>([]);

  const [run, setRun] = useState<RunState | null>(null);
  const [sim, setSim] = useState<{ status: Status; pct?: number; note?: string; error?: string }>({ status: "queued" });
  const [searching, setSearching] = useState(false);
  const [webNote, setWebNote] = useState("");
  const [grammar, setGrammar] = useState<{ status: Status; pct?: number; issues: Issue[]; error?: string; ltNote?: string }>({ status: "queued", issues: [] });
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [ignoredRules, setIgnoredRules] = useState<Set<string>>(new Set());
  const [ai, setAi] = useState<AiState>({ status: "queued", result: null });

  const pendingRecheck = useRef<PendingRecheck | null>(null);
  const draftId = useRef<string | null>(null);
  const edited = useRef(false);

  useEffect(() => {
    warmGrammar();
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

  /* ---------- AI indicator ---------- */
  const aiSeq = useRef(0);
  const startAi = async (text: string, enabled = prefs.ai !== false) => {
    const seq = ++aiSeq.current;
    if (!enabled) return setAi({ status: "off", result: null });
    const words = wordCount(text);
    const sentences = bodySentences(text);
    if (words < 150 || !sentences.length) return setAi({ status: "short", result: null, words }); // the spec's threshold is on the whole document
    setAi({ status: "running", pct: 0, result: null });
    try {
      const signals = await runAi(text, sentences, (p) => { if (seq === aiSeq.current) setAi((a) => ({ ...a, status: "running", pct: p.pct, stage: p.stage, mb: p.mb ?? a.mb })); });
      if (seq !== aiSeq.current) return;
      setAi({ status: "done", result: aiScore(words, signals), signals, text, words });
    } catch (e) {
      if (seq === aiSeq.current) setAi({ status: "error", result: null, error: (e as Error).message });
    }
  };

  // Web and book searches (opt-in) feed the similarity check.
  const startSearches = async (text: string) => {
    const b0 = settings.bib ? bibStart(text) : -1;
    const body = b0 >= 0 ? text.slice(0, b0) : text;
    const web = webOn(prefs), books = !!(prefs.internet && prefs.books);
    if (!web && !books) return;
    setSearching(true);
    const out: Source[] = [], notes: string[] = [];
    try {
      if (web) {
        const res = await webSearch(body, prefs.searchKey!.trim(), prefs.webQueries ?? 10, (d, t) => setSim({ status: "running", note: `Searching the web ${Math.min(d + 1, t)} of ${t}…` }));
        out.push(...res.sources.map((s) => ({ id: uid(), name: s.name, kind: "internet" as const, text: s.text, toks: tokenize(s.text), meta: s.meta })));
        notes.push(`Web search: ${plural(res.searched, "phrase")} searched, ${plural(res.sources.length, "page")} compared.`);
      }
      if (books) {
        const res = await bookSearch(body, prefs.bookQueries ?? 10, (d, t) => setSim({ status: "running", note: `Searching inside books ${d} of ${t}…` }));
        out.push(...res.sources.map((s) => ({ id: uid(), name: s.name, kind: "library" as const, text: s.text, toks: tokenize(s.text), meta: s.meta })));
        notes.push(`Open Library: ${plural(res.sources.length, "book")} with matching text.`);
      }
    } catch (e) { notes.push(`Search failed: ${(e as Error).message}`); }
    setFound(out);
    setWebNote(notes.join(" "));
    setSearching(false);
  };

  /* ---------- a new document starts all three checks ---------- */
  const openDoc = (d: Omit<Doc, "id"> | null) => {
    if (!d) { setDoc(null); return; }
    const next = { ...d, id: uid() };
    setDoc(next);
    setRun(null);
    setFound([]);
    setIgnored(new Set());
    setIgnoredRules(new Set());
    setCiteOrder([]);
    setWebNote("");
    setGrammar({ status: "queued", issues: [] });
    setSim({ status: "queued" });
    edited.current = false;
    draftId.current = null;
    const project = projectKey(next.name);
    const drafts: Source[] = [];
    const seen = new Set<string>();
    for (const h of [...history].reverse()) {
      if (h.project !== project || h.text === next.text || seen.has(h.text) || drafts.length >= 10) continue;
      seen.add(h.text);
      drafts.push({ id: `draft:${h.id}`, name: `${h.label} (${new Date(h.date).toLocaleDateString()})`, kind: "draft", text: h.text, toks: tokenize(h.text) });
    }
    setPriorDrafts(drafts);
    setSkipIds(new Set(drafts.map((x) => x.id))); // previous drafts are compared but excluded from the index by default
    setTab("similarity");
    setView("check");
    startAi(next.text);
    startSearches(next.text);
    scrollTo(0, 0);
  };

  /* ---------- grammar: Harper on every text change (cached per paragraph), LanguageTool if enabled ---------- */
  const text = doc?.text;
  useEffect(() => {
    if (text == null) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setGrammar((g) => ({ ...g, status: "running", pct: g.status === "done" ? undefined : 0 }));
      try {
        let found = await harperCheck(text, (pct) => { if (!cancelled) setGrammar((g) => (g.status === "running" ? { ...g, pct } : g)); });
        let ltNote: string | undefined;
        if (prefs.lt) {
          try {
            found = mergeIssues(found, await languageToolCheck(text, { url: prefs.ltUrl, language: prefs.ltLang }));
          } catch (e) { ltNote = `LanguageTool: ${(e as Error).message}.`; }
        }
        if (!cancelled) setGrammar({ status: "done", issues: found, ltNote });
      } catch (e) {
        if (!cancelled) setGrammar({ status: "error", issues: [], error: (e as Error).message });
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [text, prefs.lt, prefs.ltUrl, prefs.ltLang]);

  const issues = useMemo(() => grammar.issues.filter((i) => !ignored.has(i.id) && !ignoredRules.has(i.rule)), [grammar.issues, ignored, ignoredRules]);
  const grammarScore = grammar.status === "done" && doc ? writingScore(issues, wordCount(doc.text)) : undefined;

  /* ---------- similarity: re-runs when the text, sources or settings change ---------- */
  const allSources = useMemo(() => {
    const all: Source[] = [...sources, ...found].map((s) => ({ ...s, meta: meta[s.name] ?? s.meta }));
    if (useSaved && doc) for (const d of saved) if (d.text !== doc.text) all.push({ id: d.id, name: d.name, kind: d.own ? "own" : "saved", text: d.text, toks: tokenize(d.text), meta: meta[d.name] });
    return [...all, ...priorDrafts];
  }, [sources, found, useSaved, saved, priorDrafts, doc, meta]);

  useEffect(() => {
    if (!doc || searching) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!allSources.length) { setSim({ status: "needs-sources" }); setRun(null); return; }
      setSim((s) => ({ ...s, status: "running", note: undefined }));
      const skip = new Set(allSources.map((s, i) => (skipIds.has(s.id) ? i : -1)).filter((i) => i >= 0));
      try {
        const r = await runSimilarity(doc, allSources, settings, skip);
        if (cancelled) return;
        const pend = pendingRecheck.current;
        pendingRecheck.current = null;
        let recheck: Recheck | undefined;
        if (pend) {
          const end = pend.at + pend.len;
          const stillMatches = pend.sid != null && doc.toks.some((x, i) => x.s >= pend.at && x.e <= end && allSources[r.owner.get(i) ?? -1]?.name === pend.res.source);
          const piece = doc.text.slice(pend.at, end);
          recheck = { action: pend.res.action, source: pend.res.source, stillMatches,
            cited: pend.res.action === "cited" || (pend.res.action === "rewritten" && /\(([^()]*\d{4}|[^()]*n\.d\.)[^()]*\)|\[\d+\]/.test(piece)),
            meter: pend.mine && pend.sourcePassage ? closeness(pend.mine, pend.sourcePassage) : undefined };
        }
        setRun((prev) => prev
          ? { ...prev, all: allSources, skip, settings, r, ...(recheck ? { recheck } : {}) }
          : { all: allSources, skip, settings, r, checked: new Date(), startIndex: r.index, project: projectKey(doc.name), resolutions: [], undo: [] });
        setSim({ status: "done" });
      } catch (e) {
        if (!cancelled) setSim({ status: "error", error: (e as Error).message });
      }
    }, 200);
    return () => { cancelled = true; clearTimeout(t); };
  }, [doc, allSources, settings, skipIds, searching]);

  /* ---------- draft history: the first check of each document records its three scores ---------- */
  const entryFor = (d: Doc, base: Partial<DraftCheck>): DraftCheck => ({
    id: uid(), project: projectKey(d.name), docName: d.name, label: "", date: new Date().toISOString(),
    index: run?.r.index ?? null, grammar: grammarScore,
    breakdown: run ? run.r.order.map((s) => ({ name: run.all[s].name, kind: run.all[s].kind, pct: Math.round((1000 * run.r.counts.get(s)!) / run.r.total) / 10 })) : [],
    passages: run ? run.r.passages.map((p) => ({ key: passageKey(d.text.slice(p.s, p.end)), text: d.text.slice(p.s, p.end), source: run.all[p.sid].name })) : [],
    text: d.text, ...base,
  });

  useEffect(() => {
    if (!doc || edited.current) return;
    if (sim.status !== "done" && sim.status !== "needs-sources") return;
    if (grammarScore == null) return;
    const aiVal = ai.result?.score ?? (ai.status === "running" || ai.status === "queued" ? undefined : null);
    (async () => {
      const prev = await loadHistory();
      const existing = prev.find((h) => h.id === draftId.current);
      const project = projectKey(doc.name);
      const entry = entryFor(doc, existing
        ? { id: existing.id, label: existing.label, date: existing.date, ai: aiVal ?? existing.ai }
        : { label: `Draft ${prev.filter((h) => h.project === project).length + 1}`, ai: aiVal });
      draftId.current = entry.id;
      const next = existing ? prev.map((h) => (h.id === entry.id ? entry : h)) : [...prev, entry];
      setHistory(next);
      await storeHistory(next);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entryFor reads the same state listed here
  }, [doc, sim.status, run, grammarScore, ai.status, ai.result]);

  const saveDraft = async (label: string) => {
    if (!doc) return;
    const prev = await loadHistory();
    const next = [...prev, entryFor(doc, { label, ai: ai.stale ? null : ai.result?.score ?? null })];
    setHistory(next);
    await storeHistory(next);
  };

  /* ---------- editing the text (grammar fixes, remedies, free edits) ---------- */
  const setText = (t: string) => {
    if (!doc || t === doc.text) return;
    edited.current = true;
    setDoc({ ...doc, text: t, toks: tokenize(t) });
    setAi((a) => (a.result ? { ...a, stale: true } : a));
  };

  const applyEdit = (s: number, e: number, replacement: string, res: Omit<Resolution, "id" | "at">, recheckOf?: { sid: number; mine?: string; sourcePassage?: string }) => {
    if (!run || !doc) return;
    let t = doc.text.slice(0, s) + replacement + doc.text.slice(e);
    let at = s;
    if (!replacement) { // tidy the gap left by a removal
      const before = t.slice(0, s).replace(/[ \t]+$/, ""), after = t.slice(s).replace(/^[ \t]+/, "");
      const glue = /^[.,;:!?)]/.test(after) || /[\n(]$/.test(before) || !before ? "" : " ";
      t = before + glue + after;
      at = before.length;
    }
    pendingRecheck.current = { res, at, len: replacement.length, sid: recheckOf?.sid, mine: recheckOf?.mine, sourcePassage: recheckOf?.sourcePassage };
    setRun({ ...run, resolutions: [...run.resolutions, { ...res, id: uid(), at: new Date().toISOString() }], undo: [...run.undo, { text: doc.text, resolutions: run.resolutions }] });
    setText(t);
  };

  const undo = () => {
    if (!run?.undo.length || !doc) return;
    const last = run.undo[run.undo.length - 1];
    setRun({ ...run, resolutions: last.resolutions, undo: run.undo.slice(0, -1), recheck: undefined });
    setText(last.text);
  };

  const recompute = (patch: Partial<Pick<RunState, "settings" | "skip">>) => {
    if (patch.settings) setSettings(patch.settings);
    if (patch.skip && run) setSkipIds(new Set([...patch.skip].map((i) => run.all[i].id)));
  };

  const addSourceFiles = async (files: File[]) => {
    const add: Source[] = [];
    for (const f of files)
      try {
        const ex = await extract(f);
        const toks = tokenize(ex.text);
        if (toks.length) add.push({ id: uid(), name: f.name, kind: "file", text: ex.text, toks });
      } catch { /* unreadable files are reported by the Sources card; this quick path skips them */ }
    setSources((s) => [...s, ...add]);
  };

  const saveDoc = async (own: boolean) => {
    if (!doc) return;
    const next = [...saved.filter((d) => d.text !== doc.text), { id: uid(), name: doc.name, text: doc.text, own, savedAt: new Date().toISOString() }];
    setSaved(next);
    return storeSaved(next);
  };

  const newCheck = () => { aiSeq.current++; setRun(null); setDoc(null); setView("check"); scrollTo(0, 0); };

  const downloadReport = () => {
    if (!doc) return;
    download(`${baseName(doc.name)}_origincheck_report.html`, reportHtml({
      docName: doc.name, text: doc.text, toks: doc.toks, r: run?.r ?? null, sources: run?.all ?? [], settings, checked: run?.checked ?? new Date(),
      grammar: grammarScore != null ? { score: grammarScore, issues } : undefined,
      ai: { result: ai.stale ? null : ai.result, signals: ai.signals,
        note: ai.stale ? "The text changed after the estimate; re-run it in the app." : ai.status === "short" ? "Not enough text to estimate." : ai.status === "off" ? "Turned off." : undefined },
    }), "text/html");
  };
  const downloadCorrected = (kind: "docx" | "txt") => {
    if (!doc) return;
    if (kind === "txt") return download(`${baseName(doc.name)}_corrected.txt`, doc.text, "text/plain");
    exportDocx({ docName: doc.name, fileName: `${baseName(doc.name)}_corrected.docx`, text: doc.text, headings: doc.headings, refs: [], style, hasBib: bibStart(doc.text) >= 0 });
  };

  const ctx = useMemo(() => ({ style, metaFor, ieeeN }), [style, metaFor, ieeeN]);
  const go = (v: View, t?: Tab) => { setView(v); if (t) setTab(t); };
  const userSources = sources.length + found.length;

  const NAV: { id: string; label: string; short: string; icon: React.ReactNode; on: () => void; active: boolean }[] = [
    { id: "check", label: "Check document", short: "Check", icon: <FileCheck size={18} />, on: () => go("check"), active: view === "check" && !doc },
    { id: "similarity", label: "Similarity", short: "Similarity", icon: <FileSearch size={18} />, on: () => go("check", "similarity"), active: view === "check" && !!doc && tab === "similarity" },
    { id: "grammar", label: "Grammar", short: "Grammar", icon: <SpellCheck size={18} />, on: () => go("check", "grammar"), active: view === "check" && !!doc && tab === "grammar" },
    { id: "ai", label: "AI indicator", short: "AI", icon: <Bot size={18} />, on: () => go("check", "ai"), active: view === "check" && !!doc && tab === "ai" },
    { id: "history", label: "History", short: "History", icon: <History size={18} />, on: () => go("history"), active: view === "history" },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <header className="top sticky top-0 z-30 flex min-h-14 items-center gap-2 bg-top px-4 py-2 text-white sm:gap-3">
        <button onClick={() => go("check")} className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight cursor-pointer" aria-label="origincheck home">
          <Logo /><span className={cx(doc && "max-[399px]:hidden")}>origincheck</span>
        </button>
        {doc && view === "check" && <div className="hidden min-w-0 flex-1 truncate text-sm opacity-90 sm:block" title={doc.name}>{doc.name}</div>}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {doc && <TopBtn onClick={newCheck} label="New check" short="New" />}
          <TopBtn onClick={() => go(view === "library" ? "check" : "library")} label="Saved documents" icon={<LibIcon size={15} />} iconOnly pressed={view === "library"} />
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/guide/`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/30 bg-white/12 px-2.5 text-[13.5px] font-medium hover:bg-white/22" aria-label="Guide to avoiding plagiarism">
            <BookOpen size={15} /><span className="hidden lg:inline">Guide</span>
          </a>
          <button onClick={toggleTheme} className="inline-grid size-8 place-items-center rounded-lg border border-white/30 bg-white/12 hover:bg-white/22 cursor-pointer" aria-label="Toggle dark mode">
            <Moon size={16} className="dark:hidden" /><Sun size={16} className="hidden dark:block" />
          </button>
        </div>
      </header>

      <div className="md:flex">
        <nav aria-label="Tools" className="no-print sticky top-14 hidden h-[calc(100vh-56px)] w-52 shrink-0 flex-col gap-1 border-r border-line bg-panel p-3 md:flex">
          {NAV.map((n) => <button key={n.id} onClick={n.on} aria-current={n.active ? "page" : undefined} data-nav={n.id}
            className={cx("flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm font-medium hover:bg-soft", n.active && "bg-soft text-accent")}>
            {n.icon}{n.label}</button>)}
        </nav>

        <main className="min-w-0 flex-1 pb-24 md:pb-10">
          {view === "history" && <Drafts history={history} setHistory={(h) => { setHistory(h); storeHistory(h); }} />}
          {view === "library" && <Library saved={saved} setSaved={(s) => { setSaved(s); storeSaved(s); }}
            onDeletedAll={() => { setSaved([]); setHistory([]); setMeta({}); setPrefsState({}); delete document.documentElement.dataset.theme; }} />}
          {view === "check" && !doc && <Setup doc={doc} setDoc={openDoc} sources={sources} setSources={setSources} settings={settings} setSettings={setSettings}
            prefs={prefs} setPrefs={setPrefs} saved={saved} useSaved={useSaved} setUseSaved={setUseSaved} drafts={0} />}
          {view === "check" && doc && <div className="mx-auto grid max-w-[1400px] gap-4 px-4 pt-5">
            <Dashboard active={tab} onOpen={setTab} onAddSources={addSourceFiles}
              sim={{ status: sim.status, index: run?.r.index, sources: run?.all.length ?? allSources.length, note: sim.note ?? (searching ? "Searching…" : undefined) }}
              grammar={{ status: grammar.status, pct: grammar.pct, score: grammarScore, issues }}
              ai={{ status: ai.status, pct: ai.pct, stage: ai.stage, mb: ai.mb, result: ai.result, stale: ai.stale }} />

            <div className="no-print flex flex-wrap gap-2">
              <Button size="sm" onClick={downloadReport} id="dlReport"><Download size={14} />Download report</Button>
              <Button size="sm" onClick={() => print()} className="max-sm:hidden"><Printer size={14} />Print / PDF</Button>
              <Button size="sm" onClick={() => downloadCorrected("docx")}><Download size={14} />Corrected .docx</Button>
              <Button size="sm" onClick={() => downloadCorrected("txt")}><Download size={14} />Corrected .txt</Button>
            </div>

            <T.Root value={tab} onValueChange={(v) => setTab(v as Tab)}>
              <T.List aria-label="Report" className="no-print mb-4 flex overflow-x-auto border-b border-line">
                {([["similarity", "Similarity"], ["grammar", "Grammar"], ["ai", "AI indicator"]] as const).map(([id, label]) =>
                  <T.Trigger key={id} value={id} className="shrink-0 cursor-pointer border-b-2 border-transparent px-4 py-2.5 text-sm font-semibold text-mute data-[state=active]:border-accent data-[state=active]:text-accent">{label}</T.Trigger>)}
              </T.List>
              <T.Content value="similarity" className="grid gap-4 outline-none">
                <details className="no-print rounded-xl border border-line bg-panel px-4 py-3" open={sim.status === "needs-sources" || undefined}>
                  <summary className="cursor-pointer text-sm font-semibold">Sources ({userSources}{saved.length && useSaved ? ` + ${saved.length} saved` : ""}{priorDrafts.length ? ` + ${plural(priorDrafts.length, "draft")}` : ""}) — add more</summary>
                  <SourcesCard compact sources={sources} setSources={setSources} prefs={prefs} setPrefs={setPrefs} />
                </details>
                {run ? <Report doc={doc} run={run} ctx={ctx} webNote={webNote} citeFor={citeFor} prefs={prefs} setPrefs={setPrefs}
                    recompute={recompute} applyEdit={applyEdit} undo={undo} saveDoc={saveDoc} saveMeta={saveMeta} saveDraft={saveDraft} />
                  : <p className="rounded-xl border border-line bg-panel p-5 text-sm" role="status">
                    {sim.status === "needs-sources" ? "Add sources above to run the similarity check." : sim.status === "error" ? `The similarity check failed: ${sim.error}` : sim.note ?? "Checking similarity…"}</p>}
              </T.Content>
              <T.Content value="grammar" className="outline-none">
                <GrammarTab text={doc.text} issues={issues} busy={grammar.status === "running"} ltOn={!!prefs.lt} ltNote={grammar.ltNote ?? grammar.error}
                  onAccept={(i, s) => setText(applySuggestion(doc.text, i, s))}
                  onIgnore={(i) => setIgnored((x) => new Set(x).add(i.id))}
                  onIgnoreRule={(r) => setIgnoredRules((x) => new Set(x).add(r))}
                  onAcceptAllSpelling={() => setText(applyAll(doc.text, issues.filter((i) => i.category === "spelling" && i.severity !== "style")))}
                  onEditText={setText} onDownload={downloadCorrected} />
              </T.Content>
              <T.Content value="ai" className="outline-none">
                <AiTab s={ai} onRerun={() => startAi(doc.text)} onEnable={() => { setPrefs({ ai: true }); startAi(doc.text, true); }} />
              </T.Content>
            </T.Root>
          </div>}
        </main>
      </div>

      <nav aria-label="Tools" className="no-print fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-panel md:hidden">
        {NAV.map((n) => <button key={n.id} onClick={n.on} aria-current={n.active ? "page" : undefined} data-nav-mobile={n.id}
          className={cx("flex cursor-pointer flex-col items-center gap-0.5 py-2 text-[11px] font-medium", n.active ? "text-accent" : "text-mute")}>
          {n.icon}{n.short}</button>)}
      </nav>
    </MotionConfig>
  );
}

// Web search runs when internet features are on and a key is set; it sends only short phrases.
export const webOn = (p: Prefs) => !!p.internet && p.webSearch !== false && !!p.searchKey?.trim();

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
