"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { Popover } from "radix-ui";
import { ChevronLeft, ChevronRight, Download, Pencil, Check as CheckIcon, X } from "lucide-react";
import { CATEGORIES, type Category, type Issue } from "@/lib/grammar";
import { feedback } from "@/lib/writing";
import { plural } from "@/lib/words";
import { Button, Card, cx } from "./ui";

const SEV_STYLE: Record<Issue["severity"], string> = {
  error: "decoration-high decoration-wavy",
  warning: "decoration-mid decoration-solid",
  style: "decoration-accent decoration-dotted",
};
const SEV_LABEL = { error: "Error", warning: "Warning", style: "Style" } as const;
const CAT_LABEL: Record<Category, string> = { spelling: "Spelling", grammar: "Grammar", punctuation: "Punctuation", style: "Style", clarity: "Clarity" };

interface Props {
  text: string;
  issues: Issue[];
  busy: boolean;
  ltOn: boolean;
  ltNote?: string;
  onAccept: (i: Issue, s: Issue["suggestions"][number]) => void;
  onIgnore: (i: Issue) => void;
  onIgnoreRule: (rule: string) => void;
  onAcceptAllSpelling: () => void;
  onEditText: (t: string) => void;
  onDownload: (kind: "docx" | "txt") => void;
  onAddWord: (word: string) => void;
  englishOnly: boolean;
  korean: boolean;
  children?: React.ReactNode; // extra side cards (Improve my writing)
}

type Lookup = { synonyms: string[]; definitions: { partOfSpeech: string; definition: string }[]; definitionSource?: string;
  entity?: { label: string; description: string; url: string } };
const lookups = new Map<string, Promise<Lookup | null>>();
/** Synonyms (Datamuse), definitions (Free Dictionary or Wiktionary) and known names (Wikidata) through origincheck's server, cached. */
function lookupWord(w: string) {
  if (!lookups.has(w))
    lookups.set(w, fetch(`/api/words?w=${encodeURIComponent(w)}`).then((r) => (r.ok ? r.json() : null)).catch(() => null));
  return lookups.get(w)!;
}

function WordInfo({ word, onPick }: { word: string; onPick: (w: string) => void }) {
  const [info, setInfo] = useState<Lookup | null | undefined>(undefined);
  useEffect(() => { let live = true; lookupWord(word).then((x) => { if (live) setInfo(x); }); return () => { live = false; }; }, [word]);
  if (info === undefined) return <p className="mt-2 text-[12px] text-mute">Looking up “{word}”…</p>;
  if (!info || (!info.synonyms.length && !info.definitions.length && !info.entity)) return null;
  return (
    <div className="mt-2 rounded-lg bg-bg p-2 text-[12.5px]" id="wordInfo">
      {info.entity && <p className="mb-1" id="wordEntity"><b>Known name:</b> {info.entity.label} — {info.entity.description}{" "}
        <a className="text-accent hover:underline" href={info.entity.url} target="_blank" rel="noreferrer">Wikidata</a>. If you meant it, add it to your dictionary.</p>}
      {info.definitions.slice(0, 2).map((d, i) => <p key={i}><i className="text-mute">{d.partOfSpeech}</i> {d.definition}</p>)}
      {info.definitionSource && <p className="text-[11px] text-mute">Definitions: {info.definitionSource}</p>}
      {info.synonyms.length > 0 && <div className="mt-1 flex flex-wrap items-center gap-1">
        <span className="text-mute">Synonyms:</span>
        {info.synonyms.slice(0, 6).map((s) => <button key={s} className="cursor-pointer rounded bg-soft px-1.5 py-0.5 hover:text-accent" onClick={() => onPick(s)}>{s}</button>)}
      </div>}
    </div>
  );
}

