// Sentence embeddings for paraphrase detection, on the device (Transformers.js).
// Model: Xenova/paraphrase-multilingual-MiniLM-L12-v2 (Apache-2.0; ≈118 MB quantized; also handles Korean and 50+ languages).
import { type FeatureExtractionPipeline, env, pipeline } from "@huggingface/transformers";

export const EMBED_MODEL = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
env.allowLocalModels = false;
env.useBrowserCache = true;

let extractor: FeatureExtractionPipeline | null = null;

self.onmessage = async (e: MessageEvent<{ id: number; texts: string[] }>) => {
  const { id, texts } = e.data;
  try {
    const files = new Map<string, { loaded: number; total: number }>();
    extractor ??= (await pipeline("feature-extraction", EMBED_MODEL, {
      dtype: "q8",
      progress_callback: (p: { status: string; file?: string; loaded?: number; total?: number }) => {
        if (p.status !== "progress" || !p.file || !p.total) return;
        files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
        const s = [...files.values()].reduce((a, f) => ({ l: a.l + f.loaded, t: a.t + f.total }), { l: 0, t: 0 });
        postMessage({ id, type: "progress", stage: "download", pct: Math.round((100 * s.l) / Math.max(1, s.t)), mb: Math.round(s.t / 1e6) });
      },
    })) as FeatureExtractionPipeline;
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i += 16) {
      const t = await extractor(texts.slice(i, i + 16), { pooling: "mean", normalize: true });
      const [n, d] = t.dims as number[];
      for (let k = 0; k < n; k++) out.push((t.data as Float32Array).slice(k * d, (k + 1) * d));
      postMessage({ id, type: "progress", stage: "analyze", pct: Math.round((100 * Math.min(texts.length, i + 16)) / texts.length) });
    }
    postMessage({ id, type: "result", vectors: out });
  } catch (err) {
    postMessage({ id, type: "error", message: (err as Error).message });
  }
};
