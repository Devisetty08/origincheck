"use client";
// Paid plagiarism scan (Copyleaks): sends the whole document, after a notice, and polls until the provider's webhook arrives.
import { useEffect, useRef, useState } from "react";
import { ExternalLink, ShieldCheck } from "lucide-react";
import { Button, Card } from "./ui";

interface Match { kind: string; title: string; url?: string; matchedWords: number }
interface Result { score: number; totalWords: number; identicalWords: number; minorChangedWords: number; relatedMeaningWords: number; matches: Match[] }
interface Props {
  text: string;
  paid: { label: string; missing: string | null; sandbox: boolean } | undefined;
  confirm: (services: string[]) => Promise<boolean>;
  onSetup: () => void;
}

const POLL_MS = 4000, GIVE_UP_MS = 15 * 60_000;

export default function PaidCheck({ text, paid, confirm, onSetup }: Props) {
  const [state, setState] = useState<{ phase: "idle" | "sending" | "scanning" | "done" | "error"; msg?: string; result?: Result }>({ phase: "idle" });
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  if (!paid) return null;

  const run = async () => {
    if (!(await confirm([`${paid.label} (your whole document)`]))) return;
    setState({ phase: "sending" });
    const r = await fetch("/api/paid", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) }).catch(() => null);
    const j = await r?.json().catch(() => ({}));
    if (!r?.ok) return setState({ phase: "error", msg: j?.error ?? "Couldn't reach the server." });
    setState({ phase: "scanning" });
    const start = Date.now();
    while (alive.current && Date.now() - start < GIVE_UP_MS) {
      await new Promise((res) => setTimeout(res, POLL_MS));
      const p = await fetch(`/api/paid?scan=${j.scan}`).then((x) => x.json()).catch(() => null);
      if (p?.status === "done") return setState({ phase: "done", result: p.result });
      if (p?.status === "error" || p?.error) return setState({ phase: "error", msg: p.error });
    }
    if (alive.current) setState({ phase: "error", msg: `No result from ${paid.label} after 15 minutes. If you run locally, check that PUBLIC_BASE_URL (your tunnel) is still up.` });
  };

  const r = state.result;
  return (
    <Card className="no-print text-[13.5px]" id="paidCheck" aria-label={`${paid.label} check`}>
      <h3 className="flex items-center gap-1.5 font-semibold"><ShieldCheck size={15} />{paid.label} (paid, optional)</h3>
      {paid.missing
        ? <><p className="mt-1 text-mute" data-status="not configured">Not configured: {paid.missing}.</p>
            <Button size="sm" className="mt-2" onClick={onSetup}>Open Settings</Button></>
        : <>
            <p className="mt-1 text-mute">Searches the web, journals and {paid.label}&apos;s database of submitted papers — sources origincheck can&apos;t reach.
              Your <b>whole document</b> is sent to {paid.label} and uses paid credits.{paid.sandbox && <b> Sandbox mode: results are mock data.</b>}</p>
            {state.phase !== "scanning" && state.phase !== "sending" &&
              <Button size="sm" className="mt-2" onClick={run} id="paidRun">Check with {paid.label}</Button>}
            {(state.phase === "sending" || state.phase === "scanning") &&
              <p className="mt-2" role="status">{state.phase === "sending" ? "Sending…" : `Scanning with ${paid.label}… usually 1–3 minutes.`}</p>}
            {state.phase === "error" && <p className="mt-2 text-high" role="alert">{state.msg}</p>}
            {r && <div className="mt-3" id="paidResult">
              <p><b className="text-lg">{r.score}%</b> similarity according to {paid.label} ({r.identicalWords} identical, {r.minorChangedWords} slightly changed,
                {" "}{r.relatedMeaningWords} related-meaning words of {r.totalWords}).</p>
              <p className="mt-1 text-[12px] text-mute">A signal, not proof: quoted or properly cited text can be counted. {paid.label}&apos;s method differs from origincheck&apos;s, so the scores differ.</p>
              {r.matches.length
                ? <ol className="mt-2 grid gap-1">{r.matches.slice(0, 20).map((m, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-3 border-t border-line pt-1">
                      <span className="min-w-0 truncate">{m.url
                        ? <a href={m.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">{m.title}<ExternalLink size={11} className="ml-0.5 inline" /></a>
                        : m.title}<span className="ml-1 text-[11.5px] text-mute">{m.kind === "internet" ? "web" : m.kind === "database" ? "submitted papers" : "repository"}</span></span>
                      <span className="shrink-0 text-mute">{m.matchedWords} words</span>
                    </li>))}</ol>
                : <p className="mt-2">No matching sources found.</p>}
            </div>}
          </>}
    </Card>
  );
}
