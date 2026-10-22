"use client";
// Find a book or paper: search by anything, title, author, words inside the text, a citation, an ISBN or a DOI, across
// Open Library and the Internet Archive, text inside books, Project Gutenberg, open-access literature (OpenAlex),
// Crossref with Unpaywall, and Google Books. Free downloads only where the source offers them legally; everything else
// shows the matching text and where to read, borrow or buy it.
import { useEffect, useMemo, useState } from "react";
import { BookOpenText, CheckCircle2, ExternalLink, FileDown, Library as LibIcon, Loader2, Search, XCircle } from "lucide-react";
import { importUrl } from "@/lib/importer";
import type { CiteMeta } from "@/lib/similarity";
import type { LibraryItem } from "@/lib/store";
import { CopyLinks } from "./MyLibrary";
import { Button, Card, Dialog, cx, inputCls } from "./ui";

type Mode = "any" | "title" | "author" | "keywords" | "citation" | "isbn" | "doi";
type Found = { key: string; title: string; authors: string[]; year?: string; kind: string; source: string; isbn?: string; doi?: string; snippet?: string;
  readUrl?: string; downloads: { label: string; url: string }[]; get?: string; access: "free" | "snippet" | "details" };
type SourceStatus = { label: string; status: "ok" | "none" | "failed"; count: number; note?: string };

const MODES: { id: Mode; label: string; ph: string }[] = [
  { id: "any", label: "Anything", ph: "A title, author, topic, citation, ISBN or DOI" },
  { id: "title", label: "Title", ph: "e.g. The Wealth of Nations" },
  { id: "author", label: "Author", ph: "e.g. Jane Austen" },
  { id: "keywords", label: "Words in the text", ph: "e.g. \"invisible hand\" or a sentence you remember" },
  { id: "citation", label: "Citation", ph: "Paste a reference, e.g. Smith, A. (1776) The Wealth of Nations. London: Strahan." },
  { id: "isbn", label: "ISBN", ph: "e.g. 978-0-13-468599-1" },
  { id: "doi", label: "DOI", ph: "e.g. 10.1038/171737a0" },
];
export const SEARCHED = ["Open Library and the Internet Archive", "text inside books", "Project Gutenberg", "open-access books and papers (OpenAlex)", "citations (Crossref and Unpaywall)", "Google Books"];
const ACCESS: Record<Found["access"], [string, string]> = {
  free: ["Free download", "bg-low/15 text-low"], snippet: ["Matching text", "bg-accent/12 text-accent"], details: ["Details", "bg-soft text-mute"],
};
const splitName = (n: string): CiteMeta["authors"][number] => { const p = n.trim().split(/\s+/); return p.length > 1 ? { family: p[p.length - 1], given: p.slice(0, -1).join(" ") } : { family: n.trim() }; };
const metaOf = (f: Found): CiteMeta => ({ authors: f.authors.map(splitName), title: f.title, year: f.year, isbn: f.isbn, doi: f.doi, url: f.readUrl });

