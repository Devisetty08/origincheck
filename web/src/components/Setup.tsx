"use client";
import { useRef, useState } from "react";
import { ClipboardPaste, FileUp, Files, Globe, Link2, Lock, X } from "lucide-react";
import { type CiteMeta, type Settings, type Source, tokenize } from "@/lib/engine";
import { SUPPORTED, extract } from "@/lib/extract";
import { type ImportOutcome, importReferences, importUrl } from "@/lib/importer";
import { STYLE_LABEL, type Style } from "@/lib/citations";
import type { Prefs, SavedDoc } from "@/lib/store";
import { uid } from "@/lib/store";
import { plural } from "@/lib/words";
import { Button, Card, Check, NumberField, cx, inputCls } from "./ui";
import type { Doc, HStyle } from "./App";

interface Props {
  doc: Doc | null; setDoc: (d: Doc | null) => void;
  sources: Source[]; setSources: (f: (s: Source[]) => Source[]) => void;
  settings: Settings; setSettings: (s: Settings) => void;
  prefs: Prefs; setPrefs: (p: Partial<Prefs>) => void;
  saved: SavedDoc[]; useSaved: boolean; setUseSaved: (v: boolean) => void;
  drafts: number; onRun: () => void; busy: string;
}

const ext = (name: string) => (name.match(/\.([^.]+)$/)?.[1] ?? "txt").slice(0, 4);
const fillMeta = (m: Partial<CiteMeta> | undefined, name: string): CiteMeta | undefined =>
  m && (m.title || m.authors?.length) ? { authors: m.authors ?? [], title: m.title || name.replace(/\.[^.]+$/, ""), year: m.year } : undefined;

