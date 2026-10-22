"use client";
// Paragraph check: the sources a paragraph is based on, added by pasting, uploading, DOI, ISBN or Wikipedia, each with
// citation details the user can correct.
import { useState } from "react";
import { BookOpen, FileUp, Globe, Hash, Loader2, Search, Trash2 } from "lucide-react";
import { type Style } from "@/lib/citations";
import type { SearchHit } from "@/lib/checks";
import { SUPPORTED, extract } from "@/lib/extract";
import { importUrl } from "@/lib/importer";
import { type PSource, citeFor } from "@/lib/paragraph/citations";
import { findPossibleSources, fromDoi, fromIsbn, fromWikipedia, hitToSource } from "@/lib/paragraph/client";
import type { CiteMeta } from "@/lib/similarity";
import type { LibraryItem } from "@/lib/store";
import { CopyLinks } from "../MyLibrary";
import { Button, Check, cx, inputCls } from "../ui";

type Mode = "paste" | "file" | "library" | "doi" | "isbn" | "wiki";
const MODES: { id: Mode; label: string }[] = [{ id: "paste", label: "Paste" }, { id: "file", label: "File" }, { id: "library", label: "My library" }, { id: "doi", label: "DOI" }, { id: "isbn", label: "ISBN" }, { id: "wiki", label: "Wikipedia" }];
const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);

interface Props {
  sources: PSource[]; setSources: (s: PSource[]) => void; style: Style; paragraph: string;
  findOn: boolean; setFindOn: (v: boolean) => void;
  /** My library: books and papers the user added on the Library page. */
  library?: LibraryItem[];
}

