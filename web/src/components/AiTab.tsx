"use client";
import { useMemo, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { AI_CAVEAT, type AiResult, type AiSignals, MIN_WORDS, WEIGHTS } from "@/lib/aiScore";
import { Button, Card, Ring, type Status, cx } from "./ui";

export interface AiState {
  status: Status;
  pct?: number;
  stage?: "download" | "analyze";
  mb?: number;
  result: AiResult | null;
  signals?: AiSignals;
  text?: string; // the text that was analysed
  words?: number;
  stale?: boolean;
  error?: string;
}

const SHADES = [0.06, 0.16, 0.28, 0.42, 0.58]; // purple intensity by fifths of the 0–100 sentence estimate

export function Caveat() {
  return (
    <p role="note" className="flex gap-2.5 rounded-xl border border-mid/40 bg-mid/10 p-3.5 text-[14px]" id="aiCaveat">
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-mid" aria-hidden />
      <span><b>An indicator, not a verdict.</b> {AI_CAVEAT}</span>
    </p>
  );
}

export default function AiTab({ s, available, onRerun, onEnable }: { s: AiState; available: boolean; onRerun: () => void; onEnable: () => void }) {
  const [numbers, setNumbers] = useState(false);
  const r = s.result;

  const heat = useMemo(() => {
    if (!r || !s.signals || !s.text) return null;
    const out: React.ReactNode[] = [];
    let pos = 0;
    s.signals.sentences.forEach((x, i) => {
      const score = r.sentenceScores[i];
      out.push(s.text!.slice(pos, x.start));
      const chunk = s.signals!.chunks.find((c) => x.start >= c.start && x.start < c.end);
      const tip = score == null ? "Not scored" : `Estimated likelihood ${score} · passage probability ${Math.round(100 * (chunk?.prob ?? 0))}%${x.ppl ? ` · perplexity ${Math.round(x.ppl)}` : ""}`;
      out.push(<span key={i} tabIndex={0} title={tip} aria-label={tip} data-score={score ?? ""}
        className="rounded-sm" style={{ background: score == null ? undefined : `color-mix(in srgb, var(--close) ${Math.round(100 * SHADES[Math.min(4, Math.floor(score / 20))])}%, transparent)` }}>
        {s.text!.slice(x.start, x.end)}
        {numbers && score != null && <sup className="ml-0.5 rounded bg-close px-1 text-[10px] font-bold text-white">{score}</sup>}
      </span>);
      pos = x.end;
    });
    out.push(s.text.slice(pos));
    return out;
  }, [r, s.signals, s.text, numbers]);

  return (
    <div className="grid gap-4">
      <Caveat />
      {s.status === "off" && (available
        ? <Card><p>The AI-likelihood signal is turned off in your settings.</p><Button size="sm" variant="primary" className="mt-2" onClick={onEnable}>Turn it on</Button></Card>
        : <Card><p id="aiOff">The AI-likelihood signal is off on this server. It is off by default (<code>ENABLE_AI_LIKELIHOOD=false</code>) because detectors are unreliable; the site owner can enable it.</p></Card>)}
      {s.status === "short" && <Card><p id="aiShort">Not enough text to estimate. The AI indicator needs at least {MIN_WORDS} words{s.words != null ? `; this document has ${s.words}` : ""}.</p></Card>}
      {s.status === "error" && <Card><p className="text-high">The AI check failed: {s.error}</p><Button size="sm" className="mt-2" onClick={onRerun}><RefreshCw size={14} />Try again</Button></Card>}
      {(s.status === "running" || s.status === "queued") && <Card>
        <p className="font-medium">{s.stage === "download" ? `Downloading the detection models${s.mb ? ` (${s.mb} MB)` : ""} — first time only, then cached in your browser.` : "Analysing the text on your device…"}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-soft" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={s.pct ?? 0} aria-label="AI check progress">
          <i className="block h-full rounded-full bg-close transition-all" style={{ width: `${s.pct ?? 5}%` }} />
        </div>
      </Card>}
      {r && <>
        {s.stale && <p className="flex flex-wrap items-center gap-2 rounded-lg bg-soft p-2.5 text-sm" role="status">The text has changed since this estimate.
          <Button size="sm" onClick={onRerun} id="aiRerun"><RefreshCw size={14} />Re-run</Button></p>}
        <div className="grid grid-cols-1 items-start gap-5 min-[1000px]:grid-cols-[minmax(0,1fr)_340px]">
          <article className="print-plain min-w-0 rounded-xl border border-line bg-panel px-4 py-5 sm:px-8">
            <div className="no-print mb-3 flex flex-wrap items-center gap-3 text-[12.5px] text-mute">
              <span>Sentence shading, lighter to darker:</span>
              <span className="flex overflow-hidden rounded" aria-hidden>{SHADES.map((a, i) =>
                <span key={i} className="px-2 py-0.5 text-ink" style={{ background: `color-mix(in srgb, var(--close) ${Math.round(100 * a)}%, transparent)` }}>{i * 20}–{i === 4 ? 100 : i * 20 + 19}</span>)}</span>
              <label className="ml-auto inline-flex items-center gap-1.5"><input type="checkbox" checked={numbers} onChange={(e) => setNumbers(e.target.checked)} className="accent-accent" />Show numbers</label>
            </div>
            <div className="font-serif text-[16.5px] leading-[1.9] whitespace-pre-wrap wrap-anywhere" id="aiHeatmap">{heat}</div>
          </article>
          <aside className="grid min-w-0 gap-3.5 min-[1000px]:sticky min-[1000px]:top-[72px]">
            <Card className="flex items-center gap-4">
              <Ring value={r.score} color="var(--close)" label={`AI indicator ${r.score} out of 100`} />
              <div><div className="text-lg font-bold text-close" id="aiLabel">{r.label}</div>
                <div className="text-[13px] text-mute">Estimated likelihood {r.score}/100: Low under 30, Unclear 30–70, High over 70.</div></div>
            </Card>
            <Card aria-labelledby="whyH">
              <h3 id="whyH" className="font-semibold">Why this score</h3>
              <ul className="mt-2 grid list-disc gap-1.5 pl-5 text-[13.5px]" id="aiReasons">{r.reasons.map((x) => <li key={x}>{x}</li>)}</ul>
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[13px]">
                <dt className="text-mute">Detector (passages)</dt><dd className="text-right">{Math.round(100 * r.classifier)}%</dd>
                <dt className="text-mute">Perplexity</dt><dd className="text-right">{r.perplexity ? Math.round(r.perplexity) : "—"}</dd>
                <dt className="text-mute">Variation</dt><dd className="text-right">{r.spread != null ? r.spread.toFixed(2) : "—"}</dd>
              </dl>
              <p className="mt-3 text-[12px] text-mute">
                Score = {Math.round(WEIGHTS.classifier * 100)}% RoBERTa detector + {Math.round(WEIGHTS.languageModel * 100)}% language-model signal
                (perplexity and its variation across sentences, measured with distilgpt2). Both run on your device.
              </p>
            </Card>
            <p className={cx("rounded-lg bg-soft p-3 text-[12.5px]")}>There’s nothing to “fix” here. If you used AI tools while writing, follow your institution’s rules on disclosing that.</p>
          </aside>
        </div>
      </>}
    </div>
  );
}
