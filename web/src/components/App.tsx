"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MotionConfig } from "motion/react";
import { ArrowLeft, BookOpen, BookSearch, Bot, NotebookPen, Download, FileCheck, FileSearch, History, Library as LibIcon, Moon, PenLine, Pilcrow, Printer, Settings as SettingsIcon, ShieldAlert, SpellCheck, Sun } from "lucide-react";
import { findTerms } from "@/lib/confidential";
import { type CiteMeta, type Result, type Settings, type Source, type Tok, bibStart, tokenize } from "@/lib/similarity";
import { plural } from "@/lib/words";
import { hasHangul, pickQueries } from "@/lib/queries";
import { type PassageMatch, crossLangPairs, lexicalPass, semanticPass } from "@/lib/hybrid";
import { detectLanguage } from "@/lib/language";
import { exportOriginalityPdf, needsHtmlReport } from "@/lib/originalityPdf";
import { type History as WritingHistory, type Origin, SNAPSHOT_AFTER_MS, addSnapshot, deleteHistory as deleteWritingHistory,
  exportReport as exportWritingReport, loadHistory as loadWritingHistory, newHistory, recordChange, saveHistory as saveWritingHistory } from "@/lib/writingHistory";
import { type Style, inText } from "@/lib/citations";
import { closeness, type Closeness } from "@/lib/closeness";
import { aiScore } from "@/lib/aiScore";
import { type Issue, applyAll, applySuggestion, mergeIssues, writingScore } from "@/lib/grammar";
import { type SourceGroup, type SourceRun, bodySentences, runAi, runAllSources, runEmbeddings, runSimilarity, wordCount } from "@/lib/checks";
import { harperCheck, isEnglish, languageToolCheck, setUserWords, warmGrammar } from "@/lib/harper";
import { baseName, download, exportDocx, reportHtml } from "@/lib/exporters";
import { extract } from "@/lib/extract";
import {
  type DraftCheck, type LibraryItem, type Prefs, type SavedDoc, loadHistory, loadLibrary, loadMeta, loadPrefs, loadSaved, projectKey,
  storeHistory, storeLibrary, storeMeta, storePrefs, storeSaved, uid,
} from "@/lib/store";
import { Button, Dialog, Logo, type Status, cx } from "./ui";
import Setup, { SettingsCard, SourcesCard } from "./Setup";
import { ServerSettings } from "./SettingsPage";
import RewriteTab from "./RewriteTab";
import WritePage from "./WritePage";
import ExternalCheck from "./ExternalCheck";
import PaidCheck from "./PaidCheck";
import Report, { RecheckCard } from "./Report";
import ParagraphCheck, { type Seed } from "./paragraph/ParagraphCheck";
import { FixMatches, WriteMatches } from "./remedies";
import Drafts from "./Drafts";
import Library from "./Library";
import MyLibrary from "./MyLibrary";
import FindBook from "./FindBook";
import Dashboard, { NextSteps, type Step, type Tab } from "./Dashboard";
import GrammarTab from "./GrammarTab";
import ImproveWriting from "./ImproveWriting";
import AiTab, { type AiState } from "./AiTab";

export type HStyle = "h1" | "h2" | "h3";
export interface Doc { id: string; name: string; text: string; toks: Tok[]; headings: Map<string, HStyle>; kind: "file" | "paste"; aiAssisted?: number }
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

/** What /api/config tells the browser: feature flags and which sources are configured (never keys). */
export interface ServerConfig {
  aiLikelihood: boolean;
  languageTool: boolean;
  improve: "anthropic" | "ollama" | "gateway" | null;
  maxQueries: number;
  paid?: { label: string; missing: string | null; sandbox: boolean };
  translate?: boolean;
  improveModel?: string;
  improveNote?: string;
  sources: { id: string; label: string; group: string; missing: string | null }[];
}
export interface Hybrid { status: Status; note?: string; near: PassageMatch[]; para: PassageMatch[] }
const GROUP_KIND = { refs: "scholarly", web: "internet", books: "library", lists: "library" } as const;
const GROUP_SERVICES: Record<SourceGroup, string> = {
  refs: "Crossref, OpenAlex, PubMed, Semantic Scholar, arXiv, CORE, Europe PMC, DataCite, OSF Preprints, INSPIRE-HEP and Unpaywall",
  web: "Wikipedia and the configured web search (Brave, Jina or Google)",
  books: "Open Library (Internet Archive) and Google Books",
  lists: "Project Gutenberg and PoetryDB",
};
type View = "check" | "history" | "library" | "settings" | "paragraph" | "books";
const TOOL_TITLE: Record<Tab, string> = { write: "Write", similarity: "Plagiarism check", grammar: "Grammar", ai: "AI indicator", rewrite: "Rewrite" };
type PrivacyKind = "search" | "improve" | "paid";
const PRIVACY: Record<PrivacyKind, { title: string; description: string; note: string }> = {
  search: { title: "Before searching outside your browser",
    description: "Your document stays in your browser. To search, origincheck sends short excerpts (at most 16 words each) or the addresses you enter to:",
    note: "You can turn each input off with its Yes/No switch in “Sources to compare against”." },
  improve: { title: "Before revising with AI",
    description: "The passage you selected (not the rest of your document) is sent through origincheck's server to:",
    note: "Each passage you revise is sent again. Accepted AI edits are labelled “AI-assisted” in your exports." },
  paid: { title: "Before sending your document to a paid checker",
    description: "Your whole document is sent through origincheck's server to:",
    note: "It is compared but not added to the provider's database, and the provider deletes the scan after 24 hours. Each scan uses paid credits." },
};
/** What each tool page says before a document is added. */
const INTRO: Record<Tab, { title: string; text: string }> = {
  write: { title: "Write", text: "Write in origincheck's editor; every check updates as you go." },
  similarity: { title: "Plagiarism check", text: "Compares your document with your sources, publications, the web and books. Copied wording is highlighted and counted in the similarity index; lightly edited copying and paraphrase are shown separately. Add your document below, then add sources or use Run all sources." },
  grammar: { title: "Grammar check", text: "Spelling, grammar, punctuation and style, checked on your device. No sources needed: add or paste your document below." },
  ai: { title: "AI indicator", text: "An estimate of how likely the text is machine-written. It is a signal, never proof. Add your document below." },
  rewrite: { title: "Rewrite", text: "Click any paragraph and have it made clearer, shorter, more formal or casual, plainer, or free of filler, accepting each change yourself. It uses a free model on your own computer by default. Passages that match a source are rewritten by you in the plagiarism check. Add your document below." },
};
type PendingRecheck = { res: Omit<Resolution, "id" | "at">; at: number; len: number; sid?: number; mine?: string; sourcePassage?: string };

