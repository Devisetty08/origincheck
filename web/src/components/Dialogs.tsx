"use client";
import { useMemo, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import type { CiteMeta, Source } from "@/lib/similarity";
import { closeness, LEVEL_LABEL } from "@/lib/closeness";
import { type Style, inText, reference, segText } from "@/lib/citations";
import { DOI_RE } from "@/lib/extract";
import { lookupDoi } from "@/lib/importer";
import { Button, Dialog, cx, inputCls } from "./ui";

const LEVEL_STYLE = { "too-close": "bg-high", borderline: "bg-mid", original: "bg-low" } as const;

/** Rewrite editor (Req 2.2, 3): the source is hidden while the user writes; the meter gives advice, never text. */
export function ParaphraseDialog({ open, onClose, sourceName, original, sourcePassage, cite, onSave }:
  { open: boolean; onClose: () => void; sourceName: string; original: string; sourcePassage: string; cite: string; onSave: (mine: string) => void }) {
  const [mine, setMine] = useState("");
  const [show, setShow] = useState(false);
  const m = useMemo(() => closeness(mine, sourcePassage), [mine, sourcePassage]);
  const pct = m.level === "too-close" ? 100 : m.level === "borderline" ? 60 : m.level === "original" ? 25 : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} wide title="Rewrite in my own words"
      description={`Write the idea from ${sourceName} in your own words. The source wording is hidden so you aren't editing its sentences.`}>
      <div className="grid gap-3">
        <div className="rounded-lg bg-soft p-3 text-[13.5px]">
          <div className="flex items-center gap-2">
            <b className="flex-1">Source passage</b>
            <Button size="sm" variant="ghost" onClick={() => setShow(!show)} aria-expanded={show} id="revealSrc">{show ? <EyeOff size={14} /> : <Eye size={14} />}{show ? "Hide source" : "Show source"}</Button>
          </div>
          {show ? <p className="mt-1.5 font-serif text-[14.5px]">{sourcePassage}</p>
            : <p className="mt-1 text-mute">Hidden. Re-read the source if you need to, then close it and write from memory and understanding. ({original.split(/\s+/).length} words in your current text)</p>}
        </div>
        <label className="grid gap-1 text-sm font-medium">Your version
          <textarea className={cx(inputCls, "min-h-36 font-serif text-[15px]")} value={mine} onChange={(e) => setMine(e.target.value)} id="paraText"
            placeholder="Start with your own point, then use the source's idea as evidence…" autoFocus />
        </label>
        <div aria-live="polite" id="meter">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold">Closeness:</span>
            <span className={cx("rounded-full px-2 py-0.5 text-xs font-bold text-white", m.level ? LEVEL_STYLE[m.level] : "bg-mute")}>{m.level ? LEVEL_LABEL[m.level] : "Start writing"}</span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-soft" aria-hidden>
            <i className={cx("block h-full rounded-full transition-all", m.level ? LEVEL_STYLE[m.level] : "")} style={{ width: `${pct}%` }} />
          </div>
          {m.level && <ul className="mt-2 grid gap-0.5 text-[13px]">
            {m.reasons.map((r) => <li key={r}>• {r}</li>)}
            {m.tips.map((t) => <li key={t} className="text-mute">→ {t}</li>)}
          </ul>}
        </div>
        <p className="text-[13px] text-mute">The citation <b className="text-ink">{cite}</b> will be added to your text.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!m.level} onClick={() => onSave(mine)} id="paraSave">Replace passage</Button>
        </div>
      </div>
    </Dialog>
  );
}

const authorsToText = (a: CiteMeta["authors"]) => a.map((x) => [x.family, x.given].filter(Boolean).join(", ")).join("; ");
const textToAuthors = (s: string): CiteMeta["authors"] =>
  s.split(";").map((x) => x.trim()).filter(Boolean).map((x) => { const [family, given] = x.split(/\s*,\s*/); return { family, given: given || undefined }; });

/** Citation details for one source (Req 4.1), with DOI lookup through Crossref when internet features are on. */
export function CitationDialog({ open, onClose, source, initial, style, internet, onSave }:
  { open: boolean; onClose: () => void; source: Source; initial?: CiteMeta; style: Style; internet: boolean; onSave: (m: CiteMeta) => void }) {
  const foundDoi = source.text.match(DOI_RE)?.[0] ?? "";
  const [m, setM] = useState<CiteMeta>(initial ?? { authors: [], title: source.name.replace(/\.[^.]+$/, ""), doi: foundDoi || undefined });
  const [authors, setAuthors] = useState(authorsToText(m.authors));
  const [msg, setMsg] = useState("");
  const set = (k: keyof CiteMeta, v: string) => setM({ ...m, [k]: v || undefined });
  const full: CiteMeta = { ...m, authors: textToAuthors(authors), title: m.title ?? "" };

  const lookup = async () => {
    if (!m.doi) return;
    setMsg("Looking up…");
    try {
      const got = await lookupDoi(m.doi);
      setM({ ...got, accessed: m.accessed, url: m.url ?? got.url });
      setAuthors(authorsToText(got.authors));
      setMsg("Filled in from Crossref. Check the details.");
    } catch (e) { setMsg(`Lookup failed: ${(e as Error).message}`); }
  };
  const field = (k: keyof CiteMeta, label: string, ph = "", type = "text") => (
    <label className="grid gap-1 text-sm">{label}
      <input className={inputCls} type={type} value={(m[k] as string) ?? ""} placeholder={ph} onChange={(e) => set(k, e.target.value)} id={`cite-${k}`} />
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="Citation details" description={source.name}>
      <form className="grid gap-2.5" onSubmit={(e) => { e.preventDefault(); if (full.title.trim()) onSave(full); }}>
        <label className="grid gap-1 text-sm">Author(s)
          <input className={inputCls} value={authors} onChange={(e) => setAuthors(e.target.value)} placeholder="Family, Given; Family, Given" id="cite-authors" />
          <span className="text-[12px] text-mute">Separate authors with “;”. For an organisation, write its name only.</span>
        </label>
        {field("title", "Title")}
        <div className="grid grid-cols-2 gap-2.5">{field("year", "Year", "2024")}{field("container", "Journal, website or book series")}</div>
        <div className="grid grid-cols-3 gap-2.5">{field("volume", "Volume")}{field("issue", "Issue")}{field("pages", "Pages", "45–67")}</div>
        {field("publisher", "Publisher")}
        <div className="flex items-end gap-2">
          <div className="flex-1">{field("doi", "DOI", "10.xxxx/…")}</div>
          {internet && <Button type="button" onClick={lookup} disabled={!m.doi}>Look up</Button>}
        </div>
        
        <div className="grid grid-cols-[1fr_auto] gap-2.5">{field("url", "URL", "https://…", "url")}{field("accessed", "Accessed", "", "date")}</div>
        {msg && <p className="text-[13px] text-mute" role="status">{msg}</p>}
        {full.title.trim() && <div className="rounded-lg bg-soft p-2.5 text-[13px]">
          <div className="text-mute">Preview · in text: <b className="text-ink">{inText(full, style)}</b></div>
          <div className="mt-1 font-serif">{segText(reference(full, style))}</div>
        </div>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" disabled={!full.title.trim()} id="citeSave">Save details</Button>
        </div>
      </form>
    </Dialog>
  );
}
