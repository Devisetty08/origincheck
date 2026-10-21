"use client";
// Settings: how the checks behave (saved in this browser) and the server's keys and services (saved in .env.local).
import { useEffect, useState } from "react";
import { ExternalLink, KeyRound } from "lucide-react";
import { ENV_VARS, type EnvVar } from "@/lib/envVars";
import { Button, Card, cx } from "./ui";

type Vars = Record<string, { set: boolean; value?: string }>;
type Usage = { month: string; apis: { id: string; label: string; unit: string; used: number; cap: number }[] };
interface State { writable: boolean; reason: string | null; vars: Vars; usage?: Usage }

/** This month's use of each pay-as-you-go API against its cap. At the cap, origincheck stops calling it. */
function UsageCard({ usage, vars }: { usage: Usage; vars: Vars }) {
  const keyOf: Record<string, string> = { tavily: "TAVILY_API_KEY", brave: "BRAVE_API_KEY", anthropic: "ANTHROPIC_API_KEY", copyleaks: "COPYLEAKS_KEY" };
  return (
    <div className="mt-4 rounded-lg border border-line p-3" id="usageCard">
      <h3 className="text-sm font-semibold">Paid APIs: usage this month ({usage.month})</h3>
      <p className="text-[12px] text-mute">Each is off until its key is set, and origincheck stops calling it when the monthly cap is reached. Change the caps below.</p>
      <ul className="mt-2 grid gap-2 text-[13px]">
        {usage.apis.map((a) => {
          const pct = a.cap ? Math.min(100, (100 * a.used) / a.cap) : 100;
          return <li key={a.id} data-usage={a.id}>
            <div className="flex justify-between"><span>{a.label}{!vars[keyOf[a.id]]?.set && <span className="text-mute"> (off — no key)</span>}</span>
              <span className={cx(pct >= 100 && "font-semibold text-high")}>{a.used} / {a.cap} {a.unit}</span></div>
            <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-soft"><i className={cx("block h-full rounded-full", pct >= 100 ? "bg-high" : pct >= 80 ? "bg-mid" : "bg-accent")} style={{ width: `${pct}%` }} /></span>
          </li>;
        })}
      </ul>
    </div>
  );
}

const inputCls = "h-9 w-full rounded-md border border-line bg-bg px-2.5 text-sm disabled:opacity-60";

export function ServerSettings({ onSaved }: { onSaved: () => void }) {
  const [st, setSt] = useState<State | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then(setSt).catch(() => setMsg({ ok: false, text: "Couldn't load the server settings." }));
  }, []);

  const save = async (values: Record<string, string>) => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
      const j = await r.json();
      if (!r.ok) return setMsg({ ok: false, text: j.error ?? `Saving failed (${r.status}).` });
      setSt(j); setDraft({}); onSaved();
      setMsg({ ok: true, text: "Saved to web/.env.local and applied. Keys are kept on the server and never shown again." });
    } catch { setMsg({ ok: false, text: "Couldn't reach the server." }); } finally { setBusy(false); }
  };

  if (!st) return <Card><p className="text-sm text-mute" role="status">{msg?.text ?? "Loading server settings…"}</p></Card>;
  const groups = [...new Set(ENV_VARS.map((v) => v.group))];
  const changed = Object.keys(draft).length > 0;

  return (
    <Card aria-labelledby="srvH" id="serverSettings">
      <h2 id="srvH" className="flex items-center gap-2 font-semibold"><KeyRound size={17} />API keys and services</h2>
      <p className="mt-1 text-[13.5px] text-mute">Stored on the server in <code>web/.env.local</code>, never in your browser and never committed to git.
        Keys are write-only: once saved, this page only shows whether each one is set.</p>
      {!st.writable && <p className="mt-3 rounded-lg bg-soft p-3 text-sm" role="note" id="settingsReadOnly">{st.reason}</p>}
      {st.usage && <UsageCard usage={st.usage} vars={st.vars} />}
      {groups.map((g) => (
        <fieldset key={g} className="mt-5">
          <legend className="text-[13px] font-semibold uppercase tracking-wide text-mute">{g}</legend>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            {ENV_VARS.filter((v) => v.group === g).map((v) => (
              <Field key={v.key} v={v} cur={st.vars[v.key]} disabled={!st.writable || busy} draft={draft[v.key]}
                onChange={(x) => setDraft((d) => ({ ...d, [v.key]: x }))} onClear={() => save({ [v.key]: "" })} />
            ))}
          </div>
        </fieldset>
      ))}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!st.writable || !changed || busy} onClick={() => save(draft)} id="saveSettings">{busy ? "Saving…" : "Save settings"}</Button>
        {changed && <Button variant="ghost" onClick={() => setDraft({})}>Discard changes</Button>}
        {msg && <p className={cx("text-sm", msg.ok ? "text-low" : "text-high")} role="status" id="settingsMsg">{msg.text}</p>}
      </div>
    </Card>
  );
}

function Field({ v, cur, draft, disabled, onChange, onClear }: {
  v: EnvVar; cur?: { set: boolean; value?: string }; draft?: string; disabled: boolean; onChange: (x: string) => void; onClear: () => void;
}) {
  const id = `env-${v.key}`;
  const value = draft ?? cur?.value ?? "";
  return (
    <div className="grid content-start gap-1">
      <label htmlFor={id} className="flex flex-wrap items-center gap-2 text-sm font-medium">
        {v.label}
        <span className={cx("rounded-full px-2 py-px text-[11px] font-semibold", cur?.set ? "bg-low/15 text-low" : "bg-soft text-mute")} data-status={v.key}>
          {cur?.set ? "Set" : "Not set"}</span>
        {v.link && <a href={v.link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[12px] font-normal text-accent hover:underline">get one<ExternalLink size={11} /></a>}
      </label>
      {v.kind === "bool"
        ? <select id={id} className={inputCls} disabled={disabled} value={draft ?? (cur?.value === "true" ? "true" : "false")} onChange={(e) => onChange(e.target.value)}>
            <option value="false">Off</option><option value="true">On</option></select>
        : v.kind === "select"
          ? <select id={id} className={inputCls} disabled={disabled} value={value || v.options![0]} onChange={(e) => onChange(e.target.value)}>
              {v.options!.map((o) => <option key={o} value={o}>{o}</option>)}</select>
          : <div className="flex gap-2">
              <input id={id} className={inputCls} disabled={disabled} type={v.secret ? "password" : v.kind === "number" ? "number" : "text"}
                autoComplete="off" spellCheck={false} value={value} onChange={(e) => onChange(e.target.value)}
                placeholder={v.secret ? (cur?.set ? "•••••••• saved — type to replace" : "Paste your key") : v.placeholder} />
              {v.secret && cur?.set && <Button size="sm" variant="ghost" disabled={disabled} onClick={onClear} aria-label={`Remove ${v.label}`}>Remove</Button>}
            </div>}
      <span className="text-[12px] text-mute">{v.help} <code className="text-[11px]">{v.key}</code></span>
    </div>
  );
}
