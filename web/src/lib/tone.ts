// Tone of the writing, on the device: the open-source `sentiment` library (AFINN-165 word list, English) scores each
// sentence. Academic writing usually keeps a neutral tone, so strongly emotional sentences are listed for review.
import Sentiment from "sentiment";

const analyzer = new Sentiment();
export type ToneLabel = "Neutral" | "Positive" | "Negative" | "Mixed";
export interface Tone { label: ToneLabel; score: number; strong: { text: string; score: number; words: string[] }[] }

const SENTENCE = /[^.!?\n]+(?:[.!?]+["”’)]*|(?=\n)|$)/g;

/** Overall tone (average score per word, AFINN scale) and the sentences with the strongest wording. */
export function tone(text: string): Tone {
  const sentences = [...text.matchAll(SENTENCE)].map((m) => m[0].trim()).filter((s) => s.split(/\s+/).length >= 4);
  let pos = 0, neg = 0, words = 0;
  const strong: Tone["strong"] = [];
  for (const s of sentences) {
    const r = analyzer.analyze(s);
    words += r.tokens.length;
    pos += r.positive.length; neg += r.negative.length;
    if (Math.abs(r.score) >= 4) strong.push({ text: s, score: r.score, words: [...r.positive, ...r.negative] });
  }
  const score = words ? (pos - neg) / words : 0; // share of positive minus negative words
  const emotive = words ? (pos + neg) / words : 0;
  const label: ToneLabel = emotive < 0.04 ? "Neutral" : score > 0.02 ? "Positive" : score < -0.02 ? "Negative" : pos && neg ? "Mixed" : "Neutral";
  return { label, score: Math.round(score * 1000) / 10, strong: strong.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 5) };
}
