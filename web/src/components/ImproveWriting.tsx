"use client";
// "Improve my writing": sends one selected passage (never the whole document) to the server's AI provider
// and shows the revision as a word diff. Each change is accepted or rejected on its own.
import { useState } from "react";
import { diffWords } from "diff";
import { Sparkles } from "lucide-react";
import { Button, Card, cx } from "./ui";

type Goal = "clearer" | "shorter" | "formal" | "casual" | "plain" | "nofiller";
const GOALS: { id: Goal; label: string }[] = [
  { id: "clearer", label: "Clearer" }, { id: "shorter", label: "Shorter" }, { id: "formal", label: "More formal" },
  { id: "casual", label: "More casual" }, { id: "plain", label: "Plain language" }, { id: "nofiller", label: "Cut filler" },
];
type Part = { keep: string } | { del: string; add: string; on: boolean };
const PROVIDER = { anthropic: "Anthropic (Claude)", ollama: "the local model" } as const;

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
  picked: { s: number; e: number } | null; // the passage chosen on the Rewrite page
  provider: "anthropic" | "ollama" | null;
  model?: string;
  setupNote?: string; // why Rewrite isn't available yet, from the server
  flagged: [number, number][]; // char ranges matched by the similarity check
  confirmPrivacy: (services: string[]) => Promise<boolean>;
  onApply: (start: number, end: number, replacement: string) => void;
  onSetup: () => void; // opens Settings when no provider is configured
}

export default function ImproveWriting(p: Props) {
  const [goal, setGoal] = useState<Goal>("clearer");
  const [sel, setSel] = useState<{ s: number; e: number } | null>(null);
  const [parts, setParts] = useState<Part[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  if (!p.provider) return (
    <Card className="no-print text-[13.5px]" id="improve" aria-label="Rewrite with AI">
      <h3 className="flex items-center gap-1.5 font-semibold"><Sparkles size={15} />Rewrite with AI</h3>
      <p className="mt-1 text-mute" id="improveOff">{p.setupNote ?? "Not set up yet."} Rewrite uses a free model that runs on your own computer
        (Qwen2.5 7B through Ollama) — nothing is sent anywhere. You can switch to Anthropic&apos;s Claude in Settings instead.</p>
      <Button size="sm" className="mt-2 w-full" onClick={p.onSetup} id="improveSetup">Open Settings</Button>
    </Card>
  );

  const pk = p.picked;
  const original = pk ? p.text.slice(pk.s, pk.e) : "";
  const locked = !!pk && p.flagged.some(([a, b]) => a < pk.e && b > pk.s);
  const showParts = parts && sel && pk && sel.s === pk.s && sel.e === pk.e; // a new pick hides the old suggestion

  const run = async () => {
    setParts(null); setMsg("");
    if (!pk || !original.trim()) return setMsg("Click a paragraph on the left first.");
    if (original.length > 4000) return setMsg("That passage is too long. Select up to 4,000 characters.");
    if (locked) return setMsg("This passage matches a source. Quote and cite it, or rewrite it in your own words — AI rewriting is off for it.");
    if (p.provider === "anthropic" && !(await p.confirmPrivacy([PROVIDER.anthropic]))) return; // the local model sends nothing
    setBusy(true); setSel(pk);
    try {
      const r = await fetch("/api/improve", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: original, goal }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setMsg(j.error ?? `The revision failed (${r.status}).`);
      const next = toParts(original, j.revised);
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
  const setAll = (on: boolean) => setParts((ps) => ps!.map((x) => ("del" in x ? { ...x, on } : x)));
  const changes = parts?.filter((x) => "del" in x) ?? [];

  return (
    <Card className="no-print text-[13.5px]" id="improve" aria-label="Rewrite with AI">
      <h3 className="flex items-center gap-1.5 font-semibold"><Sparkles size={15} />Rewrite with AI</h3>
      <div className="mt-2 flex flex-wrap gap-1" role="radiogroup" aria-label="Mode">
        {GOALS.map((g) => <button key={g.id} role="radio" aria-checked={goal === g.id} onClick={() => setGoal(g.id)} data-goal={g.id}
          className={cx("cursor-pointer rounded-full border px-3 py-1 text-[12.5px] font-medium", goal === g.id ? "border-accent bg-accent text-accent-ink" : "border-line hover:border-accent")}>{g.label}</button>)}
      </div>

      <div className="mt-3 text-[12px] font-semibold uppercase tracking-wide text-mute">Original</div>
      <div className={cx("mt-1 max-h-48 overflow-auto rounded-lg border p-2.5 font-serif text-[14.5px] leading-[1.7] whitespace-pre-wrap", locked ? "border-close/50 bg-close/5" : "border-line bg-bg")} id="improveOriginal">
        {original || <span className="font-sans text-[13px] text-mute">Click a paragraph on the left, or select part of one.</span>}
      </div>
      {locked && <p className="mt-1 text-[12px] text-close">Matches a source — rewrite this yourself in the plagiarism check.</p>}
      <Button variant="primary" className="mt-2 w-full" onClick={run} disabled={busy || !pk || locked} id="improveRun">
        <Sparkles size={14} />{busy ? "Rewriting…" : "Rewrite"}</Button>
      {msg && <p className="mt-2 text-[12.5px]" role="status" id="improveMsg">{msg}</p>}

      {showParts && <div className="mt-3" id="improveDiff">
        <div className="flex items-center justify-between">
          <span className="text-[12px] font-semibold uppercase tracking-wide text-mute">Suggestion</span>
          <span className="flex gap-2 text-[12px]">
            <button className="cursor-pointer text-accent hover:underline" onClick={() => setAll(true)}>Accept all</button>
            <button className="cursor-pointer text-accent hover:underline" onClick={() => setAll(false)}>Reject all</button>
          </span>
        </div>
        <p className="mt-1 rounded-lg border border-line bg-bg p-2.5 font-serif text-[14.5px] leading-[1.8] whitespace-pre-wrap">
          {parts.map((x, i) => "keep" in x ? <span key={i}>{x.keep}</span> : (
            <span key={i} role="button" tabIndex={0} onClick={() => toggle(i)} data-change={i} aria-pressed={x.on}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(i); } }}
              title={x.on ? "Kept — click to undo this change" : "Undone — click to keep this change"} className="cursor-pointer rounded hover:bg-soft">
              {x.del && <del className={x.on ? "text-high" : "no-underline"}>{x.del}</del>}
              {x.add && <ins className={x.on ? "text-low no-underline bg-low/10" : "text-mute line-through opacity-50"}>{x.add}</ins>}
            </span>))}
        </p>
        <p className="mt-1 text-[12px] text-mute">{changes.filter((x) => "on" in x && x.on).length} of {changes.length} changes kept. Click any change to keep or undo it.</p>
        <p className="mt-1 text-[12px] text-mid" id="improveCheckFacts">Check each change: AI models, especially small local ones, sometimes alter facts such as numbers, durations or names.</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="primary" onClick={apply} id="improveApply">Use in my document</Button>
          <Button size="sm" onClick={() => setParts(null)} id="improveDiscard">Discard</Button>
        </div>
      </div>}
      <p className="mt-3 text-[11.5px] text-mute">{p.provider === "ollama"
        ? `Runs on this computer (${p.model ?? "local model"} via Ollama): your text stays here.`
        : "Only the chosen passage is sent to Anthropic (Claude)."} Changes you use mark your document as AI-assisted in exports and in its writing history.</p>
    </Card>
  );
}
