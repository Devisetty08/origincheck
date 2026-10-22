"use client";
// My library: the user's own reference books and papers, kept in this browser and compared in every check (when on).
// Added from files they own (PDF, EPUB, Word…), a .bib/.ris export, their Zotero library, or a search for books with a
// free, legal full text. For other books it only links to where a copy can be borrowed, bought or found.
import { useState } from "react";
import { BookOpen, ExternalLink, FileUp, Library as LibIcon, Loader2, Search, Trash2 } from "lucide-react";
import { findCopyLinks, lookupLine, parseReferenceFile, toMeta } from "@/lib/bibimport";
import { SUPPORTED, extract } from "@/lib/extract";
import { importReferences, importUrl } from "@/lib/importer";
import type { CiteMeta } from "@/lib/similarity";
import { type LibraryItem, uid } from "@/lib/store";
import { Button, Card, Check, cx, inputCls } from "./ui";

type BookHit = { title: string; authors: string[]; year?: string; isbn?: string; doi?: string; url?: string; source: string; get?: string; note: string };
type ZItem = { key: string; meta: CiteMeta; itemType: string; textKey?: string };
type Missing = { meta: CiteMeta; why: string };
type Tab = "files" | "books" | "refs" | "zotero";
const TABS: { id: Tab; label: string }[] = [{ id: "files", label: "My files" }, { id: "books", label: "Find a book" }, { id: "refs", label: "Reference file (.bib, .ris)" }, { id: "zotero", label: "Zotero" }];
const ORIGIN: Record<LibraryItem["origin"], string> = { file: "your file", zotero: "Zotero", bib: "reference file", openbook: "free book" };
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;
const byline = (m?: CiteMeta) => (m ? [m.authors.map((a) => a.family).filter(Boolean).slice(0, 2).join(", "), m.year].filter(Boolean).join(" · ") : "");
const splitName = (n: string): CiteMeta["authors"][number] => { const p = n.trim().split(/\s+/); return p.length > 1 ? { family: p[p.length - 1], given: p.slice(0, -1).join(" ") } : { family: n.trim() }; };

/** Where to borrow, buy or find a book: shown for anything without a free full text. */
export function CopyLinks({ meta, extra }: { meta: Pick<CiteMeta, "title" | "isbn" | "doi" | "authors">; extra?: string }) {
  return <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-[12.5px]">
    {extra && <a className="inline-flex items-center gap-1 text-accent underline" href={extra} target="_blank" rel="noreferrer"><ExternalLink size={12} />Book page</a>}
    {findCopyLinks(meta).map((l) => <a key={l.url} className="inline-flex items-center gap-1 text-accent underline" href={l.url} target="_blank" rel="noreferrer"><ExternalLink size={12} />{l.label}</a>)}
  </span>;
}

