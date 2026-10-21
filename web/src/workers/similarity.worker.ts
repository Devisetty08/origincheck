// Runs the matching engine off the main thread. Results (including Maps) are structured-cloned back.
import { type Settings, type Source, type Tok, check } from "@/lib/similarity";

export interface SimilarityRequest { id: number; doc: { text: string; toks: Tok[] }; sources: Source[]; settings: Settings; skip: number[] }

self.onmessage = (e: MessageEvent<SimilarityRequest>) => {
  const { id, doc, sources, settings, skip } = e.data;
  try {
    postMessage({ id, result: check(doc, sources, settings, new Set(skip)) });
  } catch (err) {
    postMessage({ id, error: (err as Error).message });
  }
};
