"use client";
import { useRef, useState } from "react";
import { BookOpen, ClipboardPaste, FileUp, Files, Globe, Library, Link2, Lock, Search, X } from "lucide-react";
import { type CiteMeta, type Settings, type Source, tokenize } from "@/lib/similarity";
import { SUPPORTED, extract } from "@/lib/extract";
import { CATALOGS, type CatalogItem, type ImportOutcome, importReferences, importUrl, loadCatalog } from "@/lib/importer";
import { STYLE_LABEL, type Style } from "@/lib/citations";
import { LT_PUBLIC } from "@/lib/grammar";
import type { Prefs, SavedDoc } from "@/lib/store";
import { uid } from "@/lib/store";
import { plural } from "@/lib/words";
import { Button, Card, Check, NumberField, cx, inputCls } from "./ui";
import { type Doc, type HStyle, webOn } from "./App";

const ext = (name: string) => (name.match(/\.([^.]+)$/)?.[1] ?? "txt").slice(0, 4);
const fillMeta = (m: Partial<CiteMeta> | undefined, name: string): CiteMeta | undefined =>
  m && (m.title || m.authors?.length) ? { authors: m.authors ?? [], title: m.title || name.replace(/\.[^.]+$/, ""), year: m.year } : undefined;

type Read = Source & { headings: Map<string, HStyle> };
async function readAll(files: File[]): Promise<{ ok: Read[]; errors: string }> {
  const ok: Read[] = [], errs: string[] = [];
  for (const f of files)
    try {
      const ex = await extract(f);
      const toks = tokenize(ex.text);
      if (!toks.length) errs.push(`No text found in ${f.name}. If it's a scanned PDF, run OCR on it first.`);
      else ok.push({
        id: uid(), name: f.name, kind: "file", text: ex.text, toks, meta: fillMeta(ex.meta, f.name),
        headings: new Map(ex.blocks.filter((b) => b.style !== "p").map((b) => [b.text, b.style as HStyle])),
      });
    } catch (e) {
      const m = (e as Error).message;
      errs.push(m.startsWith(f.name) ? m : `${f.name}: ${m}`);
    }
  return { ok, errors: errs.join(" ") };
}
const asSource = (x: Read): Source => ({ id: x.id, name: x.name, kind: x.kind, text: x.text, toks: x.toks, meta: x.meta });

/** The upload screen: document, sources and settings. Checks start as soon as a document is added. */
export default function Setup(p: DocProps & SourcesProps & SettingsProps) {
  const web = webOn(p.prefs), books = !!(p.prefs.internet && p.prefs.books), internet = !!p.prefs.internet;
  return (
    <div className="mx-auto max-w-[1180px] px-4 pt-7 pb-12">
      <div className="mb-6">
        <h1 className="text-[clamp(23px,4vw,30px)] font-bold leading-tight tracking-tight">Check your writing</h1>
        <p className="mt-1.5 text-[15.5px] text-mute">Add a document and origincheck runs three checks straight away: similarity to your sources, grammar, and an AI indicator.</p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-soft px-3 py-1.5 text-[13px]">
          <Lock size={15} className="shrink-0 text-accent" aria-hidden />
          Everything runs in your browser. Nothing is uploaded{p.prefs.lt ? " except the text you send to LanguageTool" : web || books ? " except short search phrases" : internet ? " except the DOIs and web addresses you look up" : ""}.
        </p>
      </div>
      <div className="grid gap-[18px] md:grid-cols-2">
        <DocCard {...p} />
        <SourcesCard {...p} />
      </div>
      <SettingsCard {...p} className="mt-[18px]" />
    </div>
  );
}

interface DocProps { doc: Doc | null; setDoc: (d: Omit<Doc, "id"> | null) => void }