export default function MyLibrary({ items, setItems, on, setOn }: { items: LibraryItem[]; setItems: (x: LibraryItem[]) => void; on: boolean; setOn: (v: boolean) => void }) {
  const [tab, setTab] = useState<Tab>("files");
  const [busy, setBusy] = useState(""), [msg, setMsg] = useState("");
  const [missing, setMissing] = useState<Missing[]>([]);
  const [q, setQ] = useState(""), [books, setBooks] = useState<BookHit[] | null>(null);
  const [zq, setZq] = useState(""), [zitems, setZitems] = useState<ZItem[] | null>(null);

  const has = (name: string) => items.some((x) => x.name.toLowerCase() === name.toLowerCase());
  const add = (list: Omit<LibraryItem, "id" | "addedAt">[]) => {
    const fresh = list.filter((x) => x.text.trim() && !has(x.name)).map((x) => ({ ...x, id: uid(), addedAt: new Date().toISOString() }));
    if (fresh.length) setItems([...items, ...fresh]);
    return fresh.length;
  };
  const run = async (label: string, f: () => Promise<void>) => { setBusy(label); setMsg(""); try { await f(); } catch (e) { setMsg((e as Error).message); } finally { setBusy(""); } };
  const json = async <T,>(url: string): Promise<T> => { const r = await fetch(url); const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`); return j as T; };

  const onFiles = (files: FileList | null) => files?.length && run("Reading your files…", async () => {
    const got: Omit<LibraryItem, "id" | "addedAt">[] = [], errs: string[] = [];
    for (const f of [...files]) {
      try {
        const x = await extract(f);
        const name = x.meta?.title || f.name.replace(/\.[^.]+$/, "");
        got.push({ name, text: x.text, meta: { authors: x.meta?.authors ?? [], ...x.meta, title: name }, origin: "file" });
      } catch (e) { errs.push((e as Error).message); }
    }
    const n = add(got);
    setMsg([`${n} added to your library.`, ...errs].join(" "));
  });

  const onRefFile = (f: File | undefined) => f && run("Finding free full texts…", async () => {
    const entries = parseReferenceFile(f.name, await f.text()).filter((e) => e.title || e.doi);
    if (!entries.length) throw new Error("No references found in that file. Export it from your reference manager as BibTeX (.bib) or RIS (.ris).");
    const got: Omit<LibraryItem, "id" | "addedAt">[] = [], miss: Missing[] = [];
    for (let i = 0; i < entries.length; i += 30) { // the importer takes 30 at a time
      const batch = entries.slice(i, i + 30);
      const out = await importReferences(batch.map(lookupLine).join("\n"),(done) => setBusy(`Finding free full texts… ${Math.min(entries.length, i + done)} of ${entries.length}`));
      batch.forEach((e, k) => {
        const o = out.find((x) => x.entry === lookupLine(e)) ?? out[k];
        if (o?.ok && o.source) got.push({ name: o.source.meta?.title || e.title || o.source.name, text: o.source.text, meta: o.source.meta ?? toMeta(e), origin: "bib" });
        else miss.push({ meta: toMeta(e), why: "No free, legal full text was found." });
      });
    }
    setMissing(miss);
    setMsg(`${add(got)} added with full text. ${miss.length ? `${miss.length} without a free copy are listed below with where to find them.` : ""}`);
  });

  const searchBooks = () => q.trim().length >= 2 && run("Searching books…", async () => setBooks((await json<{ books: BookHit[] }>(`/api/books?q=${encodeURIComponent(q.trim())}`)).books));
  const addBook = (b: BookHit) => run(`Getting “${b.title}”…`, async () => {
    const meta: CiteMeta = { authors: b.authors.map(splitName), title: b.title, year: b.year, isbn: b.isbn, doi: b.doi, url: b.url };
    let text: string;
    if (b.get!.startsWith("pdf:")) {
      const r = await importUrl(b.get!.slice(4));
      if (!r.ok || !r.source) throw new Error(r.message);
      text = r.source.text;
    } else text = (await json<{ text: string }>(`/api/books?get=${encodeURIComponent(b.get!)}`)).text;
    setMsg(add([{ name: b.title, text, meta, origin: "openbook" }]) ? `Added “${b.title}” (${words(text).toLocaleString()} words).` : `“${b.title}” is already in your library.`);
  });

  const searchZotero = () => run("Reading your Zotero library…", async () => setZitems((await json<{ items: ZItem[] }>(`/api/zotero?q=${encodeURIComponent(zq.trim())}`)).items));
  const addZotero = (list: ZItem[]) => run("Importing from Zotero…", async () => {
    const got: Omit<LibraryItem, "id" | "addedAt">[] = [];
    for (const z of list.filter((x) => x.textKey && !has(x.meta.title))) {
      const { text } = await json<{ text: string }>(`/api/zotero?text=${z.textKey}`);
      if (text.trim()) got.push({ name: z.meta.title, text, meta: z.meta, origin: "zotero" });
    }
    setMsg(`${add(got)} added from Zotero.`);
  });

  const total = items.reduce((n, x) => n + words(x.text), 0);
  return (
    <Card id="myLibrary">
      <h2 className="flex items-center gap-1.5 font-semibold"><LibIcon size={16} />My library ({items.length})</h2>
      <p className="mt-1 text-sm text-mute">Your reference books and papers, kept only in this browser. Every check compares your document against them, so copying from a book you own is caught even when it isn&apos;t online.</p>
      <div className="mt-2"><Check id="useLibrary" checked={on} onChange={setOn} label="Compare every check against my library" hint={items.length ? `${items.length} item${items.length === 1 ? "" : "s"}, ${total.toLocaleString()} words` : undefined} /></div>

      <div className="mt-3 flex flex-wrap gap-1" role="tablist" aria-label="Add to my library">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setMsg(""); }} data-lib-tab={t.id}
          className={cx("cursor-pointer rounded-full border px-3 py-1 text-[12.5px] font-medium", tab === t.id ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-accent")}>{t.label}</button>)}
      </div>

      <div className="mt-3 grid gap-2 text-[13.5px]">
        {tab === "files" && <>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line p-3 hover:border-accent">
            <FileUp size={16} aria-hidden />Add books and papers you own: PDF, EPUB, Word and more
            <input type="file" multiple accept={SUPPORTED} className="sr-only" onChange={(e) => onFiles(e.target.files)} data-testid="libFiles" />
          </label>
          <p className="text-[12.5px] text-mute">E-books with DRM can&apos;t be read; use a DRM-free copy. Scanned PDFs are read with OCR (English, first 30 pages).</p>
        </>}
        {tab === "books" && <>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); searchBooks(); }}>
            <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Title, author or subject" aria-label="Find a book" id="bookQuery" />
            <Button size="sm" type="submit" disabled={!!busy}><Search size={14} />Search</Button>
          </form>
          <p className="text-[12.5px] text-mute">Full texts come only from free, legal copies: open-access books, public-domain scans on the Internet Archive and Project Gutenberg. For other books you get links to borrow, buy or find them in a library; add the file yourself if you own it.</p>
          {books && !books.length && <p className="text-mute">No books found.</p>}
          {books?.map((b, i) => <div key={`${b.title}-${i}`} className="rounded-lg border border-line p-2.5" data-book={b.get ? "free" : "links"}>
            <div className="font-medium">{b.title}</div>
            <div className="text-[12.5px] text-mute">{[b.authors.slice(0, 2).join(", "), b.year, b.source].filter(Boolean).join(" · ")}</div>
            <div className="mt-0.5 text-[12.5px]">{b.note}</div>
            <div className="mt-1.5">{b.get ? <Button size="sm" onClick={() => addBook(b)} disabled={!!busy}><BookOpen size={14} />Add the full text to my library</Button>
              : <CopyLinks meta={{ title: b.title, isbn: b.isbn, doi: b.doi, authors: b.authors.map(splitName) }} extra={b.url} />}</div>
          </div>)}
        </>}
        {tab === "refs" && <>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-line p-3 hover:border-accent">
            <FileUp size={16} aria-hidden />Import a reference list exported from Zotero, Mendeley, EndNote… (.bib or .ris)
            <input type="file" accept=".bib,.ris" className="sr-only" onChange={(e) => onRefFile(e.target.files?.[0])} data-testid="libRefs" />
          </label>
          <p className="text-[12.5px] text-mute">Each reference is looked up (Crossref, OpenAlex, Unpaywall, Europe PMC) and its free, legal full text added when there is one. Only the references are sent, never your document.</p>
        </>}
        {tab === "zotero" && <>
          <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); searchZotero(); }}>
            <input className={inputCls} value={zq} onChange={(e) => setZq(e.target.value)} placeholder="Search your Zotero library (empty: most recent 50)" aria-label="Search Zotero" />
            <Button size="sm" type="submit" disabled={!!busy}><Search size={14} />Show</Button>
          </form>
          <p className="text-[12.5px] text-mute">Uses your own Zotero key (Settings, My library), only on your own computer. Full text comes from the PDFs Zotero has indexed in your library.</p>
          {zitems && !zitems.length && <p className="text-mute">Nothing found in your Zotero library.</p>}
          {zitems && zitems.some((z) => z.textKey) && <Button size="sm" className="justify-self-start" onClick={() => addZotero(zitems)} disabled={!!busy}>Add all with full text ({zitems.filter((z) => z.textKey).length})</Button>}
          {zitems?.map((z) => <div key={z.key} className="rounded-lg border border-line p-2.5">
            <div className="font-medium">{z.meta.title}</div>
            <div className="text-[12.5px] text-mute">{[byline(z.meta), z.itemType].filter(Boolean).join(" · ")}</div>
            <div className="mt-1.5">{z.textKey ? <Button size="sm" onClick={() => addZotero([z])} disabled={!!busy || has(z.meta.title)}>{has(z.meta.title) ? "In your library" : "Add to my library"}</Button>
              : <><div className="text-[12.5px] text-mute">No indexed full text in Zotero. Attach the PDF in Zotero, or find a copy:</div><CopyLinks meta={z.meta} /></>}</div>
          </div>)}
        </>}
        {busy && <p className="flex items-center gap-1.5 text-mute" role="status"><Loader2 size={14} className="animate-spin" />{busy}</p>}
        {msg && <p className="text-mute" role="status" id="libMsg">{msg}</p>}
        {missing.length > 0 && <div className="rounded-lg bg-soft p-2.5">
          <div className="font-semibold">No free copy found ({missing.length})</div>
          <ul className="mt-1 grid gap-1.5">{missing.slice(0, 50).map((m, i) => <li key={i}><div>{m.meta.title} <span className="text-mute">{byline(m.meta)}</span></div><CopyLinks meta={m.meta} /></li>)}</ul>
        </div>}
      </div>

      {items.length > 0 && <ul className="mt-3" id="libItems">
        {items.map((x) => <li key={x.id} className="flex items-center gap-2 border-t border-line py-2 text-sm">
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium" title={x.name}>{x.name}</div>
            <div className="text-[12.5px] text-mute">{[byline(x.meta), `${words(x.text).toLocaleString()} words`, `from ${ORIGIN[x.origin]}`].filter(Boolean).join(" · ")}</div>
          </div>
          <Button size="sm" variant="ghost" aria-label={`Remove ${x.name}`} onClick={() => setItems(items.filter((y) => y.id !== x.id))}><Trash2 size={14} /></Button>
        </li>)}
      </ul>}
    </Card>
  );
}
