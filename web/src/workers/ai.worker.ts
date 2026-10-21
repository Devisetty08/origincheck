// AI-indicator signals, computed on the device with Transformers.js:
//   • RoBERTa detector (onnx-community/roberta-base-openai-detector-ONNX): per-chunk probability the text is machine-written
//   • distilgpt2 (Xenova/distilgpt2): per-sentence perplexity
// Models download on first use (≈210 MB, quantized) and are kept in the browser cache.
import { AutoModelForCausalLM, AutoTokenizer, type PreTrainedModel, type PreTrainedTokenizer, type TextClassificationPipeline, env, pipeline } from "@huggingface/transformers";
import type { AiSignals } from "@/lib/aiScore";

export const DETECTOR = "onnx-community/roberta-base-openai-detector-ONNX";
export const LM = "Xenova/distilgpt2";
const MAX_PPL_SENTENCES = 400; // longer documents: an evenly spaced sample
const CHUNK_WORDS = 230; // ≈ 300 tokens; detector limit is 512

env.allowLocalModels = false;
env.useBrowserCache = true;

export interface AiRequest { id: number; text: string; sentences: { start: number; end: number }[] }

let detector: TextClassificationPipeline | null = null;
let tokenizer: PreTrainedTokenizer | null = null;
let lm: PreTrainedModel | null = null;

function post(msg: object) { postMessage(msg); }

async function load(id: number) {
  if (detector && tokenizer && lm) return;
  const files = new Map<string, { loaded: number; total: number }>();
  const progress = (p: { status: string; file?: string; name?: string; loaded?: number; total?: number }) => {
    if (p.status !== "progress" || !p.file || !p.total) return;
    files.set(`${p.name}/${p.file}`, { loaded: p.loaded ?? 0, total: p.total });
    const sum = [...files.values()].reduce((a, f) => ({ loaded: a.loaded + f.loaded, total: a.total + f.total }), { loaded: 0, total: 0 });
    post({ id, type: "progress", stage: "download", pct: Math.round((100 * sum.loaded) / Math.max(sum.total, 1)), mb: Math.round(sum.total / 1e6) });
  };
  detector ??= (await pipeline("text-classification", DETECTOR, { dtype: "q8", progress_callback: progress })) as TextClassificationPipeline;
  tokenizer ??= await AutoTokenizer.from_pretrained(LM, { progress_callback: progress });
  lm ??= await AutoModelForCausalLM.from_pretrained(LM, { dtype: "q8", progress_callback: progress });
}

async function perplexity(sentence: string) {
  const { input_ids, attention_mask } = tokenizer!(`<|endoftext|>${sentence}`, { truncation: true, max_length: 128 });
  const { logits } = await lm!({ input_ids, attention_mask });
  const [, n, v] = logits.dims as number[], d = logits.data as Float32Array, ids = input_ids.data as BigInt64Array;
  if (n < 3) return null;
  let nll = 0;
  for (let i = 0; i < n - 1; i++) { // log-softmax of the next token
    let max = -Infinity;
    for (let k = 0; k < v; k++) if (d[i * v + k] > max) max = d[i * v + k];
    let z = 0;
    for (let k = 0; k < v; k++) z += Math.exp(d[i * v + k] - max);
    nll -= d[i * v + Number(ids[i + 1])] - max - Math.log(z);
  }
  return Math.exp(nll / (n - 1));
}

self.onmessage = async (e: MessageEvent<AiRequest>) => {
  const { id, text, sentences } = e.data;
  try {
    await load(id);
    // chunks of whole sentences, ~CHUNK_WORDS each
    const chunks: AiSignals["chunks"] = [];
    let start = -1, end = 0, words = 0;
    for (const s of sentences) {
      const w = text.slice(s.start, s.end).split(/\s+/).filter(Boolean).length;
      if (start >= 0 && words + w > CHUNK_WORDS) { chunks.push({ start, end, prob: 0 }); start = -1; words = 0; }
      if (start < 0) start = s.start;
      end = s.end;
      words += w;
    }
    if (start >= 0) chunks.push({ start, end, prob: 0 });

    const sample = new Set<number>();
    const eligible = sentences.map((s, i) => [s, i] as const).filter(([s]) => text.slice(s.start, s.end).split(/\s+/).length >= 4).map(([, i]) => i);
    const k = Math.min(MAX_PPL_SENTENCES, eligible.length);
    for (let i = 0; i < k; i++) sample.add(eligible[Math.floor((i * eligible.length) / k)]);
    const total = chunks.length + sample.size;
    let done = 0;
    const tick = () => post({ id, type: "progress", stage: "analyze", pct: Math.round((100 * ++done) / Math.max(total, 1)) });

    for (const c of chunks) {
      const out = (await detector!(text.slice(c.start, c.end), { top_k: null })) as { label: string; score: number }[];
      c.prob = out.find((o) => /fake/i.test(o.label))?.score ?? 0;
      tick();
    }
    const ppl: (number | null)[] = sentences.map(() => null);
    for (const i of sample) { ppl[i] = await perplexity(text.slice(sentences[i].start, sentences[i].end)); tick(); }

    const signals: AiSignals = { chunks, sentences: sentences.map((s, i) => ({ ...s, ppl: ppl[i] })) };
    post({ id, type: "result", signals });
  } catch (err) {
    post({ id, type: "error", message: (err as Error).message });
  }
};
