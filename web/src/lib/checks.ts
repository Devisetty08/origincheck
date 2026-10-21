"use client";
// Clients for the background checks. Each check runs in its own Web Worker so the page stays responsive.
import type { AiSignals } from "./aiScore";
import { type Result, type Settings, type Source, type Tok, bibStart } from "./similarity";

/* ------------------------------ similarity ------------------------------ */

let simWorker: Worker | null = null;
let simSeq = 0;
const simPending = new Map<number, { resolve: (r: Result) => void; reject: (e: Error) => void }>();

export function runSimilarity(doc: { text: string; toks: Tok[] }, sources: Source[], settings: Settings, skip: Set<number>): Promise<Result> {
  if (!simWorker) {
    simWorker = new Worker(new URL("../workers/similarity.worker.ts", import.meta.url), { type: "module" });
    simWorker.onmessage = (e: MessageEvent<{ id: number; result?: Result; error?: string }>) => {
      const p = simPending.get(e.data.id);
      simPending.delete(e.data.id);
      if (e.data.error) p?.reject(new Error(e.data.error));
      else p?.resolve(e.data.result!);
    };
  }
  const id = ++simSeq;
  return new Promise((resolve, reject) => {
    simPending.set(id, { resolve, reject });
    simWorker!.postMessage({ id, doc, sources, settings, skip: [...skip] });
  });
}
export const latestSimilarity = () => simSeq;

/* ------------------------------ AI indicator ------------------------------ */

export type AiProgress = { stage: "download" | "analyze"; pct: number; mb?: number };
type Mock = (text: string, sentences: { start: number; end: number }[]) => AiSignals;
declare global { interface Window { __ocAiMock?: Mock } } // set by end-to-end tests so CI never downloads models

let aiWorker: Worker | null = null;
let aiSeq = 0;

export async function runAi(text: string, sentences: { start: number; end: number }[], onProgress: (p: AiProgress) => void): Promise<AiSignals> {
  if (window.__ocAiMock) {
    onProgress({ stage: "analyze", pct: 50 });
    await new Promise((r) => setTimeout(r, 50));
    return window.__ocAiMock(text, sentences);
  }
  aiWorker ??= new Worker(new URL("../workers/ai.worker.ts", import.meta.url), { type: "module" });
  const id = ++aiSeq;
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<{ id: number; type: string; signals?: AiSignals; message?: string } & AiProgress>) => {
      if (e.data.id !== id) return;
      if (e.data.type === "progress") onProgress({ stage: e.data.stage, pct: e.data.pct, mb: e.data.mb });
      else {
        aiWorker!.removeEventListener("message", onMsg);
        if (e.data.type === "result") resolve(e.data.signals!);
        else reject(new Error(e.data.message ?? "AI check failed"));
      }
    };
    aiWorker!.addEventListener("message", onMsg);
    aiWorker!.postMessage({ id, text, sentences });
  });
}

/* ------------------------------ sentence embeddings (paraphrase detection) ------------------------------ */

type EmbedMock = (texts: string[]) => Float32Array[];
declare global { interface Window { __ocEmbedMock?: EmbedMock } } // set by end-to-end tests

let embedWorker: Worker | null = null;
let embedSeq = 0;

export async function runEmbeddings(texts: string[], onProgress?: (p: AiProgress) => void): Promise<Float32Array[]> {
  if (window.__ocEmbedMock) return window.__ocEmbedMock(texts);
  embedWorker ??= new Worker(new URL("../workers/embed.worker.ts", import.meta.url), { type: "module" });
  const id = ++embedSeq;
  return new Promise((resolve, reject) => {
    const onMsg = (e: MessageEvent<{ id: number; type: string; vectors?: Float32Array[]; message?: string } & AiProgress>) => {
      if (e.data.id !== id) return;
      if (e.data.type === "progress") onProgress?.({ stage: e.data.stage, pct: e.data.pct, mb: e.data.mb });
      else {
        embedWorker!.removeEventListener("message", onMsg);
        if (e.data.type === "result") resolve(e.data.vectors!);
        else reject(new Error(e.data.message ?? "embedding failed"));
      }
    };
    embedWorker!.addEventListener("message", onMsg);
    embedWorker!.postMessage({ id, texts });
  });
}

/* ------------------------------ run all sources (server search, streamed) ------------------------------ */

export type SourceGroup = "refs" | "web" | "books" | "lists";
export type SearchStatus = "success" | "no results" | "failed" | "rate-limited" | "not configured";
export interface SearchHit { title: string; snippet: string; url?: string; doi?: string; authors: string[]; year?: number; source: string; text?: string; oaUrl?: string }
export interface SourceRun { source: string; label: string; status: SearchStatus | "running"; ms: number; queries: number; results: SearchHit[]; error?: string }

export async function runAllSources(queries: string[], groups: SourceGroup[], korean: boolean, on: (e: { type: "start"; sources: { id: string; label: string }[] } | { type: "source"; run: SourceRun } | { type: "done"; ms: number }) => void, signal?: AbortSignal) {
  const { postSse } = await import("./sse");
  await postSse("/api/search", { queries, groups, korean }, (event, data) => {
    if (event === "start") on({ type: "start", sources: (data as { sources: { id: string; label: string }[] }).sources });
    else if (event === "source") on({ type: "source", run: data as SourceRun });
    else if (event === "done") on({ type: "done", ms: (data as { ms: number }).ms });
  }, signal);
}

/* ------------------------------ shared ------------------------------ */

/** Sentences of the document body (bibliography and one-line headings left out), with offsets. */
export function bodySentences(text: string) {
  const b = bibStart(text);
  const body = b >= 0 ? text.slice(0, b) : text;
  const out: { start: number; end: number }[] = [];
  for (const m of body.matchAll(/[^.!?\n]+(?:[.!?]+["”’)]*|(?=\n)|$)/g)) {
    const t = m[0].trim();
    if (t.split(/\s+/).length < 3) continue;
    const start = m.index! + m[0].indexOf(t);
    out.push({ start, end: start + t.length });
  }
  return out;
}

export const wordCount = (text: string) => (text.match(/[A-Za-z0-9À-ɏ]+(?:['’][A-Za-z]+)?/g) ?? []).length;