export default function Setup(p: Props) {
  const [docMsg, setDocMsg] = useState("");
  const [srcMsg, setSrcMsg] = useState("");
  const [mode, setMode] = useState<"files" | "paste" | "url" | "refs">("files");
  const [pasteDoc, setPasteDoc] = useState<string | null>(null);
  const [pName, setPName] = useState("");
  const [pText, setPText] = useState("");
  const [url, setUrl] = useState("");
  const [refs, setRefs] = useState("");
  const [importing, setImporting] = useState("");
  const [outcomes, setOutcomes] = useState<ImportOutcome[]>([]);

  const readFiles = async (files: File[], setMsg: (m: string) => void) => {
    const ok: (Source & { headings: Map<string, HStyle> })[] = [], errs: string[] = [];
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
    setMsg(errs.join(" "));
    return ok;
  };

  const onDoc = async (files: File[]) => {
    const [d] = await readFiles(files.slice(0, 1), setDocMsg);
    if (d) p.setDoc({ name: d.name, text: d.text, toks: d.toks, headings: d.headings, kind: "file" });
  };
  const onSources = async (files: File[]) => {
    const ok = await readFiles(files, setSrcMsg);
    p.setSources((s) => [...s, ...ok.map((x) => ({ id: x.id, name: x.name, kind: x.kind, text: x.text, toks: x.toks, meta: x.meta }))]);
  };
  const addPasted = () => {
    const toks = tokenize(pText);
    if (!toks.length) return setSrcMsg("Paste some source text first.");
    const isUrl = /^https?:\/\//i.test(pName.trim());
    const name = pName.trim() || `Pasted source ${p.sources.filter((s) => s.kind === "paste").length + 1}`;
    p.setSources((s) => [...s, { id: uid(), name, kind: isUrl ? "internet" : "paste", text: pText.replace(/\r\n?/g, "\n"), toks,
      meta: isUrl ? { authors: [], title: name, url: name, accessed: new Date().toISOString().slice(0, 10) } : undefined }]);
    setPName(""); setPText(""); setSrcMsg("");
  };
  const net = { proxy: p.prefs.proxy ?? true, email: p.prefs.email };
  const addUrl = async () => {
    if (!/^https?:\/\/\S+$/i.test(url.trim())) return setSrcMsg("Enter a full web address starting with https://");
    setImporting("Fetching page…");
    const o = await importUrl(url.trim(), net);
    setImporting("");
    setOutcomes([o]);
    if (o.source) { addImported([o]); setUrl(""); }
  };
  const addRefs = async () => {
    setOutcomes([]);
    const out = await importReferences(refs, net, (d, t) => setImporting(`Looking up ${Math.min(d + 1, t)} of ${t}…`));
    setImporting("");
    setOutcomes(out);
    addImported(out);
  };
  const addImported = (out: ImportOutcome[]) =>
    p.setSources((s) => [...s, ...out.filter((o) => o.source).map((o) => ({
      id: uid(), name: o.source!.name, kind: "internet" as const, text: o.source!.text, toks: tokenize(o.source!.text), meta: o.source!.meta,
    }))]);

  const s = p.settings, set = (patch: Partial<Settings>) => p.setSettings({ ...s, ...patch });
  const savedOn = p.saved.length > 0 && p.useSaved;
  const ready = !!p.doc && (p.sources.length > 0 || savedOn || p.drafts > 0);
  const internet = !!p.prefs.internet;

  return (
    <main className="mx-auto max-w-[1180px] px-4 pt-7 pb-12">
      <div className="mb-6">
        <h1 className="text-[clamp(23px,4vw,30px)] font-bold leading-tight tracking-tight">Check your writing, then fix it honestly</h1>
        <p className="mt-1.5 text-[15.5px] text-mute">origincheck finds passages that share wording with your sources, explains why, and helps you quote, paraphrase and cite them properly.</p>
        <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-soft px-3 py-1.5 text-[13px]">
          <Lock size={15} className="text-accent" aria-hidden /> Everything runs in your browser. Nothing is uploaded{internet ? " except the DOIs and web addresses you look up" : ""}.
        </p>
      </div>

      <div className="grid gap-[18px] md:grid-cols-2">
        <Card aria-labelledby="docH">
          <h2 id="docH" className="font-semibold">1. Your document</h2>
          <p className="text-[13.5px] text-mute">The paper, essay or dissertation you want to check.</p>
          <Drop id="docDrop" label="Choose your document file" onFiles={onDoc} icon={<FileUp aria-hidden />} title="Drop a file here or click to browse" sub=".docx, .pdf, .txt, .md, .html, .rtf" />
          {p.doc && <ul className="mt-3"><FileRow tag={p.doc.kind === "paste" ? "text" : ext(p.doc.name)} name={p.doc.name} words={p.doc.toks.length} onRemove={() => p.setDoc(null)} /></ul>}
          {pasteDoc === null
            ? <Button variant="link" className="mt-3" onClick={() => setPasteDoc("")}>Paste text instead</Button>
            : <div className="mt-3 grid gap-2">
                <textarea className={cx(inputCls, "min-h-32")} aria-label="Document text" placeholder="Paste your document text here" value={pasteDoc} onChange={(e) => setPasteDoc(e.target.value)} />
                <div className="flex gap-2">
                  <Button size="sm" variant="primary" onClick={() => {
                    const toks = tokenize(pasteDoc);
                    if (!toks.length) return setDocMsg("Paste some text first.");
                    p.setDoc({ name: "Pasted text", text: pasteDoc.replace(/\r\n?/g, "\n"), toks, headings: new Map(), kind: "paste" });
                    setPasteDoc(null); setDocMsg("");
                  }}>Use this text</Button>
                  <Button size="sm" variant="ghost" onClick={() => setPasteDoc(null)}>Cancel</Button>
                </div>
              </div>}
          {docMsg && <p role="alert" className="mt-2.5 text-[13.5px] text-high">{docMsg}</p>}
        </Card>

        <Card aria-labelledby="srcH">
          <h2 id="srcH" className="font-semibold">2. Sources to compare against</h2>
          <p className="text-[13.5px] text-mute">Papers, articles and web pages you read or used.</p>
          <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="How to add sources">
            {([["files", "Files", <Files key="i" size={15} />], ["paste", "Paste", <ClipboardPaste key="i" size={15} />], ["url", "Web page", <Link2 key="i" size={15} />], ["refs", "References & DOIs", <Globe key="i" size={15} />]] as const)
              .map(([id, label, icon]) => (
                <Button key={id} size="sm" variant={mode === id ? "primary" : "outline"} aria-pressed={mode === id} onClick={() => { setMode(id); setOutcomes([]); }}>{icon}{label}</Button>
              ))}
          </div>
          {mode === "files" && <Drop id="srcDrop" multiple label="Choose source files" onFiles={onSources} icon={<Files aria-hidden />} title="Drop files here or click to browse" sub="Add as many as you like" />}
          {mode === "paste" && <div className="mt-3 grid gap-2">
            <input className={inputCls} aria-label="Source name or URL" placeholder="Name or URL (optional)" value={pName} onChange={(e) => setPName(e.target.value)} />
            <textarea className={cx(inputCls, "min-h-28")} aria-label="Source text" placeholder="Paste the source text here" value={pText} onChange={(e) => setPText(e.target.value)} />
            <div><Button size="sm" variant="primary" onClick={addPasted}>Add source</Button></div>
          </div>}
          {(mode === "url" || mode === "refs") && !internet && <div className="mt-3 rounded-lg bg-soft p-3 text-sm">
            <p>Adding sources from the web sends {mode === "url" ? "the address you enter" : "the references and DOIs you paste"} to look them up. Your document is never sent.</p>
            <Button size="sm" variant="primary" className="mt-2" onClick={() => p.setPrefs({ internet: true })}>Turn on internet features</Button>
          </div>}
          {mode === "url" && internet && <div className="mt-3 grid gap-2">
            <div className="flex gap-2">
              <input className={inputCls} type="url" aria-label="Web page address" placeholder="https://…" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addUrl()} />
              <Button variant="primary" onClick={addUrl} disabled={!!importing}>Add</Button>
            </div>
          </div>}
          {mode === "refs" && internet && <div className="mt-3 grid gap-2">
            <textarea className={cx(inputCls, "min-h-32")} aria-label="Reference list or DOIs" value={refs} onChange={(e) => setRefs(e.target.value)}
              placeholder={"One reference or DOI per line, e.g.\n10.1038/s41586-020-2649-2\nSmith, J. (2020). Title of the article. Journal, 12(3), 45–67."} />
            <div><Button size="sm" variant="primary" onClick={addRefs} disabled={!!importing || !refs.trim()}>Find open-access full text</Button></div>
          </div>}
          {importing && <p className="mt-2 text-sm text-mute" role="status">{importing}</p>}
          {outcomes.length > 0 && <ul className="mt-3 grid gap-1.5 text-[13px]" aria-label="Import results">
            {outcomes.map((o, i) => <li key={i} className={cx("rounded-md border-l-4 bg-bg px-2.5 py-1.5", o.ok ? "border-low" : "border-high")}>
              <div className="truncate font-medium" title={o.entry}>{o.entry}</div>
              <div className="text-mute">{o.ok ? "✓ " : "✗ "}{o.message}{o.link && !o.ok && <> <a className="text-accent underline" href={o.link} target="_blank" rel="noreferrer">Open</a></>}</div>
            </li>)}
          </ul>}
          {p.sources.length > 0 && <ul className="mt-3">
            {p.sources.map((s) => <FileRow key={s.id} tag={s.kind === "internet" ? "web" : s.kind === "paste" ? "text" : ext(s.name)} name={s.name} words={s.toks.length}
              onRemove={() => p.setSources((all) => all.filter((x) => x.id !== s.id))} />)}
          </ul>}
          {srcMsg && <p role="alert" className="mt-2.5 text-[13.5px] text-high">{srcMsg}</p>}
        </Card>
      </div>

      <Card className="mt-[18px]" aria-labelledby="setH">
        <h2 id="setH" className="font-semibold">Settings</h2>
        <div className="mt-3 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
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
            <Check id="sNet" checked={internet} onChange={(v) => p.setPrefs({ internet: v })} label="Allow looking up DOIs, references and web pages"
              hint="Sends only the DOIs, references and addresses you enter to Crossref, OpenAlex, Europe PMC and the page itself. Never your document." />
            <Check id="sProxy" checked={p.prefs.proxy ?? true} onChange={(v) => p.setPrefs({ proxy: v })} label="Use a reader service when a site blocks in-browser downloads"
              hint="Sends the page or PDF address (not your document) to r.jina.ai, which returns the page's readable text." />
            <label className="grid gap-1 text-sm max-w-md">Email for Unpaywall (optional)
              <input className={inputCls} type="email" value={p.prefs.email ?? ""} onChange={(e) => p.setPrefs({ email: e.target.value })} placeholder="you@university.edu" />
              <span className="text-[12.5px] text-mute">Unpaywall asks for an email with each lookup. Without one, origincheck uses OpenAlex only.</span>
            </label>
          </div>
        </details>
      </Card>

      <div className="mt-5 flex flex-wrap items-center gap-3.5">
        <Button size="lg" variant="primary" id="runBtn" disabled={!ready || !!p.busy} onClick={p.onRun}>
          {p.busy || (!p.doc ? "Add your document to start" : !ready ? "Add at least one source" : "Run check")}
        </Button>
        {ready && !p.busy && <span className="text-[13.5px] text-mute">{plural(p.sources.length, "source")}{savedOn ? ` + ${p.saved.length} saved` : ""}{p.drafts ? ` + ${plural(p.drafts, "draft")}` : ""}</span>}
      </div>
    </main>
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
