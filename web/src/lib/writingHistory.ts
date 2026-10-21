// Writing history: process evidence for honest authors. Recorded only inside origincheck's own editor and tools, only
// while the user has it on, stored only in this browser (IndexedDB), and the user can export or delete it at any time.
// No keylogging: it keeps how the text changed (diffs between snapshots) and where each part came from, not keystrokes.
import { applyPatch, createPatch } from "diff";
import { del, get, set } from "idb-keyval";

export type Origin = "typed" | "pasted" | "ai" | "imported";
export const ORIGIN_LABEL: Record<Origin, string> = { typed: "typed", pasted: "pasted", ai: "AI-assisted", imported: "imported" };
export interface Run { len: number; origin: Origin }
export interface Snapshot { at: number; reason: "edit" | "save" | "ai" | "import"; text?: string; patch?: string; words: number }
export interface History {
  v: 1; key: string; title: string; created: number;
  runs: Run[];                         // where each character of the current text came from, as runs
  snapshots: Snapshot[];               // the first holds the full text, later ones a patch against the previous
  lastText: string;                    // text of the newest snapshot, to build the next patch
  pastes: { at: number; size: number }[];
  activeMs: number; sessions: number; lastEditAt: number;
}

export const SNAPSHOT_AFTER_MS = 5000;   // a snapshot after this long without editing
const IDLE_MS = 2 * 60_000;              // gaps longer than this don't count as writing time
const SESSION_GAP_MS = 30 * 60_000;      // a pause this long starts a new session
const words = (t: string) => t.split(/\s+/).filter(Boolean).length;

export function newHistory(key: string, title: string, text: string, origin: Origin, now = Date.now()): History {
  return { v: 1, key, title, created: now, runs: text ? [{ len: text.length, origin }] : [], snapshots: [{ at: now, reason: "import", text, words: words(text) }],
    lastText: text, pastes: origin === "pasted" && text ? [{ at: now, size: text.length }] : [], activeMs: 0, sessions: 1, lastEditAt: now };
}

/** Replace `del` characters at `start` with `ins` characters of one origin, keeping runs merged. */
export function spliceRuns(runs: Run[], start: number, delLen: number, insLen: number, origin: Origin): Run[] {
  const chars: Run[] = [], end = start + delLen;
  let pos = 0;
  const push = (len: number, o: Origin) => { if (!len) return; const last = chars[chars.length - 1]; if (last?.origin === o) last.len += len; else chars.push({ len, origin: o }); };
  let inserted = false;
  for (const r of runs) {
    const a = pos, b = pos + r.len;
    push(Math.max(0, Math.min(b, start) - a), r.origin);              // part before the change
    if (!inserted && b >= start) { push(insLen, origin); inserted = true; }
    push(Math.max(0, b - Math.max(a, end)), r.origin);                // part after the change
    pos = b;
  }
  if (!inserted) push(insLen, origin);
  return chars;
}

/** Record one edit: what changed between `prev` and `next`, and where the new text came from. */
export function recordChange(h: History, prev: string, next: string, origin: Origin, now = Date.now()): History {
  if (prev === next) return h;
  let p = 0;
  while (p < prev.length && p < next.length && prev[p] === next[p]) p++;
  let s = 0;
  while (s < prev.length - p && s < next.length - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++;
  const delLen = prev.length - p - s, insLen = next.length - p - s;
  const gap = now - h.lastEditAt;
  return {
    ...h,
    runs: spliceRuns(h.runs, p, delLen, insLen, origin),
    pastes: origin === "pasted" && insLen ? [...h.pastes, { at: now, size: insLen }] : h.pastes,
    activeMs: h.activeMs + (gap > 0 && gap <= IDLE_MS ? gap : 0),
    sessions: h.sessions + (gap > SESSION_GAP_MS ? 1 : 0),
    lastEditAt: now,
  };
}

/** True when the author has paused long enough after the last edit and that edit isn't in a snapshot yet. */
export const snapshotDue = (h: History, now = Date.now(), wait = SNAPSHOT_AFTER_MS) =>
  now - h.lastEditAt >= wait && h.lastEditAt > (h.snapshots[h.snapshots.length - 1]?.at ?? 0);

/** Add a snapshot of `text` as a patch against the previous one (unchanged text adds nothing). */
export function addSnapshot(h: History, text: string, reason: Snapshot["reason"], now = Date.now()): History {
  if (text === h.lastText) return h;
  const patch = createPatch("text", h.lastText, text, "", "", { context: 0 });
  return { ...h, snapshots: [...h.snapshots, { at: now, reason, patch, words: words(text) }], lastText: text };
}

/** The text as it was at snapshot `i`. */
export function textAt(h: History, i: number): string {
  let t = h.snapshots[0]?.text ?? "";
  for (let k = 1; k <= i && k < h.snapshots.length; k++) {
    const next = applyPatch(t, h.snapshots[k].patch!);
    if (next === false) break; // a damaged patch: stop at the last good version
    t = next;
  }
  return t;
}

export function summary(h: History) {
  const total = h.runs.reduce((a, r) => a + r.len, 0) || 1;
  const share = Object.fromEntries((["typed", "pasted", "ai", "imported"] as Origin[]).map((o) =>
    [o, Math.round((100 * h.runs.filter((r) => r.origin === o).reduce((a, r) => a + r.len, 0)) / total)])) as Record<Origin, number>;
  return { share, minutes: Math.round(h.activeMs / 60_000), sessions: h.sessions, snapshots: h.snapshots.length, pastes: h.pastes.length,
    largestPaste: h.pastes.reduce((m, p) => Math.max(m, p.size), 0), words: h.snapshots[h.snapshots.length - 1]?.words ?? 0 };
}

export const NOTE = "This is process evidence: how the text developed inside origincheck. It is not proof of authorship by itself.";

/** The exportable report (also the content of the PDF). */
export function exportReport(h: History, now = Date.now()) {
  const s = summary(h);
  return {
    title: h.title, generated: new Date(now).toISOString(), started: new Date(h.created).toISOString(),
    summary: { ...s, line: `${s.share.typed}% typed, ${s.share.pasted}% pasted, ${s.share.ai}% AI-assisted${s.share.imported ? `, ${s.share.imported}% imported` : ""}` },
    milestones: h.snapshots.map((sn) => ({ at: new Date(sn.at).toISOString(), words: sn.words, reason: sn.reason })),
    pastes: h.pastes.map((p) => ({ at: new Date(p.at).toISOString(), characters: p.size })),
    note: NOTE,
  };
}

/* -------- storage: this browser only -------- */
const idbKey = (key: string) => `wh:${key}`;
export const loadHistory = (key: string) => get<History>(idbKey(key)).catch(() => undefined);
export const saveHistory = (h: History) => set(idbKey(h.key), h).catch(() => {});
export const deleteHistory = (key: string) => del(idbKey(key));