export default function GrammarTab(p: Props) {
  const [cat, setCat] = useState<Category | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);
  const anchor = useRef<HTMLElement | null>(null);

  const shown = useMemo(() => (cat === "all" ? p.issues : p.issues.filter((i) => i.category === cat)), [p.issues, cat]);
  const current = p.issues.find((i) => i.id === open);
  const spellingFixes = p.issues.filter((i) => i.category === "spelling" && i.severity !== "style" && i.suggestions.length).length;

  const focusIssue = (i: Issue | undefined) => {
    if (!i) return;
    const el = docRef.current?.querySelector<HTMLElement>(`[data-issue="${CSS.escape(i.id)}"]`);
    if (!el) return;
    el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    anchor.current = el;
    setOpen(i.id);
  };
  const step = (d: 1 | -1) => {
    if (!shown.length) return;
    const k = shown.findIndex((i) => i.id === open);
    focusIssue(shown[k < 0 ? (d > 0 ? 0 : shown.length - 1) : (k + d + shown.length) % shown.length]);
  };

  // the document, cut into plain text and underlined issues
  const body = useMemo(() => {
    const out: React.ReactNode[] = [];
    let pos = 0;
    for (const i of p.issues) {
      if (i.start < pos) continue; // overlapping issue: shown in the list, not underlined twice
      out.push(p.text.slice(pos, i.start));
      out.push(<span key={i.id} data-issue={i.id} tabIndex={0} role="button" aria-label={`${SEV_LABEL[i.severity]}, ${CAT_LABEL[i.category]}: ${i.message}`}
        className={cx("cursor-pointer underline decoration-2 underline-offset-4", SEV_STYLE[i.severity], open === i.id && "bg-soft", cat !== "all" && i.category !== cat && "opacity-40 decoration-1")}
        onClick={(e) => { anchor.current = e.currentTarget; setOpen(i.id); }}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); anchor.current = e.currentTarget; setOpen(i.id); } }}>
        {p.text.slice(i.start, i.end) || "␣"}</span>);
      pos = i.end;
    }
    out.push(p.text.slice(pos));
    return out;
  }, [p.text, p.issues, open, cat]);

  const fb = useMemo(() => feedback(p.text), [p.text]);
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, p.issues.filter((i) => i.category === c).length])) as Record<Category, number>;

  return (
    <div className="grid grid-cols-1 items-start gap-5 min-[1000px]:grid-cols-[minmax(0,1fr)_340px]">
      <article className="print-plain min-w-0 rounded-xl border border-line bg-panel px-4 py-5 sm:px-8">
        <div className="no-print mb-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant={editing ? "primary" : "outline"} onClick={() => setEditing(!editing)} aria-pressed={editing} id="editText"><Pencil size={14} />{editing ? "Done editing" : "Edit text"}</Button>
          <Button size="sm" onClick={() => p.onDownload("docx")} id="dlDocx"><Download size={14} />Corrected .docx</Button>
          <Button size="sm" onClick={() => p.onDownload("txt")} id="dlTxt"><Download size={14} />.txt</Button>
          {p.busy && <span className="text-[13px] text-mute" role="status">Checking…</span>}
        </div>
        <p className="no-print mb-3 flex flex-wrap gap-3 text-[12.5px] text-mute" aria-hidden>
          <span><span className="underline decoration-high decoration-wavy decoration-2 underline-offset-4">wavy</span> error</span>
          <span><span className="underline decoration-mid decoration-2 underline-offset-4">solid</span> warning</span>
          <span><span className="underline decoration-accent decoration-dotted decoration-2 underline-offset-4">dotted</span> style</span>
        </p>
        {p.englishOnly && <p className="mb-3 rounded-lg bg-soft p-3 text-sm" role="status" id="englishOnly">
          <b>Grammar checking is English-only.</b> This text isn&apos;t mostly English, so Harper wasn&apos;t run.
          {p.korean && " For Korean, CopyKiller (under “Check externally” on the Plagiarism check page) and a Korean spell checker are better options."}
        </p>}
        {editing
          ? <EditBox text={p.text} onChange={p.onEditText} />
          : <div ref={docRef} id="gDoc" className="font-serif text-[16.5px] leading-[1.9] whitespace-pre-wrap wrap-anywhere">{body}</div>}
      </article>

      <aside className="grid min-w-0 gap-3.5 min-[1000px]:sticky min-[1000px]:top-[72px]" aria-label="Grammar issues">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">{p.issues.length ? plural(p.issues.length, "suggestion") : "All clear"}</h3>
            <div className="flex gap-1">
              <Button size="sm" aria-label="Previous issue" onClick={() => step(-1)} id="gPrev"><ChevronLeft size={16} /></Button>
              <Button size="sm" aria-label="Next issue" onClick={() => step(1)} id="gNext"><ChevronRight size={16} /></Button>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label="Issues by category">
            <CatChip label="All" n={p.issues.length} active={cat === "all"} onClick={() => setCat("all")} />
            {CATEGORIES.filter((c) => counts[c]).map((c) => <CatChip key={c} label={CAT_LABEL[c]} n={counts[c]} active={cat === c} onClick={() => setCat(c)} />)}
          </div>
          {spellingFixes > 0 && <Button size="sm" className="mt-3 w-full" onClick={p.onAcceptAllSpelling} id="acceptSpelling">
            <CheckIcon size={14} />Accept all spelling fixes ({spellingFixes})</Button>}
          <ul className="mt-3 grid max-h-[55vh] gap-2 overflow-auto pr-0.5" aria-label="Suggestions" id="gCards">
            {shown.map((i) => <SuggestionCard key={i.id} i={i} text={p.text} active={open === i.id} onOpen={() => focusIssue(i)}
              onAccept={(s) => p.onAccept(i, s)} onDismiss={() => p.onIgnore(i)} />)}
            {!shown.length && <li className="py-4 text-center text-sm text-mute">{p.busy ? "Checking…" : "No suggestions here."}</li>}
          </ul>
          <p className="mt-2 text-[12px] text-mute">Checked on your device by Harper{p.ltOn ? " and LanguageTool (online)" : ""}.{p.ltNote ? ` ${p.ltNote}` : ""}</p>
        </Card>
        <Card className="text-[13.5px]" aria-label="Readability">
          <h3 className="font-semibold">Readability</h3>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5">
            <dt className="text-mute">Flesch reading ease</dt><dd className="text-right font-semibold" id="flesch">{fb.flesch}</dd>
            <dt className="text-mute">Average sentence</dt><dd className="text-right font-semibold">{(fb.words / Math.max(1, fb.sentences)).toFixed(1)} words</dd>
            <dt className="text-mute">Sentences over 35 words</dt><dd className="text-right font-semibold">{fb.long.length}</dd>
            <dt className="text-mute">Passive voice</dt><dd className="text-right font-semibold">{fb.passive.length} ({fb.passivePct}%)</dd>
            <dt className="text-mute">Repeated words</dt><dd className="text-right font-semibold">{fb.repeated.length}</dd>
          </dl>
          <p className="mt-2 text-[12px] text-mute">{fb.fleschLabel}.{fb.overused.length ? ` Most used: ${fb.overused.slice(0, 4).map((w) => `${w.word} (${w.count})`).join(", ")}.` : ""}</p>
          {fb.long.length > 0 && <details className="mt-2"><summary className="cursor-pointer text-[13px] font-medium">Long sentences</summary>
            <ul className="mt-1 grid list-disc gap-1 pl-5 text-[12.5px]">{fb.long.map((l) => <li key={l.at}>{l.words} words: {l.text.split(/\s+/).slice(0, 14).join(" ")} …</li>)}</ul></details>}
        </Card>
        {p.children}
      </aside>

      <Popover.Root open={!!current} onOpenChange={(o) => !o && setOpen(null)}>
        <Popover.Anchor virtualRef={anchor as React.RefObject<HTMLElement>} />
        <Popover.Portal>
          {current && <Popover.Content side="bottom" align="start" sideOffset={6} collisionPadding={12}
            className="z-50 w-[min(340px,calc(100vw-24px))] rounded-xl border border-line bg-panel p-3.5 text-sm shadow-xl" id="issuePopover">
            <div className="flex items-start gap-2">
              <span className={cx("rounded px-1.5 py-0.5 text-[11px] font-bold uppercase text-white",
                current.severity === "error" ? "bg-high" : current.severity === "warning" ? "bg-mid" : "bg-accent")}>{SEV_LABEL[current.severity]}</span>
              <span className="text-[12px] text-mute">{CAT_LABEL[current.category]} · {current.rule}</span>
              <Popover.Close className="ml-auto grid size-6 place-items-center rounded hover:bg-soft cursor-pointer" aria-label="Close"><X size={14} /></Popover.Close>
            </div>
            <p className="mt-2">{current.message}</p>
            {current.suggestions.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5" aria-label="Suggestions">
              {current.suggestions.map((s, k) => <Button key={k} size="sm" variant="primary" data-accept={k}
                onClick={() => { p.onAccept(current, s); setOpen(null); }}>
                {s.kind === "remove" ? "Apply: remove" : s.kind === "insertAfter" ? `Apply: add “${s.text}”` : `Apply “${s.text || "∅"}”`}
              </Button>)}
            </div>}
            {/^[A-Za-z][A-Za-z0-9'-]{1,30}$/.test(p.text.slice(current.start, current.end)) &&
              <WordInfo word={p.text.slice(current.start, current.end)} onPick={(w) => { p.onAccept(current, { text: w, kind: "replace" }); setOpen(null); }} />}
            <div className="mt-2.5 flex flex-wrap gap-3 border-t border-line pt-2">
              <Button variant="link" onClick={() => { p.onIgnore(current); setOpen(null); }} id="dismissIssue">Dismiss</Button>
              <Button variant="link" onClick={() => { p.onIgnoreRule(current.rule); setOpen(null); }}>Ignore rule</Button>
              {current.category === "spelling" && <Button variant="link" id="addWord"
                onClick={() => { p.onAddWord(p.text.slice(current.start, current.end)); setOpen(null); }}>Add to dictionary</Button>}
            </div>
          </Popover.Content>}
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function CatChip({ label, n, active, onClick }: { label: string; n: number; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-pressed={active}
      className={cx("cursor-pointer rounded-full border px-2.5 py-0.5 text-[12.5px]", active ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-accent")}>
      {label} <b>{n}</b>
    </button>
  );
}

const SEV_BAR: Record<Issue["severity"], string> = { error: "border-l-high", warning: "border-l-mid", style: "border-l-accent" };

/** One suggestion as a card: what's wrong, the fix, and Accept / Dismiss without hunting for the underline. */
function SuggestionCard({ i, text, active, onOpen, onAccept, onDismiss }: {
  i: Issue; text: string; active: boolean; onOpen: () => void; onAccept: (s: Issue["suggestions"][number]) => void; onDismiss: () => void;
}) {
  const s = i.suggestions[0];
  const was = text.slice(i.start, i.end);
  return (
    <li className={cx("rounded-lg border border-l-4 bg-panel p-2.5 text-[13px]", SEV_BAR[i.severity], active ? "border-accent ring-1 ring-accent" : "border-line")} data-card-issue={i.id}>
      <button className="block w-full cursor-pointer text-left" onClick={onOpen}>
        <span className="text-[11.5px] font-semibold uppercase tracking-wide text-mute">{CAT_LABEL[i.category]}</span>
        {s && <span className="mt-0.5 block text-[14px]"><s className="text-mute">{was || "␣"}</s> → <b className="text-low">{s.kind === "remove" ? "(remove)" : s.text || "(remove)"}</b></span>}
        <span className="mt-0.5 block text-mute">{i.message}</span>
      </button>
      <span className="mt-1.5 flex gap-2">
        {s && <Button size="sm" variant="primary" onClick={() => onAccept(s)} data-card-accept>Accept</Button>}
        <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
      </span>
    </li>
  );
}

/** Free editing; changes are passed up after a pause so only changed paragraphs are re-checked. */
function EditBox({ text, onChange }: { text: string; onChange: (t: string) => void }) {
  const [value, setValue] = useState(text);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pending = useRef<string | null>(null);
  const latest = useRef(onChange);
  useEffect(() => { latest.current = onChange; });
  useEffect(() => () => { // closing the editor flushes an edit still waiting for its pause
    clearTimeout(timer.current);
    if (pending.current != null) latest.current(pending.current);
  }, []);
  return (
    <textarea aria-label="Document text" id="gEdit" value={value} spellCheck={false}
      className="min-h-[60vh] w-full rounded-lg border border-line bg-bg p-3 font-serif text-[16px] leading-[1.8]"
      onChange={(e) => {
        const v = e.target.value;
        setValue(v);
        pending.current = v;
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { pending.current = null; onChange(v); }, 600);
      }} />
  );
}