export default function SourcesPanel(p: Props) {
  const [mode, setMode] = useState<Mode>("paste");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [pasteText, setPasteText] = useState(""), [pasteTitle, setPasteTitle] = useState(""), [ref, setRef] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);

  const add = (s: Omit<PSource, "id">) => { p.setSources([...p.sources, { ...s, id: uid() }]); setMsg(`Added “${s.title}”.`); };
  const update = (i: number, patch: Partial<PSource>) => p.setSources(p.sources.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const run = async (f: () => Promise<void>) => { setBusy(true); setMsg(""); try { await f(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); } };

  const addPaste = () => {
    if (!pasteText.trim()) return setMsg("Paste the source text first.");
    const url = /^https?:\/\//.test(pasteTitle.trim()) ? pasteTitle.trim() : undefined;
    const title = url ? new URL(url).hostname.replace(/^www\./, "") : pasteTitle.trim() || "Pasted source";
    add({ title, text: pasteText.trim(), meta: { authors: [], title, url, accessed: url ? today() : undefined } });
    setPasteText(""); setPasteTitle("");
  };
  const lookup = () => run(async () => {
    const v = ref.trim();
    if (!v) throw new Error("Enter a value first.");
    if (mode === "doi") {
      const { meta, oaUrl } = await fromDoi(v);
      add({ title: meta.title, text: "", meta, oaUrl });
    } else if (mode === "isbn") {
      const meta = await fromIsbn(v);
      add({ title: meta.title, text: "", meta });
    } else {
      const { meta, text } = await fromWikipedia(v);
      add({ title: meta.title, text, meta });
    }
    setRef("");
  });
  const onFile = (f: File | undefined) => f && run(async () => {
    const x = await extract(f);
    const title = x.meta?.title || f.name.replace(/\.[^.]+$/, "");
    add({ title, text: x.text, meta: { authors: x.meta?.authors ?? [], ...x.meta, title } });
  });
  const search = () => run(async () => { setHits(null); setHits(await findPossibleSources(p.paragraph)); });

  return (
    <section className="grid grid-cols-[minmax(0,1fr)] gap-3" aria-labelledby="pSourcesH">
      <h2 id="pSourcesH" className="font-semibold">Sources</h2>
      {p.sources.length === 0 && <p className="text-[13px] text-mute">Add the source or sources your paragraph is based on.</p>}
      <ol className="grid grid-cols-[minmax(0,1fr)] gap-2" id="pSources">
        {p.sources.map((s, i) => <li key={s.id} className="rounded-lg border border-line p-2.5 text-[13px]" data-source={i}>
          <div className="flex items-start gap-2">
            <span className="grid h-6 min-w-6 place-items-center rounded-md bg-accent px-1 text-xs font-bold text-accent-ink">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold" title={s.title}>{s.title}</div>
              <div className="text-mute">Cite as <b className="text-ink">{citeFor(p.sources, i, p.style)}</b> · {s.text ? `${s.text.split(/\s+/).length.toLocaleString()} words` : "no text yet"}</div>
            </div>
            <Button size="sm" variant="ghost" aria-label={`Remove source ${i + 1}`} onClick={() => p.setSources(p.sources.filter((_, j) => j !== i))}><Trash2 size={14} /></Button>
          </div>
          {!s.text && <div className="mt-2 grid gap-1">
            {s.oaUrl && <Button size="sm" disabled={busy} onClick={() => run(async () => {
              const r = await importUrl(s.oaUrl!);
              if (!r.ok || !r.source) throw new Error(r.message);
              update(i, { text: r.source.text });
            })}><Globe size={14} />Load the open-access full text</Button>}
            <div className="text-mute">Need the book? <CopyLinks meta={s.meta} /></div>
            <label className="grid gap-1">Paste the passage you used, so its wording can be compared
              <textarea className={cx(inputCls, "min-h-16")} onBlur={(e) => e.target.value.trim() && update(i, { text: e.target.value.trim() })} data-source-text={i} />
            </label>
          </div>}
          <details className="mt-1.5">
            <summary className="cursor-pointer text-accent">Citation details</summary>
            <MetaForm meta={s.meta} page={s.page} onChange={(meta, page) => update(i, { meta, page, title: meta.title || s.title })} id={`p${i}`} />
          </details>
        </li>)}
      </ol>

      <div className="rounded-lg border border-line p-2.5">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label="Add a source by">
          {MODES.map((m) => <button key={m.id} role="tab" aria-selected={mode === m.id} data-add-mode={m.id} onClick={() => { setMode(m.id); setMsg(""); }}
            className={cx("cursor-pointer rounded-full border px-3 py-1 text-[12.5px] font-medium", mode === m.id ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-accent")}>{m.label}</button>)}
        </div>
        <div className="mt-2.5 grid gap-2 text-[13px]">
          {mode === "paste" && <>
            <textarea className={cx(inputCls, "min-h-24")} aria-label="Source text" placeholder="Paste the source text" value={pasteText} onChange={(e) => setPasteText(e.target.value)} id="pSourceText" />
            <input className={inputCls} aria-label="Source title or URL (optional)" placeholder="Title or URL (optional)" value={pasteTitle} onChange={(e) => setPasteTitle(e.target.value)} id="pSourceTitle" />
            <Button size="sm" onClick={addPaste} id="pAddSource">Add source</Button>
          </>}
          {mode === "library" && (!p.library?.length
            ? <p className="text-mute">Your library is empty. Add books and papers you own on the Library page (the books icon at the top).</p>
            : <ul className="grid max-h-56 gap-1 overflow-auto">{p.library.map((b) => {
              const added = p.sources.some((s) => s.id === b.id);
              return <li key={b.id} className="flex items-center gap-2 rounded-md bg-soft p-1.5">
                <span className="min-w-0 flex-1 truncate" title={b.name}>{b.name}</span>
                <Button size="sm" disabled={added} data-lib-add={b.id}
                  onClick={() => p.setSources([...p.sources, { id: b.id, title: b.name, text: b.text, meta: b.meta ?? { authors: [], title: b.name } }])}>{added ? "Added" : "Add"}</Button>
              </li>;
            })}</ul>)}
          {mode === "file" && <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line p-3 hover:border-accent">
            <FileUp size={16} aria-hidden />Choose a file ({SUPPORTED.replace(/,/g, ", ")})
            <input type="file" accept={SUPPORTED} className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} data-testid="pSourceFile" />
          </label>}
          {(mode === "doi" || mode === "isbn" || mode === "wiki") && <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); lookup(); }}>
            <input className={inputCls} value={ref} onChange={(e) => setRef(e.target.value)} id="pRef"
              aria-label={mode === "doi" ? "DOI" : mode === "isbn" ? "ISBN" : "Wikipedia URL or title"}
              placeholder={mode === "doi" ? "10.1038/171737a0" : mode === "isbn" ? "978-0-13-468599-1" : "https://en.wikipedia.org/wiki/PostgreSQL or a title"} />
            <Button size="sm" type="submit" disabled={busy}>{mode === "doi" ? <Hash size={14} /> : mode === "isbn" ? <BookOpen size={14} /> : <Globe size={14} />}Look up</Button>
          </form>}
          {mode === "doi" && <p className="text-[12px] text-mute">Details from Crossref; a free legal copy from Unpaywall when there is one.</p>}
          {mode === "isbn" && <p className="text-[12px] text-mute">Details from Open Library, or Google Books. Then paste the passage you used.</p>}
          {busy && <p className="flex items-center gap-1.5 text-mute" role="status"><Loader2 size={14} className="animate-spin" />Working…</p>}
          {msg && <p className="text-mute" role="status" id="pSourceMsg">{msg}</p>}
        </div>
      </div>

      <div className="rounded-lg border border-line p-2.5">
        <Check id="pFind" checked={p.findOn} onChange={(v) => { p.setFindOn(v); if (v && p.paragraph.trim()) search(); }}
          label="Find possible sources" hint="Sends short phrases from your paragraph to Wikipedia, Crossref and OpenAlex." />
        {p.findOn && <div className="mt-2 grid gap-1.5 text-[13px]">
          <Button size="sm" onClick={search} disabled={busy || !p.paragraph.trim()} className="justify-self-start"><Search size={14} />Search again</Button>
          {hits && !hits.length && <p className="text-mute">Nothing found. Add the source yourself above.</p>}
          {hits?.map((h) => <div key={h.doi ?? h.url ?? h.title} className="flex items-start gap-2 rounded-md bg-soft p-2" data-hit>
            <div className="min-w-0 flex-1"><div className="truncate font-medium" title={h.title}>{h.title}</div>
              <div className="truncate text-[12px] text-mute">{h.source}{h.year ? ` · ${h.year}` : ""}{h.authors.length ? ` · ${h.authors.slice(0, 2).join(", ")}` : ""}</div></div>
            <Button size="sm" onClick={() => { add(hitToSource(h)); setHits(hits.filter((x) => x !== h)); }}>Add</Button>
          </div>)}
        </div>}
      </div>
    </section>
  );
}