/** Highlights the search words inside a snippet. */
function Marked({ text, q }: { text: string; q: string }) {
  const ws = useMemo(() => q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [], [q]);
  if (!ws.length) return <>{text}</>;
  const re = new RegExp(`(${ws.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return <>{text.split(re).map((part, i) => (i % 2 ? <mark key={i} className="rounded-sm bg-mid/25 text-inherit">{part}</mark> : part))}</>;
}

/** Passages of a text around the search words. */
const passages = (text: string, q: string, n = 5) => {
  const ws = q.toLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  const lower = text.toLowerCase(), out: string[] = [];
  let from = 0;
  while (ws.length && out.length < n) {
    const hits = ws.map((w) => lower.indexOf(w, from)).filter((i) => i >= 0);
    if (!hits.length) break;
    const at = Math.min(...hits), s = Math.max(0, at - 280), e = Math.min(text.length, at + 420);
    out.push(`${s ? "… " : ""}${text.slice(s, e).replace(/\s+/g, " ").trim()}${e < text.length ? " …" : ""}`);
    from = e;
  }
  return out;
};

export default function FindBook({ onAdd, compact }: { onAdd?: (item: Omit<LibraryItem, "id" | "addedAt">) => boolean; compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("any");
  const [q, setQ] = useState("");
  const [res, setRes] = useState<{ q: string; mode: Mode; results: Found[]; sources: SourceStatus[] } | null>(null);
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState("");
  const [reader, setReader] = useState<{ f: Found; text?: string; error?: string } | null>(null);
  const [added, setAdded] = useState<Set<string>>(new Set());

  const search = async (query = q, m = mode) => {
    const t = query.trim();
    if (t.length < 2) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch(`/api/books?q=${encodeURIComponent(t)}&mode=${m}`);
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setRes({ q: t, ...j });
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  // results pop up as you type (after a short pause)
  useEffect(() => {
    if (q.trim().length < 4 || (res && res.q === q.trim() && res.mode === mode)) return;
    const t = setTimeout(() => search(), 900);
    return () => clearTimeout(t);
  }, [q, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const fullText = async (f: Found) => {
    if (f.get!.startsWith("pdf:")) { const r = await importUrl(f.get!.slice(4)); if (!r.ok || !r.source) throw new Error(r.message); return r.source.text; }
    const r = await fetch(`/api/books?get=${encodeURIComponent(f.get!)}`), j = await r.json();
    if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
    return j.text as string;
  };
  const read = async (f: Found) => {
    setReader({ f });
    try { setReader({ f, text: await fullText(f) }); } catch (e) { setReader({ f, error: (e as Error).message }); }
  };
  const add = async (f: Found) => {
    setBusy(true); setMsg("");
    try {
      const text = reader?.f.key === f.key && reader.text ? reader.text : await fullText(f);
      const ok = onAdd!({ name: f.title, text, meta: metaOf(f), origin: "openbook" });
      setAdded((s) => new Set(s).add(f.key));
      setMsg(ok ? `Added “${f.title}” to My library.` : `“${f.title}” is already in My library.`);
    } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
  };
  const ph = MODES.find((m) => m.id === mode)!.ph;

  const body = <>
    <form className="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]" onSubmit={(e) => { e.preventDefault(); search(); }} role="search">
      <select className="h-9 rounded-lg border border-line bg-bg px-2 text-sm" value={mode} onChange={(e) => { setMode(e.target.value as Mode); setRes(null); }} aria-label="Search by" id="findMode">
        {MODES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
      <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder={ph} aria-label="Find a book or paper" id="findQuery" />
      <Button type="submit" variant="primary" disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />}Search</Button>
    </form>
    <p className="mt-2 text-[12.5px] text-mute">Searches {SEARCHED.join(", ")}. Free downloads appear only for open-access and public-domain works. For other books you see the matching text and where to read, borrow or buy them.</p>
    {msg && <p className="mt-2 text-[13px] text-mute" role="status" id="findMsg">{msg}</p>}

    {res && <>
      <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px]" aria-label="Sources searched" id="findSources">
        {res.sources.map((s) => <li key={s.label} className="inline-flex items-center gap-1" data-source-status={s.status}>
          {s.status === "failed" ? <XCircle size={13} className="text-high" aria-hidden /> : <CheckCircle2 size={13} className={s.status === "ok" ? "text-low" : "text-mute"} aria-hidden />}
          {s.label}: {s.status === "ok" ? s.count : s.status === "none" ? "nothing" : s.note}
        </li>)}
      </ul>
      {res.mode !== mode && <p className="mt-1 text-[12.5px] text-mute">Searched as {MODES.find((m) => m.id === res.mode)?.label}.</p>}
      {!res.results.length && <p className="mt-3 text-sm text-mute">Nothing found. Try fewer words, or another search type.</p>}
      <ol className="mt-3 grid gap-2.5" id="findResults">
        {res.results.map((f) => <li key={f.key} className="rounded-lg border border-line p-3 text-[13.5px]" data-access={f.access}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cx("rounded-full px-2 py-0.5 text-[11.5px] font-semibold", ACCESS[f.access][1])}>{ACCESS[f.access][0]}</span>
            <span className="text-[12px] text-mute">{f.kind} · {f.source}</span>
          </div>
          <div className="mt-1 font-semibold">{f.readUrl ? <a className="hover:underline" href={f.readUrl} target="_blank" rel="noreferrer">{f.title}</a> : f.title}</div>
          <div className="text-[12.5px] text-mute">{[f.authors.slice(0, 3).join(", "), f.year, f.isbn && `ISBN ${f.isbn}`, f.doi && `DOI ${f.doi}`].filter(Boolean).join(" · ")}</div>
          {f.snippet && <p className="mt-1.5 rounded-md bg-bg p-2 font-serif text-[14px] leading-relaxed" data-snippet>“<Marked text={f.snippet} q={res.q} />”</p>}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {f.downloads.map((d) => <a key={d.url} href={d.url} target="_blank" rel="noreferrer" data-download
              className="inline-flex items-center gap-1 rounded-lg border border-low/50 px-2.5 py-1 text-[12.5px] font-medium text-low hover:bg-low/10"><FileDown size={14} />Download {d.label}</a>)}
            {f.get && <Button size="sm" onClick={() => read(f)} data-read><BookOpenText size={14} />Read here</Button>}
            {f.get && onAdd && <Button size="sm" onClick={() => add(f)} disabled={busy || added.has(f.key)} data-add>
              <LibIcon size={14} />{added.has(f.key) ? "In My library" : "Add to My library"}</Button>}
            {f.readUrl && <a className="inline-flex items-center gap-1 text-[12.5px] text-accent underline" href={f.readUrl} target="_blank" rel="noreferrer"><ExternalLink size={12} />
              {f.access === "snippet" ? "Read more of this text" : f.access === "free" ? "Read online" : "Details"}</a>}
          </div>
          {f.access !== "free" && <div className="mt-2"><CopyLinks meta={metaOf(f)} /></div>}
        </li>)}
      </ol>
    </>}

    {reader && <Dialog open wide onOpenChange={(o) => !o && setReader(null)} title={reader.f.title} description={[reader.f.authors.slice(0, 2).join(", "), reader.f.year, reader.f.source].filter(Boolean).join(" · ")}>
      <div className="grid gap-3 text-[13.5px]" id="reader">
        {!reader.text && !reader.error && <p className="flex items-center gap-1.5 text-mute"><Loader2 size={14} className="animate-spin" />Loading the full text…</p>}
        {reader.error && <p className="text-high">{reader.error}</p>}
        {reader.text && <>
          {(() => { const ps = passages(reader.text, res?.q ?? ""); return ps.length > 0 && <div>
            <h3 className="font-semibold">Where your search appears</h3>
            <ul className="mt-1 grid gap-1.5">{ps.map((p, i) => <li key={i} className="rounded-md bg-soft p-2 font-serif text-[14px]"><Marked text={p} q={res?.q ?? ""} /></li>)}</ul>
          </div>; })()}
          <div>
            <h3 className="font-semibold">Full text ({reader.text.split(/\s+/).length.toLocaleString()} words)</h3>
            <div className="mt-1 max-h-[45vh] overflow-auto rounded-md border border-line bg-bg p-3 font-serif text-[14px] leading-relaxed whitespace-pre-wrap" data-fulltext>
              {reader.text.slice(0, 60_000)}{reader.text.length > 60_000 && "\n\n… Download the file to read the rest."}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">{reader.f.downloads.map((d) => <a key={d.url} href={d.url} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-low/50 px-2.5 py-1 text-[12.5px] font-medium text-low hover:bg-low/10"><FileDown size={14} />Download {d.label}</a>)}</div>
        </>}
      </div>
    </Dialog>}
  </>;

  if (compact) return <div>{body}</div>;
  return (
    <div className="mx-auto grid max-w-[1180px] grid-cols-[minmax(0,1fr)] gap-4 px-4 pt-7 pb-12" id="findBook">
      <div>
        <h1 className="text-[clamp(23px,4vw,30px)] font-bold leading-tight tracking-tight">Find a book or paper</h1>
        <p className="mt-1 max-w-3xl text-[15px] text-mute">Search by title, author, words you remember from the text, a citation, an ISBN or a DOI. Free, legal copies can be downloaded,
          read here or added to My library. For books that aren&apos;t free you see the matching text and where to read, borrow or buy them.</p>
      </div>
      <Card>{body}</Card>
    </div>
  );
}
