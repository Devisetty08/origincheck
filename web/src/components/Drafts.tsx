"use client";
import { useMemo, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Trash2 } from "lucide-react";
import type { DraftCheck } from "@/lib/store";
import { Button, Card } from "./ui";

export default function Drafts({ history, setHistory }: { history: DraftCheck[]; setHistory: (h: DraftCheck[]) => void }) {
  const projects = useMemo(() => [...new Set(history.map((h) => h.project))], [history]);
  const [project, setProject] = useState<string>("");
  const cur = project && projects.includes(project) ? project : projects[projects.length - 1] ?? "";
  const drafts = history.filter((h) => h.project === cur);
  const [a, setA] = useState(""), [b, setB] = useState("");
  const A = drafts.find((d) => d.id === a) ?? drafts[drafts.length - 2], B = drafts.find((d) => d.id === b) ?? drafts[drafts.length - 1];
  const ka = new Set(A?.passages.map((x) => x.key)), kb = new Set(B?.passages.map((x) => x.key));
  const diff = A && B && A !== B
    ? { resolved: A.passages.filter((x) => !kb.has(x.key)), added: B.passages.filter((x) => !ka.has(x.key)) }
    : null;
  const data = drafts.map((d, i) => ({ name: d.label || `Draft ${i + 1}`, index: d.index, grammar: d.grammar ?? null, ai: d.ai ?? null, date: new Date(d.date).toLocaleString() }));
  const label = (d: DraftCheck) => `${d.label} · ${new Date(d.date).toLocaleDateString()} · ${d.index ?? "—"}%`;

  return (
    <div className="mx-auto grid grid-cols-[minmax(0,1fr)] max-w-[1180px] gap-4 px-4 pt-7 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Draft history</h1>
        <p className="text-mute">Every check is saved in this browser with its date, label, similarity index and sources.</p>
      </div>
      {!history.length ? <Card><p className="text-mute">No checks yet. Run a check and it will appear here.</p></Card> : <>
        <label className="flex flex-wrap items-center gap-2 text-sm">Document
          <select className="h-9 min-w-0 max-w-full rounded-md border border-line bg-panel px-2" value={cur} onChange={(e) => setProject(e.target.value)}>
            {projects.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        <Card aria-label="Similarity index across drafts">
          <h2 className="mb-2 font-semibold">Scores across drafts</h2>
          <p className="mb-2 text-[13px] text-mute">Similarity index (%), writing score (0–100) and AI indicator (0–100, an indicator only).</p>
          <div className="h-60 text-[12px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -16 }}>
                <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="var(--mute)" tick={{ fontSize: 12 }} />
                <YAxis stroke="var(--mute)" tick={{ fontSize: 12 }} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "var(--panel)", border: "1px solid var(--line)", borderRadius: 8, color: "var(--ink)" }}
                  formatter={(v, n) => [n === "Similarity" ? `${v}%` : String(v), n]} labelFormatter={(l, p) => `${l} — ${p?.[0]?.payload?.date ?? ""}`} />
                <Line type="monotone" name="Similarity" dataKey="index" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 4 }} isAnimationActive={false} connectNulls />
                <Line type="monotone" name="Writing score" dataKey="grammar" stroke="var(--low)" strokeWidth={2.5} strokeDasharray="6 3" dot={{ r: 4 }} isAnimationActive={false} connectNulls />
                <Line type="monotone" name="AI indicator" dataKey="ai" stroke="var(--close)" strokeWidth={2.5} strokeDasharray="2 3" dot={{ r: 4 }} isAnimationActive={false} connectNulls />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card>
          <h2 className="font-semibold">Drafts</h2>
          <ul className="mt-2">
            {[...drafts].reverse().map((d) => <li key={d.id} className="flex items-center gap-3 border-t border-line py-2 text-sm first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.label} <span className="font-normal text-mute">· {d.docName}</span></div>
                <div className="truncate text-[12.5px] text-mute">{new Date(d.date).toLocaleString()} · {d.breakdown.slice(0, 3).map((x) => `${x.name} ${x.pct}%`).join(", ") || "no matches"}</div>
              </div>
              <span className="text-right text-[12.5px] leading-tight"><b className="text-base">{d.index ?? "—"}%</b><br /><span className="text-mute">G {d.grammar ?? "—"} · AI {d.ai ?? "—"}</span></span>
              <button className="grid size-8 place-items-center rounded-md text-mute hover:bg-soft hover:text-high cursor-pointer" aria-label={`Delete ${d.label}`}
                onClick={() => setHistory(history.filter((h) => h.id !== d.id))}><Trash2 size={16} /></button>
            </li>)}
          </ul>
        </Card>
        {drafts.length > 1 && <Card>
          <h2 className="font-semibold">Compare two drafts</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {([["From", A, setA], ["To", B, setB]] as const).map(([l, v, set]) => (
              <label key={l} className="grid gap-1 text-sm">{l}
                <select className="h-9 min-w-0 rounded-md border border-line bg-bg px-2" value={v?.id ?? ""} onChange={(e) => set(e.target.value)}>
                  {drafts.map((d) => <option key={d.id} value={d.id}>{label(d)}</option>)}
                </select>
              </label>
            ))}
          </div>
          {diff && <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <PassageList title={`Resolved since “${A.label}” (${diff.resolved.length})`} items={diff.resolved} tone="text-low" />
            <PassageList title={`New in “${B.label}” (${diff.added.length})`} items={diff.added} tone="text-high" />
          </div>}
          <Button size="sm" variant="ghost" className="mt-3" onClick={() => { if (confirm(`Delete all ${drafts.length} drafts of “${cur}”?`)) setHistory(history.filter((h) => h.project !== cur)); }}>Delete this document’s history</Button>
        </Card>}
      </>}
    </div>
  );
}

function PassageList({ title, items, tone }: { title: string; items: DraftCheck["passages"]; tone: string }) {
  return (
    <div className="min-w-0">
      <h3 className={`text-sm font-semibold ${tone}`}>{title}</h3>
      {!items.length ? <p className="text-[13px] text-mute">None.</p>
        : <ul className="mt-1 grid gap-1.5 text-[13px]">{items.map((x, i) => <li key={i} className="rounded-md bg-bg p-2">
          “{x.text.split(/\s+/).slice(0, 18).join(" ")}{x.text.split(/\s+/).length > 18 ? " …" : ""}”<div className="text-mute">{x.source}</div></li>)}</ul>}
    </div>
  );
}
