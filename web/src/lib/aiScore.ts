// AI-likelihood indicator: combines a RoBERTa detector with GPT-2 perplexity signals.
// It is an indicator for review, never proof. Calibration (Oct 2026, distilgpt2 q8 + roberta-base-openai-detector q8):
//   human text (6 Wikipedia articles, Thoreau, Darwin): classifier 0.00–0.14, perplexity 47–149, log-ppl spread 0.36–0.86 → scores 3–24
//   AI-written essays (4):                              classifier 0.00–1.00, perplexity 24–60,  log-ppl spread 0.43–0.53 → scores 21–93
// The detector missed one AI sample entirely, which is why the score is never presented as a verdict.

export const MIN_WORDS = 150;
export const WEIGHTS = { classifier: 0.6, languageModel: 0.4, perplexity: 0.6, variation: 0.4 } as const;
export const PPL = { human: 100, ai: 25 } as const; // geometric-mean sentence perplexity: ≥100 → 0, ≤25 → 1 (log scale)
export const SPREAD = { human: 0.75, ai: 0.35 } as const; // SD of log sentence perplexity: ≥0.75 → 0, ≤0.35 → 1

export interface AiSignals {
  chunks: { start: number; end: number; prob: number }[]; // detector probability that the chunk is machine-written
  sentences: { start: number; end: number; ppl: number | null }[]; // null when the sentence wasn't scored
}

export type AiLabel = "Low" | "Unclear" | "High";

export interface AiResult {
  score: number; // 0–100
  label: AiLabel;
  classifier: number; // 0–1, length-weighted mean over chunks
  perplexity: number | null; // geometric mean over scored sentences
  spread: number | null; // SD of log perplexity
  perplexitySignal: number;
  variationSignal: number;
  sentenceScores: (number | null)[];
  reasons: string[];
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
export const perplexitySignal = (ppl: number) => clamp((Math.log(PPL.human) - Math.log(ppl)) / (Math.log(PPL.human) - Math.log(PPL.ai)));
export const variationSignal = (spread: number) => clamp((SPREAD.human - spread) / (SPREAD.human - SPREAD.ai));
export const labelFor = (score: number): AiLabel => (score < 30 ? "Low" : score > 70 ? "High" : "Unclear");

/** The documented combination: 60% classifier, 40% language-model signal (itself 60% perplexity, 40% variation). */
export function combine(classifier: number, perplexity: number | null, spread: number | null) {
  const p = perplexity == null ? 0 : perplexitySignal(perplexity);
  const v = spread == null ? 0 : variationSignal(spread);
  const lm = WEIGHTS.perplexity * p + WEIGHTS.variation * v;
  return { score: Math.round(100 * (WEIGHTS.classifier * clamp(classifier) + WEIGHTS.languageModel * lm)), perplexitySignal: p, variationSignal: v };
}

/** Score a document from the worker's raw signals. Returns null below MIN_WORDS: too little text to estimate. */
export function aiScore(words: number, s: AiSignals): AiResult | null {
  if (words < MIN_WORDS || !s.chunks.length) return null;
  const len = (c: { start: number; end: number }) => Math.max(1, c.end - c.start);
  const total = s.chunks.reduce((a, c) => a + len(c), 0);
  const classifier = s.chunks.reduce((a, c) => a + c.prob * len(c), 0) / total;

  const logs = s.sentences.filter((x) => x.ppl != null && x.ppl > 0).map((x) => Math.log(x.ppl!));
  const mean = logs.length ? logs.reduce((a, b) => a + b, 0) / logs.length : null;
  const perplexity = mean == null ? null : Math.exp(mean);
  const spread = mean == null || logs.length < 3 ? null : Math.sqrt(logs.reduce((a, b) => a + (b - mean) ** 2, 0) / logs.length);
  const c = combine(classifier, perplexity, spread);

  const chunkAt = (pos: number) => s.chunks.find((ch) => pos >= ch.start && pos < ch.end) ?? s.chunks[s.chunks.length - 1];
  const sentenceScores = s.sentences.map((x) => {
    const p = x.ppl ?? perplexity;
    return p == null ? null : Math.round(100 * (WEIGHTS.classifier * chunkAt(x.start).prob + WEIGHTS.languageModel * perplexitySignal(p)));
  });

  const reasons: string[] = [];
  const flagged = s.chunks.filter((ch) => ch.prob > 0.5).length;
  reasons.push(flagged
    ? `The detector rated ${flagged} of ${s.chunks.length} passage${s.chunks.length > 1 ? "s" : ""} as more likely machine-written than not.`
    : "The detector rated every passage as more likely human-written.");
  if (perplexity != null)
    reasons.push(c.perplexitySignal > 0.5 ? `Very predictable wording for a language model (perplexity ${Math.round(perplexity)}; human writing here usually scores 50–150).`
      : c.perplexitySignal > 0 ? `Moderately predictable wording (perplexity ${Math.round(perplexity)}).`
      : `Less predictable wording, typical of human writing (perplexity ${Math.round(perplexity)}).`);
  if (spread != null)
    reasons.push(c.variationSignal > 0.5 ? "Low variation in sentence predictability: sentences are similarly predictable throughout."
      : c.variationSignal > 0 ? "Some variation in sentence predictability."
      : "High variation in sentence predictability, typical of human writing.");
  return { score: c.score, label: labelFor(c.score), classifier, perplexity, spread, perplexitySignal: c.perplexitySignal, variationSignal: c.variationSignal, sentenceScores, reasons };
}

export const AI_CAVEAT =
  "AI detection is unreliable. Detectors are probabilistic and produce false positives — formal, technical or non-native-English " +
  "writing is often misjudged as AI — and they work best on English. Use this as a prompt to review, never as proof, and never as the " +
  "sole basis for an accusation. Your institution's tools may give a different result.";
