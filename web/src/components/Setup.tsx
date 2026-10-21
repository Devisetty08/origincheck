"use client";
import { useRef, useState } from "react";
import { BookOpen, ClipboardPaste, FileUp, Files, Globe, Library, Link2, Lock, Play, Search, X } from "lucide-react";
import { type CiteMeta, type Input, type Settings, type Source, tokenize } from "@/lib/similarity";
import { SUPPORTED, extract } from "@/lib/extract";
import { CATALOGS, type CatalogItem, type ImportOutcome, importReferences, importUrl, loadCatalog } from "@/lib/importer";
import type { SourceRun } from "@/lib/checks";
import { STYLE_LABEL, type Style } from "@/lib/citations";
import type { Prefs, SavedDoc } from "@/lib/store";
import { uid } from "@/lib/store";
import { plural } from "@/lib/words";
import { Button, Card, Check, NumberField, cx, inputCls } from "./ui";
import type { Doc, HStyle, ServerConfig } from "./App";

const ext = (name: string) => (name.match(/\.([^.]+)$/)?.[1] ?? "txt").slice(0, 4);
const fillMeta = (m: Partial<CiteMeta> | undefined, name: string): CiteMeta | undefined =>
  m && (m.title || m.authors?.length) ? { authors: m.authors ?? [], title: m.title || name.replace(/\.[^.]+$/, ""), year: m.year } : undefined;

type Read = Source & { headings: Map<string, HStyle> };
async function readAll(files: File[], onProgress?: (msg: string) => void): Promise<{ ok: Read[]; errors: string }> {
  const ok: Read[] = [], errs: string[] = [];
  for (const f of files)
    try {
      const ex = await extract(f, onProgress && ((m) => onProgress(`${f.name}: ${m}`)));
      const toks = tokenize(ex.text);
      if (!toks.length) errs.push(`No text found in ${f.name}${ex.ocr ? ", even with text recognition (is the scan readable?)" : ""}.`);
      else ok.push({
        id: uid(), name: f.name, kind: "file", input: "files", text: ex.text, toks, meta: fillMeta(ex.meta, f.name),
        headings: new Map(ex.blocks.filter((b) => b.style !== "p").map((b) => [b.text, b.style as HStyle])),
      });
    } catch (e) {
      const m = (e as Error).message;
      errs.push(m.startsWith(f.name) ? m : `${f.name}: ${m}`);
    }
  return { ok, errors: errs.join(" ") };
}
const asSource = (x: Read): Source => ({ id: x.id, name: x.name, kind: x.kind, input: x.input, text: x.text, toks: x.toks, meta: x.meta });

/** The upload screen: document, sources and settings. Checks start as soon as a document is added. */
export default function Setup(p: DocProps & SourcesProps & SettingsProps & { onOpenSettings: () => void }) {
  return (
    <div className="mx-auto max-w-[1180px] px-4 pt-7 pb-12">
      <div className="mb-6">
        <h1 className="text-[clamp(23px,4vw,30px)] font-bold leading-tight tracking-tight">Check your writing</h1>
        <p className="mt-1.5 text-[15.5px] text-mute">Add your document. origincheck checks it for plagiarism, grammar and (if turned on) AI-written text, all at once.</p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-soft px-3 py-1.5 text-[13px]">
          <Lock size={15} className="shrink-0 text-accent" aria-hidden />
          Your document is read and compared in your browser. Searches send only short phrases, never the whole document.
        </p>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-[18px] md:grid-cols-2">
        <DocCard {...p} />
        <SourcesCard {...p} />
      </div>
      <p className="mt-[18px] text-[13.5px] text-mute">Options such as ignoring quotes and your bibliography, citation style and API keys are in{" "}
        <button className="cursor-pointer text-accent underline" onClick={p.onOpenSettings} id="setupSettings">Settings</button>.</p>
    </div>
  );
}

interface DocProps { doc: Doc | null; setDoc: (d: Omit<Doc, "id"> | null) => void }