export default function App() {
  const [view, setView] = useState<View>("check");
  const [paraSeed, setParaSeed] = useState<Seed | null>(null); // a flagged passage sent to Paragraph check
  const [tool, setTool] = useState<"check" | Tab>("check"); // which sidebar tool the user picked
  const [doc, setDoc] = useState<Doc | null>(null);
  const [wh, setWh] = useState<WritingHistory | null>(null);
  const docText = doc?.text ?? "";
  const docLang = useMemo(() => detectLanguage(docText), [docText]);
  const [sources, setSources] = useState<Source[]>([]);
  const [found, setFound] = useState<Source[]>([]); // results of "Run all sources" for this document
  const [cfg, setCfg] = useState<ServerConfig | null>(null);
  const [runs, setRuns] = useState<SourceRun[] | null>(null);
  const [runningAll, setRunningAll] = useState(false);
  const [hybrid, setHybrid] = useState<Hybrid>({ status: "queued", near: [], para: [] });
  const [privacyAsk, setPrivacyAsk] = useState<{ services: string[]; kind: PrivacyKind; resolve: (ok: boolean) => void } | null>(null);
  const [priorDrafts, setPriorDrafts] = useState<Source[]>([]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [skipIds, setSkipIds] = useState<Set<string>>(new Set());
  const [prefs, setPrefsState] = useState<Prefs>({});
  const whOn = prefs.writingHistory !== false; // writing history: on unless the user turns it off (shown on the Write page)
  const [useSaved, setUseSaved] = useState(true);
  const [saved, setSaved] = useState<SavedDoc[]>([]);
  const [library, setLibraryState] = useState<LibraryItem[]>([]); // My library: the user's reference books and papers
  const setLibrary = (items: LibraryItem[]) => { setLibraryState(items); storeLibrary(items); };
  const [history, setHistory] = useState<DraftCheck[]>([]);
  const [meta, setMeta] = useState<Record<string, CiteMeta>>({});
  const [citeOrder, setCiteOrder] = useState<string[]>([]);

  const [run, setRun] = useState<RunState | null>(null);
  const [sim, setSim] = useState<{ status: Status; pct?: number; note?: string; error?: string }>({ status: "queued" });
  const [searching, setSearching] = useState(false);
  const [webNote, setWebNote] = useState("");
  const [grammar, setGrammar] = useState<{ status: Status; pct?: number; issues: Issue[]; error?: string; ltNote?: string; englishOnly?: boolean }>({ status: "queued", issues: [] });
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [ignoredRules, setIgnoredRules] = useState<Set<string>>(new Set());
  const [ai, setAi] = useState<AiState>({ status: "queued", result: null });

  const pendingRecheck = useRef<PendingRecheck | null>(null);
  const draftId = useRef<string | null>(null);
  const edited = useRef(false);
  const loadCfg = () => fetch("/api/config").then((r) => (r.ok ? r.json() : null)).then((c) => setCfg(c)).catch(() => setCfg(null));

  useEffect(() => {
    warmGrammar();
    loadCfg();
    Promise.all([loadSaved(), loadHistory(), loadMeta(), loadLibrary()]).then(([s, h, m, lib]) => {
      setPrefsState(loadPrefs());
      setSaved(s);
      setLibrary(lib);
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
  const aiAvailable = !!cfg?.aiLikelihood;
  const startAi = async (text: string, enabled = aiAvailable && prefs.ai !== false) => {
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

  /* ---------- privacy notice before anything is sent to a third party ---------- */
  const confirmPrivacy = (services: string[], kind: PrivacyKind = "search") => {
    const key = [...services].sort().join("|");
    if (prefs.privacyAck && key.split("|").every((s) => prefs.privacyAck!.split("|").includes(s))) return Promise.resolve(true);
    return new Promise<boolean>((resolve) => setPrivacyAsk({ services, kind, resolve: (ok) => {
      if (ok) setPrefs({ privacyAck: [...new Set([...(prefs.privacyAck?.split("|") ?? []), ...services])].sort().join("|") });
      setPrivacyAsk(null);
      resolve(ok);
    } }));
  };

  /* ---------- "Run all sources": search every enabled source with short query chunks, streamed ---------- */
  const runAll = async () => {
    if (!doc) return;
    const groups = (["refs", "web", "books", "lists"] as SourceGroup[]).filter((g) => prefs.inputs?.[g] !== false);
    if (!groups.length) return;
    // a document in another language is also searched with English translations of half its phrases
    const translating = !!cfg?.translate && prefs.translateSearch !== false && !["eng", "und"].includes(docLang.code);
    const services = [...groups.map((g) => GROUP_SERVICES[g]), ...(translating ? ["LibreTranslate (the same short phrases, to translate them into English)"] : [])];
    if (!(await confirmPrivacy(services))) return;
    let queries = pickQueries(doc.text, { max: cfg?.maxQueries ?? 8, skipQuotedAndCited: settings.quotes });
    if (!queries.length) { setWebNote("No sentences long enough to search (8 or more words)."); return; }
    setRunningAll(true);
    setSearching(true);
    setRuns([]);
    let note = "";
    if (translating) {
      const keep = Math.ceil(queries.length / 2);
      try {
        const r = await fetch("/api/translate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ q: queries.slice(0, queries.length - keep), target: "en" }) });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        queries = [...queries.slice(0, keep), ...(j.translated as string[]).filter((t) => t.split(/\s+/).length >= 4)];
        note = ` ${docLang.name} phrases were also searched in English translation.`;
      } catch (e) { note = ` Translation failed (${(e as Error).message}); searched in ${docLang.name} only.`; }
    }
    const korean = hasHangul(doc.text);
    const added: Source[] = [];
    const seen = new Set<string>();
    try {
      await runAllSources(queries, groups, korean, (e) => {
        if (e.type === "start") setRuns(e.sources.map((s) => ({ source: s.id, label: s.label, status: "running", ms: 0, queries: queries.length, results: [] })));
        if (e.type !== "source") return;
        setRuns((rs) => (rs ?? []).map((r) => (r.source === e.run.source ? e.run : r)));
        const group = (cfg?.sources.find((s) => s.id === e.run.source)?.group ?? "web") as SourceGroup;
        for (const h of e.run.results) {
          const text = h.text && h.text.split(/\s+/).length >= 12 ? h.text : h.snippet;
          const key = h.doi?.toLowerCase() || h.url || h.title;
          if (!text || seen.has(key)) continue;
          seen.add(key);
          const [first, ...rest] = h.authors;
          added.push({
            id: uid(), name: h.title, kind: GROUP_KIND[group], input: group, text, toks: tokenize(text), lang: detectLanguage(text).code,
            found: { adapter: e.run.label, url: h.url, doi: h.doi, oaUrl: h.oaUrl, authors: h.authors, year: h.year },
            meta: { title: h.title, year: h.year ? String(h.year) : undefined, doi: h.doi, url: h.url, accessed: new Date().toISOString().slice(0, 10),
              authors: [first, ...rest].filter(Boolean).map((a) => { const parts = a!.split(/\s+/); return { family: parts.pop()!, given: parts.join(" ") || undefined }; }) },
          });
        }
      });
      setWebNote(`Run all sources: ${plural(queries.length, "phrase")} searched, ${plural(added.length, "result")} compared.${note}`);
    } catch (e) {
      setWebNote(`Run all sources failed: ${(e as Error).message}`);
    }
    setFound(added);
    setSearching(false);
    setRunningAll(false);
  };

  // The search starts by itself when a document is added (the privacy notice still comes first, once).
  const autoSearched = useRef<string | null>(null);
  useEffect(() => {
    if (!doc || !cfg || prefs.autoSearch === false || autoSearched.current === doc.id) return;
    autoSearched.current = doc.id;
    runAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id, cfg]);

  /* ---------- a new document starts all three checks ---------- */
  const openDoc = (d: Omit<Doc, "id"> | null) => {
    setWh(null); // the new document's writing history loads in an effect
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
    setRuns(null);
    setHybrid({ status: "queued", near: [], para: [] });
    setView("check");
    startAi(next.text);
    scrollTo(0, 0);
  };

  /* ---------- grammar: Harper on every text change (cached per paragraph), LanguageTool if enabled ---------- */
  const text = doc?.text;
  const ltOn = !!(cfg?.languageTool && prefs.lt);
  const dictionary = prefs.dictionary;
  useEffect(() => {
    if (text == null) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      if (!isEnglish(text)) { // Harper is English-only
        setGrammar({ status: "done", issues: [], ltNote: undefined, englishOnly: true });
        return;
      }
      setGrammar((g) => ({ ...g, status: "running", pct: g.status === "done" ? undefined : 0, englishOnly: false }));
      try {
        await setUserWords(dictionary ?? []);
        let found = await harperCheck(text, (pct) => { if (!cancelled) setGrammar((g) => (g.status === "running" ? { ...g, pct } : g)); });
        let ltNote: string | undefined;
        if (ltOn) {
          try {
            found = mergeIssues(found, await languageToolCheck(text, { url: "/api/languagetool", language: prefs.ltLang }));
          } catch (e) { ltNote = `LanguageTool: ${(e as Error).message}.`; }
        }
        if (!cancelled) setGrammar({ status: "done", issues: found, ltNote });
      } catch (e) {
        if (!cancelled) setGrammar({ status: "error", issues: [], error: (e as Error).message });
      }
    }, 400); // debounce: 300–500 ms after typing stops
    return () => { cancelled = true; clearTimeout(t); };
  }, [text, ltOn, prefs.ltLang, dictionary]);

  const issues = useMemo(() => grammar.issues.filter((i) => !ignored.has(i.id) && !ignoredRules.has(i.rule)), [grammar.issues, ignored, ignoredRules]);
  const grammarScore = grammar.status === "done" && doc ? writingScore(issues, wordCount(doc.text)) : undefined;

  /* ---------- similarity: re-runs when the text, sources or settings change ---------- */
  const inputs = prefs.inputs;
  // My library, tokenized once per change (books are long)
  const libSources = useMemo(() => library.map((b): Source => ({ id: b.id, name: b.name, kind: "mylib", text: b.text, toks: tokenize(b.text), meta: b.meta })), [library]);
  const useLibrary = prefs.useLibrary !== false;
  const allSources = useMemo(() => {
    const all: Source[] = [...sources, ...found].filter((s) => !s.input || inputs?.[s.input] !== false).map((s) => ({ ...s, meta: meta[s.name] ?? s.meta }));
    if (useSaved && doc) for (const d of saved) if (d.text !== doc.text) all.push({ id: d.id, name: d.name, kind: d.own ? "own" : "saved", text: d.text, toks: tokenize(d.text), meta: meta[d.name] });
    if (useLibrary) for (const b of libSources) all.push({ ...b, meta: meta[b.name] ?? b.meta });
    return [...all, ...priorDrafts];
  }, [sources, found, useSaved, saved, priorDrafts, doc, meta, inputs, useLibrary, libSources]);

  /* ---------- hybrid pass: near-verbatim (lexical) then paraphrase (embeddings), after each similarity result ---------- */
  const paraphraseOn = prefs.paraphrase !== false;
  const hybridSeq = useRef(0);
  const runR = run?.r, runAllSrc = run?.all, runSkip = run?.skip;
  useEffect(() => {
    if (!doc || !runR || !runAllSrc || !runSkip) return;
    const seq = ++hybridSeq.current;
    const t = setTimeout(async () => {
      const { near, semantic, docUnits } = lexicalPass(doc, runAllSrc, runR, settings, runSkip);
      // sources in another language than the document share no words with it: compare meaning directly (multilingual model)
      const cands = [...semantic, ...crossLangPairs(docUnits, runAllSrc, docLang.code, runSkip)];
      setHybrid({ status: paraphraseOn && cands.length ? "running" : "done", near, para: [] });
      if (!paraphraseOn || !cands.length) return;
      try {
        const para = await semanticPass(doc.text, runAllSrc, cands, (texts) => runEmbeddings(texts, (p) => {
          if (seq === hybridSeq.current) setHybrid((h) => ({ ...h, note: p.stage === "download" ? `Downloading the paraphrase model (${p.mb ?? 118} MB, first time only)… ${p.pct}%` : `Comparing meaning… ${p.pct}%` }));
        }));
        if (seq === hybridSeq.current) setHybrid({ status: "done", near, para });
      } catch (e) {
        if (seq === hybridSeq.current) setHybrid({ status: "error", near, para: [], note: `Paraphrase detection failed: ${(e as Error).message}` });
      }
    }, 300);
    return () => clearTimeout(t);
  }, [doc, runR, runAllSrc, runSkip, settings, paraphraseOn, docLang.code]);

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
  const setText = (t: string, origin: Origin = "typed") => {
    if (!doc || t === doc.text) return;
    edited.current = true;
    if (whOn) setWh((h) => h && recordChange(h, doc.text, t, origin)); // writing history: where the new text came from
    setDoc({ ...doc, text: t, toks: tokenize(t) });
    setAi((a) => (a.result ? { ...a, stale: true } : a));
  };

  /* ---------- writing history: loaded per document, snapshotted after a pause, kept only in this browser ---------- */
  const textRef = useRef("");
  useEffect(() => { textRef.current = doc?.text ?? ""; });
  useEffect(() => {
    if (!doc) return; // cleared by openDoc / newCheck
    let live = true;
    const key = projectKey(doc.name);
    loadWritingHistory(key).then((h) => {
      if (!live) return;
      const origin: Origin = doc.kind === "file" ? "imported" : doc.text ? "pasted" : "typed";
      let next = h ?? newHistory(key, doc.name, doc.text, origin);
      // a new version of a document already in history (e.g. the next draft uploaded): record what changed
      if (h && h.lastText !== doc.text) next = addSnapshot(recordChange(h, h.lastText, doc.text, origin), doc.text, "import");
      setWh(next);
      if (whOn && next !== h) saveWritingHistory(next);
    });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);
  const whLastEdit = wh?.lastEditAt;
  useEffect(() => {
    if (!whOn || !whLastEdit) return;
    const t = setTimeout(() => setWh((h) => {
      if (!h) return h;
      const next = addSnapshot(h, textRef.current, "edit");
      if (next !== h) saveWritingHistory(next); // stored only together with a snapshot, so the stored parts always line up
      return next;
    }), SNAPSHOT_AFTER_MS);
    return () => clearTimeout(t);
  }, [whLastEdit, whOn]);
  const saveSnapshot = () => setWh((h) => { if (!h) return h; const next = addSnapshot(h, textRef.current, "save"); saveWritingHistory(next); return next; });
  const clearHistory = async () => {
    if (!doc || !wh) return;
    await deleteWritingHistory(wh.key);
    setWh(newHistory(wh.key, doc.name, doc.text, "imported")); // a fresh history from the current text (saved at the next snapshot)
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

  const newCheck = () => { aiSeq.current++; setRun(null); setDoc(null); setWh(null); setView("check"); scrollTo(0, 0); };

  /** The originality report as a PDF (cover, highlighted document, summary). Korean and other non-Latin text gets the HTML report. */
  const downloadReport = () => {
    if (!doc) return;
    if (needsHtmlReport(doc.text)) return downloadHtmlReport();
    const count = (sev: string) => issues.filter((i) => i.severity === sev).length;
    exportOriginalityPdf({
      docName: doc.name, text: doc.text, toks: doc.toks, r: run?.r ?? null, sources: run?.all ?? [], skip: run?.skip ?? new Set(),
      settings, checked: run?.checked ?? new Date(), checkId: doc.id.slice(0, 12),
      grammar: grammarScore != null ? { score: grammarScore, errors: count("error"), warnings: count("warning"), style: count("style") } : undefined,
      ai: ai.result && !ai.stale ? { result: ai.result } : ai.status === "short" ? { result: null, note: "Not enough text to estimate." } : undefined,
      history: wh && whOn ? exportWritingReport(wh).summary.line : undefined, aiAssisted: doc.aiAssisted,
    });
  };
  const downloadHtmlReport = () => {
    if (!doc) return;
    download(`${baseName(doc.name)}_origincheck_report.html`, reportHtml({
      docName: doc.name, text: doc.text, toks: doc.toks, r: run?.r ?? null, sources: run?.all ?? [], settings, checked: run?.checked ?? new Date(),
      aiAssisted: doc.aiAssisted, history: wh && whOn ? exportWritingReport(wh).summary.line : undefined, grammar: grammarScore != null ? { score: grammarScore, issues } : undefined,
      ai: { result: ai.stale ? null : ai.result, signals: ai.signals,
        note: ai.stale ? "The text changed after the estimate; re-run it in the app." : ai.status === "short" ? "Not enough text to estimate." : ai.status === "off" ? "Turned off." : undefined },
    }), "text/html");
  };
  const downloadCorrected = (kind: "docx" | "txt") => {
    if (!doc) return;
    if (kind === "txt") return download(`${baseName(doc.name)}_corrected.txt`, doc.text, "text/plain");
    exportDocx({ docName: doc.name, fileName: `${baseName(doc.name)}_corrected.docx`, text: doc.text, headings: doc.headings, refs: [], style, hasBib: bibStart(doc.text) >= 0, aiAssisted: doc.aiAssisted });
  };

  const ctx = useMemo(() => ({ style, metaFor, ieeeN }), [style, metaFor, ieeeN]);
  // Passages the similarity check matched: "Improve my writing" is off for these (cite or rewrite them yourself).
  const flagged = useMemo(() => [
    ...(run?.r.passages ?? []).map((x): [number, number] => [x.s, x.end]),
    ...[...hybrid.near, ...hybrid.para].map((m): [number, number] => [m.docStart, m.docEnd]),
  ], [run, hybrid]);
  const go = (v: View, t?: Tab) => { setView(v); if (v === "check") setTool(t ?? "check"); scrollTo(0, 0); };
  const userSources = sources.length + found.length;
  const toolActive = (t: Tab) => view === "check" && tool === t;

  const NAV: { id: string; label: string; short: string; icon: React.ReactNode; on: () => void; active: boolean }[] = [
    { id: "check", label: "Check document", short: "Check", icon: <FileCheck size={18} />, on: () => go("check"), active: view === "check" && tool === "check" },
    { id: "write", label: "Write", short: "Write", icon: <NotebookPen size={18} />, on: () => go("check", "write"), active: toolActive("write") },
    { id: "similarity", label: "Plagiarism check", short: "Plagiarism", icon: <FileSearch size={18} />, on: () => go("check", "similarity"), active: toolActive("similarity") },
    { id: "grammar", label: "Grammar", short: "Grammar", icon: <SpellCheck size={18} />, on: () => go("check", "grammar"), active: toolActive("grammar") },
    { id: "ai", label: "AI indicator", short: "AI", icon: <Bot size={18} />, on: () => go("check", "ai"), active: toolActive("ai") },
    { id: "rewrite", label: "Rewrite", short: "Rewrite", icon: <PenLine size={18} />, on: () => go("check", "rewrite"), active: toolActive("rewrite") },
    { id: "paragraph", label: "Paragraph check", short: "Para", icon: <Pilcrow size={18} />, on: () => go("paragraph"), active: view === "paragraph" },
    { id: "books", label: "Find a book", short: "Books", icon: <BookSearch size={18} />, on: () => go("books"), active: view === "books" },
    { id: "history", label: "History", short: "History", icon: <History size={18} />, on: () => go("history"), active: view === "history" },
    { id: "settings", label: "Settings", short: "Settings", icon: <SettingsIcon size={18} />, on: () => go("settings"), active: view === "settings" },
  ];
  const improveCard = (picked: { s: number; e: number } | null) => doc && <ImproveWriting text={doc.text} picked={picked} provider={cfg?.improve ?? null} model={cfg?.improveModel} setupNote={cfg?.improveNote} flagged={flagged}
    confirmPrivacy={(s) => confirmPrivacy(s, "improve")} onSetup={() => go("settings")}
    onApply={(s, e, t) => {
      setText(doc.text.slice(0, s) + t + doc.text.slice(e), "ai");
      setDoc((d) => d && { ...d, aiAssisted: (d.aiAssisted ?? 0) + 1 });
    }} />;

  const matched = (run?.r.passages.length ?? 0) + hybrid.near.length + hybrid.para.length;
  const secret = useMemo(() => (doc && prefs.confidential?.length ? findTerms(doc.text, prefs.confidential) : []), [doc, prefs.confidential]);
  const nextSteps: Step[] = doc ? [
    run ? (matched
      ? { id: "plagiarism", icon: <FileSearch size={18} />, tone: run.r.index >= 25 ? "high" : "mid", title: `${plural(matched, "passage")} match your sources (${run.r.index}% similarity)`,
          text: "Review each one: quote and cite it, rewrite it in your own words, or remove it.", action: "Review matches", onClick: () => go("check", "similarity") }
      : { id: "plagiarism", icon: <FileSearch size={18} />, tone: "low", title: "No matching passages found",
          text: `Compared against ${plural(run.all.length, "source")}. Search more places for a wider check.`, action: "See report", onClick: () => go("check", "similarity") })
      : { id: "plagiarism", icon: <FileSearch size={18} />, tone: "mute", title: searching ? "Searching the internet and publications…" : "Nothing to compare against yet",
          text: "Search the internet and publications, or add the papers you used.", action: "Find sources", onClick: () => go("check", "similarity") },
    { id: "grammar", icon: <SpellCheck size={18} />, tone: grammar.status !== "done" ? "mute" : issues.length ? "mid" : "low",
      title: grammar.status !== "done" ? "Checking grammar…" : grammar.englishOnly ? "Grammar check is English-only" : issues.length ? `${plural(issues.length, "grammar suggestion")} to review` : "No grammar issues found",
      text: "Spelling, grammar, punctuation and style. Accept or dismiss each one.", action: "Fix grammar", onClick: () => go("check", "grammar") },
    { id: "rewrite", icon: <PenLine size={18} />, tone: "mute", title: "Polish your wording",
      text: cfg?.improve ? "Click a paragraph to get clearer or more concise wording, and keep only the changes you like." : "Clearer, shorter wording from a free model on your computer. Needs a one-time setup (see Rewrite).",
      action: "Open Rewrite", onClick: () => go("check", "rewrite") },
    ...(secret.length ? [{ id: "confidential", icon: <ShieldAlert size={18} />, tone: "high" as const, title: `Confidential words found: ${secret.map((h) => h.term).join(", ")}`,
      text: "Leave out or generalise names your organisation hasn't cleared, and describe what you did instead.", action: "Find them", onClick: () => go("check", "write") }] : []),
    ...(ai.result ? [{ id: "ai", icon: <Bot size={18} />, tone: "mute" as const, title: `AI indicator: ${ai.result.label} (${ai.result.score}/100)`,
      text: "A signal only, never proof. See which sentences drove it.", action: "See details", onClick: () => go("check", "ai") }] : []),
  ] : [];

  return (
    <MotionConfig reducedMotion="user">
      <header className="top sticky top-0 z-30 flex min-h-14 items-center gap-2 bg-top px-4 py-2 text-white sm:gap-3">
        <button onClick={() => go("check")} className="flex shrink-0 items-center gap-2 text-lg font-bold tracking-tight cursor-pointer" aria-label="origincheck home">
          <Logo /><span className={cx(doc && "max-[399px]:hidden")}>origincheck</span>
        </button>
        {doc && view === "check" && <div className="hidden min-w-0 flex-1 truncate text-sm opacity-90 sm:block" title={doc.name}>{doc.name}</div>}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {doc && <TopBtn onClick={newCheck} label="New check" short="New" />}
          <TopBtn onClick={() => go(view === "library" ? "check" : "library")} label="My library and saved documents" icon={<LibIcon size={15} />} iconOnly pressed={view === "library"} />
          <a href={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/guide/`} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/30 bg-white/12 px-2.5 text-[13.5px] font-medium hover:bg-white/22" aria-label="Guide to avoiding plagiarism">
            <BookOpen size={15} /><span className="hidden lg:inline">Guide</span>
          </a>
          <button onClick={() => go("settings")} className="inline-grid size-8 place-items-center rounded-lg border border-white/30 bg-white/12 hover:bg-white/22 cursor-pointer md:hidden" aria-label="Settings">
            <SettingsIcon size={16} />
          </button>
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
            myLibrary={<MyLibrary items={library} setItems={setLibrary} on={useLibrary} setOn={(v) => setPrefs({ useLibrary: v })} />}
            onDeletedAll={() => { setSaved([]); setLibraryState([]); setHistory([]); setMeta({}); setPrefsState({}); delete document.documentElement.dataset.theme; }} />}
          {view === "books" && <FindBook onAdd={(x) => {
            if (library.some((b) => b.name.toLowerCase() === x.name.toLowerCase())) return false;
            setLibrary([...library, { ...x, id: uid(), addedAt: new Date().toISOString() }]);
            return true;
          }} />}
          {view === "paragraph" && <ParagraphCheck key={paraSeed?.key ?? 0} seed={paraSeed} defaultStyle={style} library={library} />}
          {view === "settings" && <div className="mx-auto grid grid-cols-[minmax(0,1fr)] max-w-[1180px] gap-[18px] px-4 pt-7 pb-12">
            <div>
              <h1 className="text-[clamp(23px,4vw,30px)] font-bold leading-tight tracking-tight">Settings</h1>
              <p className="mt-1.5 text-[15.5px] text-mute">How the checks behave (saved in this browser), and the keys and services the server uses.</p>
            </div>
            <SettingsCard settings={settings} setSettings={setSettings} prefs={prefs} setPrefs={setPrefs} cfg={cfg}
              saved={saved} useSaved={useSaved} setUseSaved={setUseSaved} drafts={priorDrafts.length} />
            <ServerSettings onSaved={loadCfg} />
          </div>}
          {view === "check" && !doc && tool === "write" && <section className="mx-auto max-w-[1180px] px-4 pt-7" id="writeStart">
            <div className="rounded-xl border border-accent/40 bg-soft p-4">
              <h1 className="text-xl font-bold">Write</h1>
              <p className="mt-1 text-[14.5px]">Write in origincheck&apos;s editor: grammar, plagiarism and the other checks update as you go, and its writing history
                (on by default, kept only in this browser) records how your text develops: what you typed, pasted, or accepted from Rewrite.</p>
              <form className="mt-3 flex flex-wrap gap-2" onSubmit={(e) => {
                e.preventDefault();
                const title = String(new FormData(e.currentTarget).get("title") ?? "").trim() || "Untitled draft";
                openDoc({ name: title, text: "", toks: [], headings: new Map(), kind: "paste" });
              }}>
                <input name="title" aria-label="Document title" placeholder="Title, e.g. History essay" className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 text-sm" />
                <Button type="submit" variant="primary" id="startWriting"><NotebookPen size={15} />Start writing</Button>
              </form>
              <p className="mt-2 text-[13px] text-mute">Or add an existing document below to continue it here.</p>
            </div>
          </section>}
          {view === "check" && !doc && tool !== "check" && tool !== "write" && <section className="mx-auto max-w-[1180px] px-4 pt-7" id="toolIntro" aria-label={INTRO[tool].title}>
            <div className="rounded-xl border border-accent/40 bg-soft p-4">
              <h1 className="text-xl font-bold">{INTRO[tool].title}</h1>
              <p className="mt-1 text-[14.5px]">{INTRO[tool].text}</p>
              {tool === "ai" && cfg && !cfg.aiLikelihood && <p className="mt-2 text-[13.5px] text-mute">The AI indicator is turned off on this server. Turn it on in <button className="cursor-pointer text-accent underline" onClick={() => go("settings")}>Settings</button>.</p>}
              {tool === "rewrite" && cfg && !cfg.improve && <p className="mt-2 text-[13.5px] text-mute">{cfg.improveNote ?? "Rewrite isn't set up yet."} See <button className="cursor-pointer text-accent underline" onClick={() => go("settings")}>Settings</button>.</p>}
            </div>
          </section>}
          {view === "check" && !doc && <Setup doc={doc} setDoc={openDoc} sources={sources} setSources={setSources} settings={settings} setSettings={setSettings}
            prefs={prefs} setPrefs={setPrefs} saved={saved} useSaved={useSaved} setUseSaved={setUseSaved} drafts={0}
            cfg={cfg} runs={runs} running={runningAll} canRun={false} onRunAll={runAll} confirmPrivacy={confirmPrivacy} onOpenSettings={() => go("settings")} />}
          {view === "check" && doc && <div className="mx-auto grid max-w-[1400px] grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-5">
            {tool === "check" ? <>
              <div>
                <h1 className="text-[clamp(21px,3vw,26px)] font-bold leading-tight wrap-anywhere">{doc.name}</h1>
                <p className="mt-0.5 text-sm text-mute">{doc.toks.length.toLocaleString()} words{docLang.code !== "und" && <> · <span id="docLang">{docLang.name}</span></>} · Click a result to see the details.</p>
              </div>
              <Dashboard onOpen={(t) => go("check", t)} onAddSources={addSourceFiles}
                sim={{ status: sim.status, index: run?.r.index, sources: run?.all.length ?? allSources.length, note: sim.note ?? (searching ? "Searching…" : undefined) }}
                grammar={{ status: grammar.status, pct: grammar.pct, score: grammarScore, issues }}
                ai={{ status: ai.status, pct: ai.pct, stage: ai.stage, mb: ai.mb, result: ai.result, stale: ai.stale }} />
              <NextSteps steps={nextSteps} />
              <div className="no-print flex flex-wrap gap-2" aria-label="Downloads">
                <Button size="sm" variant="primary" onClick={downloadReport} id="dlReport"><Download size={14} />Download report (PDF)</Button>
                <Button size="sm" onClick={downloadHtmlReport} id="dlHtml"><Download size={14} />Web report (.html)</Button>
                <Button size="sm" onClick={() => print()} className="max-sm:hidden"><Printer size={14} />Print / PDF</Button>
                <Button size="sm" onClick={() => downloadCorrected("docx")}><Download size={14} />Corrected .docx</Button>
                <Button size="sm" onClick={() => downloadCorrected("txt")}><Download size={14} />Corrected .txt</Button>
              </div>
            </> : <div className="no-print flex flex-wrap items-center gap-x-3 gap-y-1" id="toolBar">
              <Button size="sm" variant="ghost" onClick={() => go("check")} id="backOverview"><ArrowLeft size={15} />Overview</Button>
              <h1 className="text-xl font-bold">{TOOL_TITLE[tool]}</h1>
              <span className="min-w-0 truncate text-sm text-mute">{doc.name}</span>
            </div>}

            {tool === "similarity" && <>
              {run ? <Report doc={doc} run={run} ctx={ctx} webNote={webNote} citeFor={citeFor} prefs={prefs} setPrefs={setPrefs} hybrid={hybrid}
                  onFixInParagraph={(text, source) => { setParaSeed({ key: Date.now(), text, sources: [source] }); go("paragraph"); }}
                  recompute={recompute} applyEdit={applyEdit} undo={undo} saveDoc={saveDoc} saveMeta={saveMeta} saveDraft={saveDraft} />
                : <div className="rounded-xl border border-line bg-panel p-5 text-sm" role="status">
                    {sim.status === "needs-sources" ? <><b className="text-base">Nothing to compare against yet.</b>
                      <p className="mt-1 text-mute">Search the internet and publications below, or add the papers and pages you used.</p></>
                      : sim.status === "error" ? `The plagiarism check failed: ${sim.error}` : sim.note ?? "Checking…"}</div>}
              <section className="no-print rounded-xl border border-line bg-panel p-5">
                <SourcesCard compact sources={sources} setSources={setSources} prefs={prefs} setPrefs={setPrefs}
                  note={`Comparing against ${plural(userSources, "source")}${saved.length && useSaved ? ` and ${plural(saved.length, "saved document")}` : ""}${priorDrafts.length ? ` and ${plural(priorDrafts.length, "earlier draft")}` : ""}. Search more places or add sources you used.`}
                  cfg={cfg} runs={runs} running={runningAll} canRun onRunAll={runAll} confirmPrivacy={confirmPrivacy} />
              </section>
              <PaidCheck text={doc.text} paid={cfg?.paid} confirm={(s) => confirmPrivacy(s, "paid")} onSetup={() => go("settings")} />
              <ExternalCheck text={doc.text} korean={hasHangul(doc.text)} />
            </>}
            {tool === "grammar" && <GrammarTab text={doc.text} issues={issues} busy={grammar.status === "running"} ltOn={ltOn} ltNote={grammar.ltNote ?? grammar.error}
              englishOnly={!!grammar.englishOnly} korean={hasHangul(doc.text)}
              onAddWord={(w) => setPrefs({ dictionary: [...new Set([...(prefs.dictionary ?? []), w])] })}
              onAccept={(i, s) => setText(applySuggestion(doc.text, i, s))}
              onIgnore={(i) => setIgnored((x) => new Set(x).add(i.id))}
              onIgnoreRule={(r) => setIgnoredRules((x) => new Set(x).add(r))}
              onAcceptAllSpelling={() => setText(applyAll(doc.text, issues.filter((i) => i.category === "spelling" && i.severity !== "style")))}
              onEdit={() => go("check", "write")} onDownload={downloadCorrected} />}
            {tool === "write" && <WritePage title={doc.name} text={doc.text} onChange={(t, origin) => setText(t, origin)} history={wh}
              confidential={prefs.confidential}
              matches={run && <WriteMatches editorId="writeEditor" hybrid={hybrid} doc={doc} run={run} ctx={ctx} citeFor={citeFor} applyEdit={applyEdit} saveMeta={saveMeta} />}
              on={whOn} setOn={(v) => setPrefs({ writingHistory: v })} onSnapshot={saveSnapshot} onDelete={clearHistory} />}
            {tool === "rewrite" && <RewriteTab text={doc.text} flagged={flagged} index={run?.r.index} onOpenPlagiarism={() => go("check", "similarity")}
              renderPanel={(picked) => <>
                {run?.recheck && <RecheckCard rc={run.recheck} />}
                {picked && run && flagged.some(([a, b]) => a < picked.e && b > picked.s)
                  ? <FixMatches picked={picked} hybrid={hybrid} doc={doc} run={run} ctx={ctx} citeFor={citeFor} applyEdit={applyEdit} saveMeta={saveMeta} />
                  : improveCard(picked)}
              </>} />}
            {tool === "ai" && <AiTab s={ai} available={aiAvailable} onRerun={() => startAi(doc.text)} onEnable={() => { setPrefs({ ai: true }); startAi(doc.text, true); }} />}
          </div>}
        </main>
      </div>

      {/* nine tools don't fit side by side on a phone: the bar scrolls sideways instead of squeezing the labels together */}
      <nav aria-label="Tools" className="no-print fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-panel md:hidden">
        {NAV.filter((n) => n.id !== "settings").map((n) => <button key={n.id} onClick={n.on} aria-current={n.active ? "page" : undefined} data-nav-mobile={n.id}
          className={cx("flex min-w-16 flex-1 shrink-0 cursor-pointer flex-col items-center gap-0.5 px-1 py-2 text-[11px] font-medium whitespace-nowrap", n.active ? "text-accent" : "text-mute")}>
          {n.icon}{n.short}</button>)}
      </nav>
      <Dialog open={!!privacyAsk} onOpenChange={(o) => { if (!o) privacyAsk?.resolve(false); }} title={PRIVACY[privacyAsk?.kind ?? "search"].title}
        description={PRIVACY[privacyAsk?.kind ?? "search"].description}>
        <ul className="mb-3 list-disc pl-5 text-sm" id="privacyServices">{privacyAsk?.services.map((s) => <li key={s}>{s}</li>)}</ul>
        <p className="mb-4 text-[13px] text-mute">These services have their own privacy policies. {PRIVACY[privacyAsk?.kind ?? "search"].note}</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => privacyAsk?.resolve(false)}>Cancel</Button>
          <Button variant="primary" id="privacyOk" onClick={() => privacyAsk?.resolve(true)}>Continue</Button>
        </div>
      </Dialog>
    </MotionConfig>
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