export function DocCard(p: DocProps) {
  const [msg, setMsg] = useState("");
  const [paste, setPaste] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const onDoc = async (files: File[]) => {
    setReading(true);
    const { ok, errors } = await readAll(files.slice(0, 1));
    setReading(false);
    setMsg(errors);
    const d = ok[0];
    if (d) p.setDoc({ name: d.name, text: d.text, toks: d.toks, headings: d.headings, kind: "file" });
  };
  return (
    <Card aria-labelledby="docH">
      <h2 id="docH" className="font-semibold">1. Your document</h2>
      <p className="text-[13.5px] text-mute">The paper, essay or dissertation you want to check.</p>
      <Drop id="docDrop" label="Choose your document file" onFiles={onDoc} icon={<FileUp aria-hidden />} title="Drop a file here or click to browse" sub=".docx, .pdf, .txt, .md, .html, .rtf" />
      {reading && <p className="mt-2 text-sm text-mute" role="status">Reading your document…</p>}
      {p.doc && <ul className="mt-3"><FileRow tag={p.doc.kind === "paste" ? "text" : ext(p.doc.name)} name={p.doc.name} words={p.doc.toks.length} onRemove={() => p.setDoc(null)} /></ul>}
      {paste === null
        ? <Button variant="link" className="mt-3" onClick={() => setPaste("")}>Paste text instead</Button>
        : <div className="mt-3 grid gap-2">
            <textarea className={cx(inputCls, "min-h-32")} aria-label="Document text" placeholder="Paste your document text here" value={paste} onChange={(e) => setPaste(e.target.value)} />
            <div className="flex gap-2">
              <Button size="sm" variant="primary" id="usePaste" onClick={() => {
                const toks = tokenize(paste);
                if (!toks.length) return setMsg("Paste some text first.");
                p.setDoc({ name: "Pasted text", text: paste.replace(/\r\n?/g, "\n"), toks, headings: new Map(), kind: "paste" });
                setPaste(null); setMsg("");
              }}>Check this text</Button>
              <Button size="sm" variant="ghost" onClick={() => setPaste(null)}>Cancel</Button>
            </div>
          </div>}
      {msg && <p role="alert" className="mt-2.5 text-[13.5px] text-high">{msg}</p>}
    </Card>
  );
}

interface SourcesProps { sources: Source[]; setSources: (f: (s: Source[]) => Source[]) => void; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void }

