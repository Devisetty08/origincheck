"use client";
import { useRef } from "react";
import { motion } from "motion/react";
import { Bot, FileSearch, SpellCheck, Upload } from "lucide-react";
import { SUPPORTED } from "@/lib/extract";
import { band } from "@/lib/exporters";
import { AI_CAVEAT, type AiResult } from "@/lib/aiScore";
import type { Issue, Severity } from "@/lib/grammar";
import { plural } from "@/lib/words";
import { Button, Ring, type Status, cx } from "./ui";

export type Tab = "similarity" | "grammar" | "ai" | "rewrite";

export const grammarBand = (s: number) =>
  s >= 90 ? { label: "Clean", color: "var(--low)" } : s >= 75 ? { label: "A few issues", color: "var(--mid)" }
  : s >= 60 ? { label: "Needs a pass", color: "var(--mid2)" } : { label: "Needs work", color: "var(--high)" };

interface Props {
  sim: { status: Status; pct?: number; index?: number; sources: number; note?: string };
  grammar: { status: Status; pct?: number; score?: number; issues: Issue[] };
  ai: { status: Status; pct?: number; stage?: string; mb?: number; result: AiResult | null; stale?: boolean };
  onOpen: (t: Tab) => void;
  onAddSources: (files: File[]) => void;
  active?: Tab;
}

export function summaryLine(p: Pick<Props, "sim" | "grammar" | "ai">) {
  const parts = [
    p.sim.index != null ? `${p.sim.index}% similarity` : p.sim.status === "needs-sources" ? "similarity: add sources" : "similarity: checking",
    p.grammar.status === "done" ? plural(p.grammar.issues.length, "grammar suggestion") : "grammar: checking",
    p.ai.status === "off" ? "AI indicator: off" : p.ai.status === "short" ? "AI indicator: not enough text"
      : p.ai.result ? `AI indicator: ${p.ai.result.label}` : p.ai.status === "error" ? "AI indicator: failed" : "AI indicator: checking",
  ];
  return parts.join(" · ");
}

export default function Dashboard(p: Props) {
  const file = useRef<HTMLInputElement>(null);
  const counts = (sev: Severity) => p.grammar.issues.filter((i) => i.severity === sev).length;
  const sb = p.sim.index != null ? band(p.sim.index) : null;
  const gb = p.grammar.score != null ? grammarBand(p.grammar.score) : null;

  return (
    <section aria-label="Summary" className="grid gap-3">
      <div className="grid gap-3 md:grid-cols-3">
        <ScoreCard tab="similarity" active={p.active} onOpen={p.onOpen} icon={<FileSearch size={16} />} title="Plagiarism (similarity)" delay={0}>
          {p.sim.index != null && sb ? <>
            <Ring value={p.sim.index} display={`${p.sim.index}%`} color={sb.color} label={`Similarity index ${p.sim.index}%`} id="simRing" />
            <div className="min-w-0"><b style={{ color: sb.color }}>{sb.label}</b><div className="text-[13px] text-mute">{plural(p.sim.sources, "source")} compared</div></div>
          </> : p.sim.status === "needs-sources" ? <div className="grid gap-2">
            <p className="text-sm">Add sources to run this check.</p>
            <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); file.current?.click(); }} id="addSourcesBtn"><Upload size={14} />Add sources</Button>
            <input ref={file} type="file" multiple hidden accept={SUPPORTED} data-testid="cardSrc-input" onClick={(e) => e.stopPropagation()}
              onChange={(e) => { p.onAddSources([...(e.target.files ?? [])]); e.target.value = ""; }} />
          </div> : <Pending status={p.sim.status} pct={p.sim.pct} note={p.sim.note} />}
        </ScoreCard>

        <ScoreCard tab="grammar" active={p.active} onOpen={p.onOpen} icon={<SpellCheck size={16} />} title="Grammar" delay={0.05}>
          {p.grammar.score != null && gb ? <>
            <Ring value={p.grammar.score} color={gb.color} label={`Writing score ${p.grammar.score} out of 100`} id="grammarRing" />
            <div className="min-w-0 text-[13px]">
              <b className="text-[15px]" style={{ color: gb.color }}>{gb.label}</b>
              <div><span className="text-high">{counts("error")} errors</span> · <span className="text-mid">{counts("warning")} warnings</span> · <span className="text-accent">{counts("style")} style</span></div>
            </div>
          </> : <Pending status={p.grammar.status} pct={p.grammar.pct} />}
        </ScoreCard>

        <ScoreCard tab="ai" active={p.active} onOpen={p.onOpen} icon={<Bot size={16} />} title="AI indicator" delay={0.1}>
          {p.ai.result ? <>
            <Ring value={p.ai.result.score} color="var(--close)" label={`AI indicator ${p.ai.result.score} out of 100, ${p.ai.result.label}`} id="aiRing" />
            <div className="min-w-0 text-[13px]">
              <b className="text-[15px] text-close">{p.ai.result.label}</b>
              <div className="text-mute">Indicator only — not proof.{p.ai.stale ? " Text changed since." : ""}</div>
            </div>
          </> : p.ai.status === "short" ? <p className="text-sm">Not enough text to estimate (needs 150 words).</p>
            : p.ai.status === "off" ? <p className="text-sm text-mute">Turned off in Settings.</p>
            : <Pending status={p.ai.status} pct={p.ai.pct} note={p.ai.stage === "download" ? `Downloading models${p.ai.mb ? ` (${p.ai.mb} MB, first time only)` : ""}` : undefined} />}
        </ScoreCard>
      </div>
      <p className="text-sm font-medium" id="summaryLine" role="status">{summaryLine(p)}</p>
      {p.ai.result && <p className="sr-only">{AI_CAVEAT}</p>}
    </section>
  );
}