export function DocCard(p: DocProps) {
  const [msg, setMsg] = useState("");
  const [paste, setPaste] = useState<string | null>(null);
  const [reading, setReading] = useState<string | null>(null);
  const onDoc = async (files: File[]) => {
    setReading("Reading your document…");
    const { ok, errors } = await readAll(files.slice(0, 1), setReading);
    setReading(null);
    setMsg(errors);
    const d = ok[0];
    if (d) p.setDoc({ name: d.name, text: d.text, toks: d.toks, headings: d.headings, kind: "file" });
  };
  return (
    <Card aria-labelledby="docH">
      <h2 id="docH" className="font-semibold">1. Your document</h2>
      <p className="text-[13.5px] text-mute">The paper, essay or dissertation you want to check.</p>
      <Drop id="docDrop" label="Choose your document file" onFiles={onDoc} icon={<FileUp aria-hidden />} title="Drop a file here or click to browse" sub=".docx, .pdf, .txt, .md, .html, .rtf" />
      {reading && <p className="mt-2 text-sm text-mute" role="status" id="readingMsg">{reading}</p>}
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

interface SourcesProps {
  sources: Source[]; setSources: (f: (s: Source[]) => Source[]) => void;
  prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void;
  cfg: ServerConfig | null;
  runs: SourceRun[] | null; running: boolean; canRun: boolean; onRunAll: () => void;
  confirmPrivacy: (services: string[]) => Promise<boolean>;
}

/** Searched automatically from short phrases of your document (each one is a Yes/No input). */
const SEARCH: { id: Input; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: "web", label: "The internet", hint: "Wikipedia and web search", icon: <Search size={16} /> },
  { id: "refs", label: "Journals & publications", hint: "Crossref, OpenAlex, PubMed, arXiv, Semantic Scholar, CORE, Europe PMC, DataCite theses, OSF preprints, INSPIRE-HEP", icon: <Globe size={16} /> },
  { id: "books", label: "Books", hint: "Inside millions of books (Open Library, Google Books)", icon: <BookOpen size={16} /> },
  { id: "lists", label: "Free classic books & poems", hint: "Project Gutenberg and PoetryDB", icon: <Library size={16} /> },
];
/** Sources you add yourself. */
const OWN: { id: Input; label: string; icon: React.ReactNode; include: string }[] = [
  { id: "files", label: "Upload files", icon: <Files size={15} />, include: "Compare against uploaded files" },
  { id: "paste", label: "Paste text", icon: <ClipboardPaste size={15} />, include: "Compare against pasted text" },
  { id: "url", label: "Web page", icon: <Link2 size={15} />, include: "Compare against web pages you add" },
  { id: "refs", label: "Reference list", icon: <Globe size={15} />, include: "Compare against your references and journals" },
  { id: "lists", label: "Free book lists", icon: <Library size={15} />, include: "Compare against free books" },
];
const SERVER_INPUTS: Input[] = ["refs", "web", "books", "lists"];
export const inputOn = (prefs: Prefs, i: Input) => prefs.inputs?.[i] !== false;

export function SourcesCard(p: SourcesProps & { compact?: boolean; note?: string }) {
  const [msg, setMsg] = useState("");
  const [mode, setMode] = useState<Input>("files");
  const [pName, setPName] = useState("");
  const [pText, setPText] = useState("");
  const [url, setUrl] = useState("");
  const [refs, setRefs] = useState("");
  const [busy, setBusy] = useState("");
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);
  const on = (i: Input) => inputOn(p.prefs, i);
  const setOn = (i: Input, v: boolean) => p.setPrefs({ inputs: { ...p.prefs.inputs, [i]: v } });

  const onSources = async (files: File[]) => {
    setBusy(`Reading ${plural(files.length, "file")}…`);
    const { ok, errors } = await readAll(files, setBusy);
    setBusy("");
    setMsg(errors);
    p.setSources((s) => [...s, ...ok.map(asSource)]);
  };
  const addPasted = () => {
    const toks = tokenize(pText);
    if (!toks.length) return setMsg("Paste some source text first.");
    const isUrl = /^https?:\/\//i.test(pName.trim());
    const name = pName.trim() || `Pasted source ${p.sources.filter((s) => s.kind === "paste").length + 1}`;
    p.setSources((s) => [...s, { id: uid(), name, kind: isUrl ? "internet" : "paste", input: "paste", text: pText.replace(/\r\n?/g, "\n"), toks,
      meta: isUrl ? { authors: [], title: name, url: name, accessed: new Date().toISOString().slice(0, 10) } : undefined }]);
    setPName(""); setPText(""); setMsg("");
  };
  const addImported = (out: ImportOutcome[], input: Input) =>
    p.setSources((s) => [...s, ...out.filter((o) => o.source).map((o) => ({
      id: uid(), name: o.source!.name, kind: input === "refs" ? ("scholarly" as const) : ("internet" as const), input, text: o.source!.text,
      toks: tokenize(o.source!.text), meta: o.source!.meta, found: { adapter: input === "refs" ? "References & DOIs" : "Web page", url: o.source!.url },
    }))]);
  const addUrl = async () => {
    if (!/^https?:\/\/\S+$/i.test(url.trim())) return setMsg("Enter a full web address starting with https://");
    if (!(await p.confirmPrivacy(["the web page you enter (fetched by origincheck's server)"]))) return;
    setBusy("Fetching page…");
    const o = await importUrl(url.trim());
    setBusy("");
    setOutcomes([o]);
    if (o.source) { addImported([o], "url"); setUrl(""); }
  };
  const addRefs = async () => {
    if (!(await p.confirmPrivacy(["Crossref, OpenAlex, Unpaywall and Europe PMC (the references and DOIs you paste)"]))) return;
    setOutcomes([]);
    const out = await importReferences(refs, (d, t) => setBusy(`Looked up ${d} of ${t}…`));
    setBusy("");
    setOutcomes(out);
    addImported(out, "refs");
  };
  const enabledServer = SERVER_INPUTS.filter(on);
  const cur = OWN.find((i) => i.id === mode)!;
  const runs = p.runs ?? [];
  const found = runs.filter((r) => r.status === "success").length;
  const couldnt = runs.filter((r) => ["failed", "rate-limited", "not configured", "cap reached"].includes(r.status)).length;
  const braveUsed = runs.some((r) => r.source === "brave" && r.status !== "not configured");
  const capped = runs.filter((r) => r.status === "cap reached").map((r) => r.label);

  return (
    <Card aria-labelledby="srcH" className={p.compact ? "border-0 p-0" : undefined} id={p.compact ? "moreSources" : "sourcesCard"}>
      <h2 id="srcH" className="font-semibold">{p.compact ? "Find more sources" : "2. What to compare against"}</h2>
      <p className="text-[13.5px] text-mute">{p.note ?? "origincheck searches these for you. You can also add papers and pages you used."}</p>

      <fieldset className="mt-3">
        <legend className="text-[12.5px] font-semibold uppercase tracking-wide text-mute">Search automatically</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {SEARCH.map((s) => (
            <label key={s.id} htmlFor={`in-${s.id}`} className={cx("flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm", on(s.id) ? "border-accent/50 bg-soft" : "border-line")}>
              <input id={`in-${s.id}`} type="checkbox" checked={on(s.id)} onChange={(e) => setOn(s.id, e.target.checked)} className="mt-0.5 size-4.5 shrink-0 accent-accent" />
              <span className="text-accent" aria-hidden>{s.icon}</span>
              <span className="min-w-0"><b className="font-semibold">{s.label}</b><span className="block text-[12px] text-mute">{s.hint}</span></span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" onClick={p.onRunAll} disabled={!p.canRun || p.running || !enabledServer.length} id="runAll">
          <Play size={15} />{p.running ? "Searching…" : runs.length ? "Search again" : "Search now"}</Button>
        <span className="text-[12.5px] text-mute">
          {!p.canRun ? "Starts automatically when you add your document." : !enabledServer.length ? "Tick at least one place to search."
            : `Sends up to ${p.cfg?.maxQueries ?? 8} short phrases (never your whole document).`}
        </span>
      </div>
      {runs.length > 0 && <div className="mt-2 rounded-lg bg-bg px-3 py-2 text-[13px]" id="searchSummary">
        <p role="status">{p.running ? `Searching ${runs.length} services…` : `${plural(found, "service")} found sources, ${runs.length - found - couldnt} found nothing${couldnt ? `, ${couldnt} couldn't search (see details)` : ""}.`}</p>
        {capped.length > 0 && <p className="mt-1 text-high" id="capNote">Monthly spending cap reached for {capped.join(", ")}: not searched. See Settings → Paid APIs.</p>}
        {braveUsed && <p className="mt-1 text-[11.5px] font-semibold tracking-wide text-mute" id="braveAttribution">
          Web results: <a href="https://brave.com/search/api/" target="_blank" rel="noreferrer" className="hover:underline">POWERED BY BRAVE</a></p>}
        <details className="mt-1"><summary className="cursor-pointer text-accent">Details per service</summary><div className="mt-2">
          <p className="mb-2 text-[12px] text-mute"><b>No results</b> means none of your phrases appear in that service — normal for original writing.
            <b> Success</b> means it returned something to compare (journal search engines always return their closest papers); the plagiarism
            report shows whether any of it actually matches.</p>
          <RunTable runs={runs} /></div></details>
      </div>}

      <h3 className="mt-5 text-[12.5px] font-semibold uppercase tracking-wide text-mute">Add your own sources <span className="normal-case tracking-normal">(optional)</span></h3>
      <div className="mt-2 flex flex-wrap gap-1.5" role="tablist" aria-label="Add your own sources">
        {OWN.map(({ id, label, icon }) => (
          <Button key={id} size="sm" role="tab" aria-selected={mode === id} variant={mode === id ? "primary" : "outline"} onClick={() => { setMode(id); setOutcomes([]); }}
            className={cx(!on(id) && mode !== id && "opacity-60")} data-mode={id}>{icon}{label}</Button>
        ))}
      </div>
      <div className="mt-2.5">
        <Check id={`in-${mode}`} label={cur.include} checked={on(mode)} onChange={(v) => setOn(mode, v)} />
      </div>

      {mode === "files" && <Drop id={p.compact ? "srcDrop2" : "srcDrop"} multiple label="Choose source files" onFiles={onSources} icon={<Files aria-hidden />} title="Drop files here or click to browse" sub="Add as many as you like" />}
      {mode === "paste" && <div className="mt-3 grid gap-2">
        <input className={inputCls} aria-label="Source name or URL" placeholder="Name or URL (optional)" value={pName} onChange={(e) => setPName(e.target.value)} />
        <textarea className={cx(inputCls, "min-h-28")} aria-label="Source text" placeholder="Paste the source text here" value={pText} onChange={(e) => setPText(e.target.value)} />
        <div><Button size="sm" variant="primary" onClick={addPasted}>Add source</Button></div>
      </div>}
      {mode === "url" && <div className="mt-3 flex gap-2">
        <input className={inputCls} type="url" aria-label="Web page address" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUrl()} />
        <Button variant="primary" onClick={addUrl} disabled={!!busy}>Add</Button>
      </div>}
      {mode === "refs" && <div className="mt-3 grid gap-2">
        <textarea className={cx(inputCls, "min-h-28")} aria-label="Reference list or DOIs" value={refs} onChange={(e) => setRefs(e.target.value)}
          placeholder={"One reference or DOI per line, e.g.\n10.1038/s41586-020-2649-2\nSmith, J. (2020). Title of the article. Journal, 12(3), 45–67."} />
        <div><Button size="sm" variant="primary" onClick={addRefs} disabled={!!busy || !refs.trim()}>Find open-access full text</Button></div>
      </div>}
      {mode === "lists" && <>
        <Catalogs onAdd={(item, text) => p.setSources((s) => [...s, {
          id: uid(), name: item.title, kind: "internet", input: "lists", text, toks: tokenize(text), found: { adapter: "Free book lists", url: item.url },
          meta: { authors: [], title: item.title, url: item.url, accessed: new Date().toISOString().slice(0, 10) },
        }])} confirmPrivacy={p.confirmPrivacy} />
      </>}

      {busy && <p className="mt-2 text-sm text-mute" role="status">{busy}</p>}
      {outcomes.length > 0 && <ul className="mt-3 grid gap-1.5 text-[13px]" aria-label="Import results">
        {outcomes.map((o, i) => <li key={i} className={cx("rounded-md border-l-4 bg-bg px-2.5 py-1.5", o.ok ? "border-low" : "border-high")}>
          <div className="truncate font-medium" title={o.entry}>{o.entry}</div>
          <div className="text-mute">{o.ok ? "✓ " : "✗ "}{o.message}{o.link && !o.ok && <> <a className="text-accent underline" href={o.link} target="_blank" rel="noreferrer">Open</a></>}</div>
        </li>)}
      </ul>}
      {p.sources.length > 0 && <ul className="mt-3" aria-label="Sources added">
        {p.sources.map((s) => <FileRow key={s.id} tag={s.input === "refs" || s.kind === "scholarly" ? "doi" : s.kind === "internet" ? "web" : s.kind === "paste" ? "text" : ext(s.name)}
          name={s.name} words={s.toks.length} off={!!s.input && !on(s.input)} onRemove={() => p.setSources((all) => all.filter((x) => x.id !== s.id))} />)}
      </ul>}
      {msg && <p role="alert" className="mt-2.5 text-[13.5px] text-high">{msg}</p>}
      <details className="mt-4 text-[12.5px] text-mute"><summary className="cursor-pointer">Which services are searched</summary>
        <AdapterList list={p.cfg?.sources ?? []} note="Korean Wikipedia joins automatically when your text contains Korean." />
      </details>
    </Card>
  );
}

const STATUS_STYLE: Record<string, string> = {
  success: "bg-low/12 text-low", "no results": "bg-soft text-mute", failed: "bg-high/12 text-high",
  "rate-limited": "bg-mid/12 text-mid", "not configured": "bg-soft text-mute", "cap reached": "bg-high/12 text-high", running: "bg-accent/12 text-accent",
};

export function RunTable({ runs }: { runs: SourceRun[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]" aria-label="Source status">
        <thead><tr className="text-left text-mute"><th className="py-1 pr-2 font-medium">Source</th><th className="pr-2 font-medium">Status</th><th className="pr-2 text-right font-medium">Results</th><th className="text-right font-medium">Time</th></tr></thead>
        <tbody>{runs.map((r) => <tr key={r.source} className="border-t border-line" data-source={r.source} data-status={r.status}>
          <td className="py-1.5 pr-2">{r.label}{r.error && <div className="text-[11.5px] text-mute">{r.error}</div>}</td>
          <td className="pr-2"><span className={cx("rounded-full px-2 py-0.5 text-[12px] font-medium", STATUS_STYLE[r.status])}>{r.status}</span></td>
          <td className="pr-2 text-right">{r.status === "running" ? "…" : r.results.length}</td>
          <td className="text-right text-mute" title={r.ms < 50 && r.status !== "not configured" ? "Same phrases searched in the last hour: answer reused" : undefined}>
            {r.status === "running" || r.status === "not configured" ? "—" : r.ms < 50 ? "cached" : `${(r.ms / 1000).toFixed(1)} s`}</td>
        </tr>)}</tbody>
      </table>
    </div>
  );
}

function AdapterList({ list, note }: { list: ServerConfig["sources"]; note?: string }) {
  if (!list.length) return null;
  return (
    <ul className="mt-3 grid gap-1 text-[13px]" aria-label="Sources searched">
      {list.map((a) => <li key={a.id} className="flex items-center gap-2">
        <span className={cx("size-2 rounded-full", a.missing ? "bg-mute" : "bg-low")} aria-hidden />
        <span className="font-medium">{a.label}</span><span className="text-mute">{a.missing ? `— not configured (${a.missing})` : "— ready"}</span>
      </li>)}
      {note && <li className="text-[12px] text-mute">{note}</li>}
    </ul>
  );
}

interface SettingsProps {
  settings: Settings; setSettings: (s: Settings) => void; prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void; cfg: ServerConfig | null;
  saved: SavedDoc[]; useSaved: boolean; setUseSaved: (v: boolean) => void; drafts: number;
}

const LT_LANGS = [["auto", "Detect automatically"], ["en-US", "English (US)"], ["en-GB", "English (UK)"], ["de-DE", "German"], ["fr", "French"],
  ["es", "Spanish"], ["pt-PT", "Portuguese"], ["nl", "Dutch"], ["it", "Italian"], ["pl-PL", "Polish"], ["ko-KR", "Korean"]] as const;

export function SettingsCard(p: SettingsProps & { className?: string }) {
  const s = p.settings, set = (patch: Partial<Settings>) => p.setSettings({ ...s, ...patch });
  return (
    <Card className={p.className} aria-labelledby="setH">
      <h2 id="setH" className="font-semibold">Check options</h2>
      <h3 className="mt-3 text-[13px] font-semibold uppercase tracking-wide text-mute">Plagiarism check</h3>
      <div className="mt-2 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <Check id="sAuto" label="Search automatically when I add a document" hint="Searches the internet and publications with short phrases. Turn off to search only when you press Search now."
          checked={p.prefs.autoSearch !== false} onChange={(v) => p.setPrefs({ autoSearch: v })} />
        {p.cfg?.translate && <Check id="sTranslate" label="Search in English too (documents in other languages)"
          hint="Translates half of the search phrases into English with LibreTranslate, and compares meaning across languages."
          checked={p.prefs.translateSearch !== false} onChange={(v) => p.setPrefs({ translateSearch: v })} />}
        <Check id="sQuotes" label="Ignore quotes and cited passages" hint="Excluded from the index and from search queries." checked={s.quotes} onChange={(v) => set({ quotes: v })} />
        <Check id="sBib" label="Exclude bibliography" checked={s.bib} onChange={(v) => set({ bib: v })} />
        <Check id="sPara" label="Detect paraphrase" hint="Compares meaning with an on-device model (downloads about 120 MB once). Reported separately, not in the index." checked={p.prefs.paraphrase !== false} onChange={(v) => p.setPrefs({ paraphrase: v })} />
        <Check id="sStrict" label="Stricter mode" hint="Also flag lightly reworded copying by word stems and common synonyms." checked={s.strict} onChange={(v) => set({ strict: v })} />
        <NumberField id="sMin" label="Exclude matches under" suffix="words" value={s.minWords} min={1} max={200} onChange={(v) => set({ minWords: v })} />
        <NumberField id="sNgram" label="Fingerprint size" suffix="words" value={s.ngram} min={2} max={12} onChange={(v) => set({ ngram: v })} />
        <label className="flex items-center gap-2 text-sm">Citation style
          <select className="h-8 rounded-md border border-line bg-bg px-2" value={p.prefs.style ?? "apa"} onChange={(e) => p.setPrefs({ style: e.target.value as Style })}>
            {Object.entries(STYLE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </div>
      <h3 className="mt-4 text-[13px] font-semibold uppercase tracking-wide text-mute">Other checks</h3>
      <div className="mt-2 grid gap-3.5 sm:grid-cols-2">
        {p.cfg?.aiLikelihood
          ? <Check id="sAi" label="AI-likelihood signal" checked={p.prefs.ai !== false} onChange={(v) => p.setPrefs({ ai: v })}
              hint="A probabilistic signal, never a verdict. Runs on your device; downloads about 210 MB of models the first time." />
          : <p className="text-[13px] text-mute">AI-likelihood signal: off on this server (ENABLE_AI_LIKELIHOOD).</p>}
        {p.cfg?.languageTool
          ? <div className="grid gap-2">
              <Check id="sLt" label="Second opinion from LanguageTool" checked={!!p.prefs.lt} onChange={(v) => p.setPrefs({ lt: v })}
                hint="Sends your text to this site's LanguageTool server. Harper always runs on your device." />
              {p.prefs.lt && <label className="ml-7 grid gap-1 text-sm">Language
                <select className="h-8 rounded-md border border-line bg-bg px-2" value={p.prefs.ltLang ?? "auto"} onChange={(e) => p.setPrefs({ ltLang: e.target.value })}>
                  {LT_LANGS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>}
            </div>
          : <p className="text-[13px] text-mute">LanguageTool: not enabled on this server (ENABLE_LANGUAGETOOL, LANGUAGETOOL_URL).</p>}
        <label className="grid gap-1 text-sm sm:col-span-2">Confidential words
          <textarea id="sConfidential" className={cx(inputCls, "min-h-16")} defaultValue={(p.prefs.confidential ?? []).join("\n")}
            placeholder="One per line, e.g. your employer, clients, internal system names"
            onBlur={(e) => p.setPrefs({ confidential: [...new Set(e.target.value.split(/[\n,]/).map((x) => x.trim()).filter(Boolean))] })} />
          <span className="text-[12px] text-mute">Names that shouldn&apos;t appear in what you hand in. The Write page and the overview point out every one it finds. Stays in this browser.</span>
        </label>
      </div>
      {(p.saved.length > 0 || p.drafts > 0) && <div className="mt-4 grid gap-2 border-t border-line pt-4">
        {p.saved.length > 0 && <Check id="useSaved" checked={p.useSaved} onChange={p.setUseSaved}
          label={`Also compare with my ${plural(p.saved.length, "saved document")}`}
          hint={p.saved.some((d) => d.own) ? "Documents marked as your earlier work are reported separately (self-plagiarism check)." : undefined} />}
        {p.drafts > 0 && <p className="text-sm text-mute">{plural(p.drafts, "previous draft")} of this document will be compared too, excluded from the index by default.</p>}
      </div>}
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

function FileRow({ tag, name, words, onRemove, off }: { tag: string; name: string; words: number; onRemove: () => void; off?: boolean }) {
  return (
    <li className={cx("flex items-center gap-2.5 border-t border-line py-2 text-sm first:border-t-0", off && "opacity-55")}>
      <span className="min-w-[42px] shrink-0 rounded-[5px] bg-soft px-1.5 py-0.5 text-center text-[10.5px] font-bold uppercase tracking-wide text-accent">{tag}</span>
      <span className="min-w-0 flex-1 truncate" title={name}>{name}{off && <span className="ml-1 text-[11.5px] text-mute">(input off)</span>}</span>
      <span className="shrink-0 text-[12.5px] text-mute">{words.toLocaleString()} words</span>
      <button onClick={onRemove} aria-label={`Remove ${name}`} className="grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-mute hover:bg-soft hover:text-high"><X size={16} /></button>
    </li>
  );
}

/** Browse the free-book catalogues (EbookFoundation/free-programming-books, 44bits/awesome-opensource-documents) and add titles as sources. */
function Catalogs({ onAdd, confirmPrivacy }: { onAdd: (item: CatalogItem, text: string) => void; confirmPrivacy: (s: string[]) => Promise<boolean> }) {
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
      const list = await loadCatalog(id);
      setItems((m) => ({ ...m, [id]: list }));
      setStatus("");
    } catch (e) { setStatus(`Couldn't load the list (${(e as Error).message}).`); }
  };
  // Every search word must start a word in the title, section or note ("pro git" finds Pro Git, not Programming).
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean).map((t) => new RegExp(`(^|[^a-z0-9])${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  const shown = (current ?? []).filter((it) => terms.every((t) => t.test(`${it.title} ${it.section} ${it.note}`.toLowerCase()))).slice(0, 40);
  const add = async (it: CatalogItem) => {
    if (!(await confirmPrivacy(["the book's web page (fetched by origincheck's server)"]))) return;
    setState((s) => ({ ...s, [it.url]: "Fetching…" }));
    const o = await importUrl(it.url);
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
