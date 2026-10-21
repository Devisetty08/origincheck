"use client";
// "Improve my writing": sends one selected passage (never the whole document) to the server's AI provider
// and shows the revision as a word diff. Each change is accepted or rejected on its own.
import { useState } from "react";
import { diffWords } from "diff";
import { Sparkles } from "lucide-react";
import { Button, Card, cx } from "./ui";

type Goal = "clarity" | "concise" | "grammar" | "formal";
const GOALS: { id: Goal; label: string }[] = [
  { id: "clarity", label: "Clarity" }, { id: "concise", label: "Concise" }, { id: "grammar", label: "Grammar only" }, { id: "formal", label: "Academic tone" },
];
type Part = { keep: string } | { del: string; add: string; on: boolean };
const PROVIDER = { anthropic: "Anthropic (Claude)", ollama: "your Ollama server" } as const;

/** Word diff grouped into changes: each run of removed/added words between unchanged text is one change. */
export function toParts(a: string, b: string): Part[] {
  const out: Part[] = [];
  for (const c of diffWords(a, b)) {
    const last = out[out.length - 1];
    if (!c.added && !c.removed) { out.push({ keep: c.value }); continue; }
    const ch = last && "del" in last ? last : (out.push({ del: "", add: "", on: true }), out[out.length - 1] as Extract<Part, { del: string }>);
    if (c.added) ch.add += c.value; else ch.del += c.value;
  }
  return out;
}
export const joinParts = (parts: Part[]) => parts.map((p) => ("keep" in p ? p.keep : p.on ? p.add : p.del)).join("");

interface Props {
  text: string;
  provider: "anthropic" | "ollama" | null;
  flagged: [number, number][]; // char ranges matched by the similarity check
  confirmPrivacy: (services: string[]) => Promise<boolean>;
  onApply: (start: number, end: number, replacement: string) => void;
}

export default function ImproveWriting(p: Props) {
  const [goal, setGoal] = useState<Goal>("clarity");
  const [sel, setSel] = useState<{ s: number; e: number } | null>(null);
  const [parts, setParts] = useState<Part[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!p.provider) return null;

  const run = async () => {
    setParts(null); setMsg("");
    const picked = window.getSelection()?.toString().trim() ?? "";
    // ponytail: first occurrence of the selected text; a repeated passage resolves to its first copy.
    const s = picked ? p.text.indexOf(picked) : -1;
    if (s < 0) return setMsg("Select a passage in your document first (up to about 600 words).");
    const e = s + picked.length;
    if (picked.length > 4000) return setMsg("That selection is too long. Select up to 4,000 characters.");
    if (p.flagged.some(([a, b]) => a < e && b > s))
      return setMsg("This passage matches a source. Quote and cite it, or rewrite it in your own words — AI revision is off for flagged passages.");
    if (!(await p.confirmPrivacy([PROVIDER[p.provider!]]))) return;
    setBusy(true); setSel({ s, e });
    try {
      const r = await fetch("/api/improve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: picked, goal }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setMsg(j.error ?? `The revision failed (${r.status}).`);
      const next = toParts(picked, j.revised);
      if (!next.some((x) => "del" in x)) return setMsg("No changes suggested for this passage.");
      setParts(next);
    } catch { setMsg("Couldn't reach the server."); } finally { setBusy(false); }
  };

  const apply = () => {
    if (!parts || !sel) return;
    p.onApply(sel.s, sel.e, joinParts(parts));
    setParts(null); setSel(null); setMsg("Applied. Your document is now marked as AI-assisted in exports.");
  };
  const toggle = (i: number) => setParts((ps) => ps!.map((x, j) => (j === i && "del" in x ? { ...x, on: !x.on } : x)));
  const changes = parts?.filter((x) => "del" in x) ?? [];

  return (
    <Card className="no-print text-[13.5px]" id="improve" aria-label="Improve my writing">
      <h3 className="flex items-center gap-1.5 font-semibold"><Sparkles size={15} />Improve my writing</h3>
      <p className="mt-1 text-[12.5px] text-mute">Select a passage in your document, choose a goal, and review each suggested change.
        Only the selected passage is sent to {PROVIDER[p.provider]}. Edits you accept mark the document as AI-assisted.</p>
      <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Goal">
        {GOALS.map((g) => <button key={g.id} role="radio" aria-checked={goal === g.id} onClick={() => setGoal(g.id)} data-goal={g.id}
          className={cx("cursor-pointer rounded-md border px-2 py-0.5 text-[12.5px]", goal === g.id ? "border-accent bg-accent text-accent-ink" : "border-line")}>{g.label}</button>)}
      </div>
      <Button size="sm" className="mt-2 w-full" onMouseDown={(e) => e.preventDefault()} onClick={run} disabled={busy} id="improveRun">
        <Sparkles size={14} />{busy ? "Revising…" : "Revise selected passage"}</Button>
      {msg && <p className="mt-2 text-[12.5px]" role="status" id="improveMsg">{msg}</p>}
      {parts && <div className="mt-3" id="improveDiff">
        <p className="rounded-lg bg-bg p-2 font-serif text-[14.5px] leading-[1.8] whitespace-pre-wrap">
          {parts.map((x, i) => "keep" in x ? <span key={i}>{x.keep}</span> : (
            <button key={i} onClick={() => toggle(i)} data-change={i} aria-pressed={x.on}
              title={x.on ? "Accepted — click to keep your original" : "Rejected — click to accept the change"} className="cursor-pointer">
              {x.del && <del className={x.on ? "text-high" : "no-underline"}>{x.del}</del>}
              {x.add && <ins className={x.on ? "text-low" : "text-mute line-through opacity-50"}>{x.add}</ins>}
            </button>))}
        </p>
        <p className="mt-1 text-[12px] text-mute">{changes.filter((x) => "on" in x && x.on).length} of {changes.length} changes accepted. Click a change to accept or reject it.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="primary" onClick={apply} id="improveApply">Apply accepted</Button>
          <Button size="sm" onClick={() => setParts(null)} id="improveDiscard">Discard</Button>
        </div>
      </div>}
    </Card>
  );
}