export interface Step { id: string; icon: React.ReactNode; title: string; text: string; action: string; onClick: () => void; tone?: "high" | "mid" | "low" | "mute" }

/** "What to do next": one line per check with the single action that helps most, Turnitin/Grammarly style. */
export function NextSteps({ steps }: { steps: Step[] }) {
  return (
    <section className="rounded-xl border border-line bg-panel p-4 sm:p-5" aria-labelledby="nextH" id="nextSteps">
      <h2 id="nextH" className="font-semibold">What to do next</h2>
      <ol className="mt-2 grid gap-2">
        {steps.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-line px-3 py-2.5" data-step={s.id}>
            <span className={cx("grid size-9 shrink-0 place-items-center rounded-lg", s.tone === "high" ? "bg-high/12 text-high" : s.tone === "mid" ? "bg-mid/12 text-mid"
              : s.tone === "low" ? "bg-low/12 text-low" : "bg-soft text-mute")} aria-hidden>{s.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold">{s.title}</div>
              <div className="text-[13px] text-mute">{s.text}</div>
            </div>
            <Button size="sm" variant="primary" onClick={s.onClick}>{s.action}</Button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ScoreCard({ tab, active, onOpen, icon, title, children, delay }:
  { tab: Tab; active?: Tab; onOpen: (t: Tab) => void; icon: React.ReactNode; title: string; children: React.ReactNode; delay: number }) {
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, delay }}
      role="button" tabIndex={0} aria-label={`${title}: open details`} data-card={tab}
      onClick={() => onOpen(tab)} onKeyDown={(e) => { if (e.key === "Enter") onOpen(tab); }} onKeyUp={(e) => { if (e.key === " ") onOpen(tab); }}
      className={cx("cursor-pointer rounded-xl border bg-panel p-4 text-left transition hover:border-accent", active === tab ? "border-accent ring-1 ring-accent" : "border-line")}>
      <div className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold uppercase tracking-wide text-mute">{icon}{title}
        <span className="ml-auto text-[12px] font-medium normal-case tracking-normal text-accent">Details →</span></div>
      <div className="flex min-h-24 items-center gap-3">{children}</div>
    </motion.div>
  );
}

function Pending({ status, pct, note }: { status: Status; pct?: number; note?: string }) {
  return (
    <div className="w-full text-sm">
      <div className="text-mute">{status === "error" ? "Couldn't finish this check." : status === "queued" ? "Queued…" : note ?? "Checking…"}</div>
      {status === "running" && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct ?? 0} aria-label="Progress">
        <i className="block h-full rounded-full bg-accent transition-all" style={{ width: `${pct ?? 10}%` }} />
      </div>}
    </div>
  );
}