export function SourcesCard(p: SourcesProps & { compact?: boolean }) {
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<"files" | "paste" | "url" | "refs" | "web" | "books" | "lists">("files");
  const [pName, setPName] = useState("");
  const [pText, setPText] = useState("");
  const [url, setUrl] = useState("");
  const [refs, setRefs] = useState("");
  const [busy, setBusy] = useState("");
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const internet = !!p.prefs.internet;

  const onSources = async (files: File[]) => {
    setBusy(`Reading ${plural(files.length, "file")}…`);
    const { ok, errors } = await readAll(files);
    setBusy("");
    setMsg(errors);
    p.setSources((s) => [...s, ...ok.map(asSource)]);
  };
  const addPasted = () => {
    const toks = tokenize(pText);
    if (!toks.length) return setMsg("Paste some source text first.");
    const isUrl = /^https?:\/\//i.test(pName.trim());
    const name = pName.trim() || `Pasted source ${p.sources.filter((s) => s.kind === "paste").length + 1}`;
    p.setSources((s) => [...s, { id: uid(), name, kind: isUrl ? "internet" : "paste", text: pText.replace(/\r\n?/g, "\n"), toks,
      meta: isUrl ? { authors: [], title: name, url: name, accessed: new Date().toISOString().slice(0, 10) } : undefined }]);
    setPName(""); setPText(""); setMsg("");
  };
  const net = { proxy: p.prefs.proxy ?? true, email: p.prefs.email };
  const addImported = (out: ImportOutcome[]) =>
    p.setSources((s) => [...s, ...out.filter((o) => o.source).map((o) => ({
      id: uid(), name: o.source!.name, kind: "internet" as const, text: o.source!.text, toks: tokenize(o.source!.text), meta: o.source!.meta,
    }))]);
  const addUrl = async () => {
    if (!/^https?:\/\/\S+$/i.test(url.trim())) return setMsg("Enter a full web address starting with https://");
    setBusy("Fetching page…");
    const o = await importUrl(url.trim(), net);
    setBusy("");
    setOutcomes([o]);
    if (o.source) { addImported([o]); setUrl(""); }
  };
  const addRefs = async () => {
    setOutcomes([]);
    const out = await importReferences(refs, net, (d, t) => setBusy(`Looking up ${Math.min(d + 1, t)} of ${t}…`));
    setBusy("");
    setOutcomes(out);
    addImported(out);
  };
  const MODES = [["files", "Files", <Files key="i" size={15} />], ["paste", "Paste", <ClipboardPaste key="i" size={15} />], ["url", "Web page", <Link2 key="i" size={15} />],
    ["refs", "References & DOIs", <Globe key="i" size={15} />], ["web", "Search the web", <Search key="i" size={15} />],
    ["books", "Books (Open Library)", <BookOpen key="i" size={15} />], ["lists", "Free book lists", <Library key="i" size={15} />]] as const;

  return (
    <Card aria-labelledby="srcH" className={p.compact ? "border-0 p-0" : undefined}>
      {!p.compact && <>
        <h2 id="srcH" className="font-semibold">2. Sources to compare against</h2>
        <p className="text-[13.5px] text-mute">Papers, articles and web pages you read or used. The similarity check needs at least one.</p>
      </>}
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="How to add sources">
        {MODES.map(([id, label, icon]) => (
          <Button key={id} size="sm" variant={mode === id ? "primary" : "outline"} aria-pressed={mode === id} onClick={() => { setMode(id); setOutcomes([]); }}>{icon}{label}</Button>
        ))}
      </div>
      {mode === "files" && <Drop id={p.compact ? "srcDrop2" : "srcDrop"} multiple label="Choose source files" onFiles={onSources} icon={<Files aria-hidden />} title="Drop files here or click to browse" sub="Add as many as you like" />}
      {mode === "paste" && <div className="mt-3 grid gap-2">
        <input className={inputCls} aria-label="Source name or URL" placeholder="Name or URL (optional)" value={pName} onChange={(e) => setPName(e.target.value)} />
        <textarea className={cx(inputCls, "min-h-28")} aria-label="Source text" placeholder="Paste the source text here" value={pText} onChange={(e) => setPText(e.target.value)} />
        <div><Button size="sm" variant="primary" onClick={addPasted}>Add source</Button></div>
      </div>}
      {mode !== "files" && mode !== "paste" && !internet && <div className="mt-3 rounded-lg bg-soft p-3 text-sm">
        <p>{mode === "web" || mode === "books" ? "Searching sends short phrases (24 words each) from your document — never the whole document."
          : mode === "lists" ? "Browsing the free book lists downloads them from GitHub, and adding a book fetches its page. Your document is never sent."
          : `Adding sources from the web sends ${mode === "url" ? "the address you enter" : "the references and DOIs you paste"} to look them up. Your document is never sent.`}</p>
        <Button size="sm" variant="primary" className="mt-2" onClick={() => p.setPrefs({ internet: true })}>Turn on internet features</Button>
      </div>}
      {mode === "url" && internet && <div className="mt-3 flex gap-2">
        <input className={inputCls} type="url" aria-label="Web page address" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUrl()} />
        <Button variant="primary" onClick={addUrl} disabled={!!busy}>Add</Button>
      </div>}
      {mode === "refs" && internet && <div className="mt-3 grid gap-2">
        <textarea className={cx(inputCls, "min-h-32")} aria-label="Reference list or DOIs" value={refs} onChange={(e) => setRefs(e.target.value)}
          placeholder={"One reference or DOI per line, e.g.\n10.1038/s41586-020-2649-2\nSmith, J. (2020). Title of the article. Journal, 12(3), 45–67."} />
        <div><Button size="sm" variant="primary" onClick={addRefs} disabled={!!busy || !refs.trim()}>Find open-access full text</Button></div>
      </div>}
      {mode === "web" && internet && <div className="mt-3 grid gap-3 text-sm">
        <Check id="sWeb" checked={p.prefs.webSearch !== false} onChange={(v) => p.setPrefs({ webSearch: v })}
          label="Search the web for matching text"
          hint="Picks evenly spaced 24-word phrases from your document, searches each as an exact phrase and compares the top pages." />
        <label className="grid gap-1">Search API key (Jina)
          <input className={inputCls} type="password" autoComplete="off" value={p.prefs.searchKey ?? ""} onChange={(e) => p.setPrefs({ searchKey: e.target.value })} placeholder="jina_…" id="searchKey" />
          <span className="text-[12.5px] text-mute">Free key with trial credit at <a className="text-accent underline" href="https://jina.ai/api-dashboard" target="_blank" rel="noreferrer">jina.ai</a>. Stored only in this browser.</span>
        </label>
        <NumberField id="sQueries" label="Phrases to search" value={p.prefs.webQueries ?? 10} min={1} max={40} onChange={(v) => p.setPrefs({ webQueries: v })} />
      </div>}
      {mode === "books" && internet && <div className="mt-3 grid gap-3 text-sm">
        <Check id="sBooks" checked={!!p.prefs.books} onChange={(v) => p.setPrefs({ books: v })}
          label="Search inside books on Open Library"
          hint="Searches the full text of millions of scanned books at the Internet Archive for evenly spaced 24-word phrases from your document. No key needed." />
        <NumberField id="sBookQueries" label="Phrases to search" value={p.prefs.bookQueries ?? 10} min={1} max={40} onChange={(v) => p.setPrefs({ bookQueries: v })} />
      </div>}
      {mode === "lists" && internet && <Catalogs net={net} onAdd={(item, text) => p.setSources((s) => [...s, {
        id: uid(), name: item.title, kind: "internet", text, toks: tokenize(text),
        meta: { authors: [], title: item.title, url: item.url, accessed: new Date().toISOString().slice(0, 10) },
      }])} />}
      {busy && <p className="mt-2 text-sm text-mute" role="status">{busy}</p>}
      {outcomes.length > 0 && <ul className="mt-3 grid gap-1.5 text-[13px]" aria-label="Import results">
        {outcomes.map((o, i) => <li key={i} className={cx("rounded-md border-l-4 bg-bg px-2.5 py-1.5", o.ok ? "border-low" : "border-high")}>
          <div className="truncate font-medium" title={o.entry}>{o.entry}</div>
          <div className="text-mute">{o.ok ? "✓ " : "✗ "}{o.message}{o.link && !o.ok && <> <a className="text-accent underline" href={o.link} target="_blank" rel="noreferrer">Open</a></>}</div>
        </li>)}
      </ul>}
      {p.sources.length > 0 && <ul className="mt-3" aria-label="Sources added">
        {p.sources.map((s) => <FileRow key={s.id} tag={s.kind === "internet" ? "web" : s.kind === "paste" ? "text" : ext(s.name)} name={s.name} words={s.toks.length}
          onRemove={() => p.setSources((all) => all.filter((x) => x.id !== s.id))} />)}
      </ul>}
      {msg && <p role="alert" className="mt-2.5 text-[13.5px] text-high">{msg}</p>}
    </Card>
  );
}