const authorsText = (a: CiteMeta["authors"]) => a.map((x) => [x.family, x.given].filter(Boolean).join(", ")).join("; ");

/** Citation details for one source. */
function MetaForm({ meta, page, onChange, id }: { meta: CiteMeta; page?: string; onChange: (m: CiteMeta, page?: string) => void; id: string }) {
  const [authors, setAuthors] = useState(authorsText(meta.authors));
  const field = (k: keyof CiteMeta, label: string, ph = "") => (
    <label className="grid gap-0.5">{label}
      <input className={cx(inputCls, "py-1")} value={(meta[k] as string) ?? ""} placeholder={ph} id={`${id}-${k}`} onChange={(e) => onChange({ ...meta, [k]: e.target.value || undefined }, page)} />
    </label>
  );
  return (
    <div className="mt-2 grid gap-1.5">
      <label className="grid gap-0.5">Author(s)
        <input className={cx(inputCls, "py-1")} value={authors} placeholder="Family, Given; Family, Given (or an organisation)" id={`${id}-authors`}
          onChange={(e) => setAuthors(e.target.value)}
          onBlur={() => onChange({ ...meta, authors: authors.split(";").map((x) => x.trim()).filter(Boolean).map((x) => { const [f, g] = x.split(/\s*,\s*/); return g ? { family: f, given: g } : { family: f }; }) }, page)} />
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5">{field("year", "Year", "2024")}<label className="grid gap-0.5">Page(s)
        <input className={cx(inputCls, "py-1")} value={page ?? ""} placeholder="12" id={`${id}-page`} onChange={(e) => onChange(meta, e.target.value || undefined)} /></label></div>
      {field("title", "Title")}
      {field("container", "Journal or website")}
      {field("publisher", "Publisher")}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5">{field("doi", "DOI")}{field("accessed", "Accessed", "yyyy-mm-dd")}</div>
      {field("url", "URL")}
    </div>
  );
}
