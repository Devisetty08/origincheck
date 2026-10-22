// Runs the Paragraph check rules off the main thread (long sources make the sentence comparisons heavy).
import type { PSource } from "@/lib/paragraph/citations";
import { type Options, analyze } from "@/lib/paragraph/rules";

self.onmessage = (e: MessageEvent<{ id: number; text: string; sources: PSource[]; opts: Options }>) => {
  const { id, text, sources, opts } = e.data;
  try { postMessage({ id, result: analyze(text, sources, opts) }); }
  catch (err) { postMessage({ id, error: (err as Error).message }); }
};