interface SettingsProps {
  settings: Settings; setSettings: (s: Settings) => void; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void;
  saved: SavedDoc[]; useSaved: boolean; setUseSaved: (v: boolean) => void; drafts: number;
}

const LT_LANGS = [["auto", "Detect automatically"], ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["de-DE", "German"], ["fr", "French"],
  ["es", "Spanish"], ["pt-PT", "Portuguese"], ["nl", "Dutch"], ["it", "Italian"], ["pl-PL", "Polish"], ["uk-UA", "Ukrainian"]] as const;

export function SettingsCard(p: SettingsProps & { className?: string }) {
  const s = p.settings, set = (patch: Partial<Settings>) => p.setSettings({ ...s, ...patch });
  const internet = !!p.prefs.internet;
  return (
    <Card className={p.className} aria-labelledby="setH">
      <h2 id="setH" className="font-semibold">Settings</h2>
      <h3 className="mt-3 text-[13px] font-semibold uppercase tracking-wide text-mute">Checks</h3>
      <div className="mt-2 grid gap-3.5 sm:grid-cols-2">
        <Check id="sAi" label="AI indicator" checked={p.prefs.ai !== false} onChange={(v) => p.setPrefs({ ai: v })}
          hint="Runs on your device. Downloads about 210 MB of models the first time, then uses the browser cache." />
        <div className="grid gap-2">
          <Check id="sLt" label="Extra grammar rules with LanguageTool" checked={!!p.prefs.lt} onChange={(v) => p.setPrefs({ lt: v })}
            hint="Sends your text to LanguageTool (more rules, 30+ languages). Off by default; Harper always runs on your device." />
          {p.prefs.lt && <div className="ml-7 grid gap-2 text-sm">
            <label className="grid gap-1">Language
              <select className="h-8 rounded-md border border-line bg-bg px-2" value={p.prefs.ltLang ?? "auto"} onChange={(e) => p.setPrefs({ ltLang: e.target.value })}>
                {LT_LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="grid gap-1">Server (optional)
              <input className={inputCls} type="url" placeholder={LT_PUBLIC} value={p.prefs.ltUrl ?? ""} onChange={(e) => p.setPrefs({ ltUrl: e.target.value })} />
              <span className="text-[12px] text-mute">Leave empty for the public API (20 requests and 75 KB a minute), or enter your own server’s /v2/check address.</span>
            </label>
          </div>}
        </div>
      </div>
      <h3 className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-mute">Similarity</h3>
      <div className="mt-2 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <Check id="sQuotes" label="Exclude quotes" checked={s.quotes} onChange={(v) => set({ quotes: v })} />
        <Check id="sBib" label="Exclude bibliography" checked={s.bib} onChange={(v) => set({ bib: v })} />
        <Check id="sStrict" label="Stricter mode" hint="Also flag lightly reworded copying (word stems and common synonyms) as possible close paraphrase. It doesn't change the index." checked={s.strict} onChange={(v) => set({ strict: v })} />
        <NumberField id="sMin" label="Exclude matches under" suffix="words" value={s.minWords} min={1} max={200} onChange={(v) => set({ minWords: v })} />
        <NumberField id="sNgram" label="Fingerprint size" suffix="words" value={s.ngram} min={2} max={12} onChange={(v) => set({ ngram: v })} />
        <label className="flex items-center gap-2 text-sm">Citation style
          <select className="h-8 rounded-md border border-line bg-bg px-2" value={p.prefs.style ?? "apa"} onChange={(e) => p.setPrefs({ style: e.target.value as Style })}>
            {Object.entries(STYLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      {(p.saved.length > 0 || p.drafts > 0) && <div className="mt-4 grid gap-2 border-t border-line pt-4">
        {p.saved.length > 0 && <Check id="useSaved" checked={p.useSaved} onChange={p.setUseSaved}
          label={`Also compare with my ${plural(p.saved.length, "saved document")}`}
          hint={p.saved.some((d) => d.own) ? "Documents marked as your earlier work are reported separately (self-plagiarism check)." : undefined} />}
        {p.drafts > 0 && <p className="text-sm text-mute">{plural(p.drafts, "previous draft")} of this document will be compared too, excluded from the index by default.</p>}
      </div>}
      <details className="mt-4 border-t border-line pt-4">
        <summary className="cursor-pointer text-sm font-semibold">Internet features {internet ? "(on)" : "(off)"}</summary>
        <div className="mt-3 grid gap-3">
          <Check id="sNet" checked={internet} onChange={(v) => p.setPrefs({ internet: v })} label="Allow web search, book search and looking up DOIs, references and web pages"
            hint="Searches send short phrases from your document; lookups send only what you enter. Never your whole document." />
          <Check id="sProxy" checked={p.prefs.proxy ?? true} onChange={(v) => p.setPrefs({ proxy: v })} label="Use a reader service when a site blocks in-browser downloads"
            hint="Sends the page or PDF address (not your document) to r.jina.ai, which returns the page's readable text." />
          <label className="grid max-w-md gap-1 text-sm">Email for Unpaywall (optional)
            <input className={inputCls} type="email" value={p.prefs.email ?? ""} onChange={(e) => p.setPrefs({ email: e.target.value })} placeholder="you@university.edu" />
            <span className="text-[12.5px] text-mute">Unpaywall asks for an email with each lookup. Without one, origincheck uses OpenAlex only.</span>
          </label>
        </div>
      </details>
    </Card>
  );
}

function Drop({ id, label, onFiles, icon, title, sub, multiple }:
  { id: string; label: string; onFiles: (f: File[]) => void; icon: React.ReactNode; title: string; sub: string; multiple?: boolean }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <>
      <div id={id} role="button" tabIndex={0} aria-label={label}
        onClick={() => input.current?.click()}
        // Like a native button: Enter acts on keydown, Space on keyup.
        onKeyDown={(e) => { if (e.key === " ") e.preventDefault(); if (e.key === "Enter") { e.preventDefault(); input.current?.click(); } }}
        onKeyUp={(e) => { if (e.key === " ") { e.preventDefault(); input.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); onFiles([...e.dataTransfer.files]); }}
        className={cx("mt-3.5 cursor-pointer rounded-[10px] border-2 border-dashed px-3.5 py-5 text-center text-mute transition [&_svg]:mx-auto [&_svg]:mb-1 [&_svg]:size-7 [&_svg]:text-accent",
          over ? "border-accent bg-soft" : "border-line hover:border-accent hover:bg-soft")}>
        {icon}
        <strong className="block text-[15px] text-ink">{title}</strong>{sub}
      </div>
      <input ref={input} type="file" hidden multiple={multiple} accept={SUPPORTED} data-testid={`${id}-input`}
        onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </>
  );
}

function FileRow({ tag, name, words, onRemove }: { tag: string; name: string; words: number; onRemove: () => void }) {
  return (
    <li className="flex items-center gap-2.5 border-t border-line py-2 text-sm first:border-t-0">
      <span className="min-w-[42px] shrink-0 rounded-[5px] bg-soft px-1.5 py-0.5 text-center text-[10.5px] font-bold uppercase tracking-wide text-accent">{tag}</span>
      <span className="min-w-0 flex-1 truncate" title={name}>{name}</span>
      <span className="shrink-0 text-[12.5px] text-mute">{words.toLocaleString()} words</span>
      <button onClick={onRemove} aria-label={`Remove ${name}`} className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-mute hover:bg-soft hover:text-high"><X size={16} /></button>
    </li>
  );
}

/** Browse the free-book catalogues (EbookFoundation/free-programming-books, 44bits/awesome-opensource-documents) and add titles as sources. */
function Catalogs({ net, onAdd }: { net: { proxy: boolean; email?: string }; onAdd: (item: CatalogItem, text: string) => void }) {
  const [cat, setCat] = useState<string>(CATALOGS[0].id);
  const [items, setItems] = useState<Record<string, CatalogItem[]>>({});
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [state, setState] = useState<Record<string, string>>({});
  const current = items[cat];
  const open = async (id: string) => {
    setCat(id);
    if (items[id]) return;
    setStatus("Loading list…");
    try {
      const list = await loadCatalog(CATALOGS.find((c) => c.id === id)!.url);
      setItems((m) => ({ ...m, [id]: list }));
      setStatus("");
    } catch (e) { setStatus(`Couldn't load the list (${(e as Error).message}).`); }
  };
  // Every search word must start a word in the title, section or note ("pro git" finds Pro Git, not Programming).
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean).map((t) => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  const shown = (current ?? []).filter((it) => terms.every((t) => t.test(`${it.title} ${it.section} ${it.note}`.toLowerCase()))).slice(0, 40);
  const add = async (it: CatalogItem) => {
    setState((s) => ({ ...s, [it.url]: "Fetching…" }));
    const o = await importUrl(it.url, net);
    if (o.source) onAdd(it, o.source.text);
    setState((s) => ({ ...s, [it.url]: o.ok ? "Added" : o.message }));
  };
  const repo = CATALOGS.find((c) => c.id === cat)!.repo;
  return (
    <div className="mt-3 grid gap-2.5 text-sm">
      <div className="flex flex-wrap gap-2">
        <select className="h-9 min-w-0 flex-1 rounded-md border border-line bg-bg px-2" aria-label="Book list" value={cat}
          onChange={(e) => open(e.target.value)} onFocus={() => !current && open(cat)}>
          {CATALOGS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        {!current && <Button size="sm" variant="primary" onClick={() => open(cat)} id="loadList">Load list</Button>}
      </div>
      {current && <input className={inputCls} type="search" placeholder={`Search ${current.length.toLocaleString()} titles, e.g. "python" or "algorithms"`} aria-label="Search the list" value={q} onChange={(e) => setQ(e.target.value)} id="listSearch" />}
      {status && <p className="text-mute" role="status">{status}</p>}
      {current && <ul className="max-h-80 overflow-auto rounded-lg border border-line" aria-label="Titles">
        {shown.map((it) => <li key={it.url + it.title} className="flex items-center gap-2 border-t border-line px-2.5 py-2 first:border-t-0">
          <div className="min-w-0 flex-1">
            <a className="block truncate font-medium hover:underline" href={it.url} target="_blank" rel="noreferrer" title={it.title}>{it.title}</a>
            <div className="truncate text-[12px] text-mute">{it.section}{it.note ? ` · ${it.note}` : ""}</div>
            {state[it.url] && state[it.url] !== "Added" && state[it.url] !== "Fetching…" && <div className="text-[12px] text-high">{state[it.url]}</div>}
          </div>
          <Button size="sm" disabled={state[it.url] === "Fetching…" || state[it.url] === "Added"} onClick={() => add(it)}>
            {state[it.url] === "Added" ? "Added" : state[it.url] === "Fetching…" ? "Adding…" : "Add"}
          </Button>
        </li>)}
        {!shown.length && <li className="px-2.5 py-2 text-mute">No titles match.</li>}
      </ul>}
      <p className="text-[12px] text-mute">From <a className="text-accent underline" href={`https://github.com/${repo}`} target="_blank" rel="noreferrer">{repo}</a>. Adding a title fetches its page, so it works best for books published as web pages.</p>
    </div>
  );
}