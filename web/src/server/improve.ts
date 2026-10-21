// "Improve my writing": revise one passage for clarity, concision, grammar or tone, through Anthropic or a local Ollama.
// Edits are suggestions the writer accepts or rejects one by one. There is deliberately no "humanize" or
// "avoid detection" mode: the prompt asks for better writing, never for hiding how it was written.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";

export const GOALS = {
  clarity: "Make it clearer and easier to follow.",
  concise: "Make it more concise: cut redundancy and filler.",
  grammar: "Fix grammar, spelling and punctuation only; change nothing else.",
  formal: "Make the tone suitable for academic writing.",
} as const;
export type Goal = keyof typeof GOALS;
export const MAX_CHARS = 4000;

const SYSTEM = `You are a careful editor helping a student revise their own writing.
Revise the passage the user sends according to the goal. Keep the author's meaning, claims, facts, numbers, quotations,
citations and references exactly as they are; do not add new ideas or sources. Keep the language of the original.
Reply with the revised passage only: no preamble, no notes, no quotation marks around it.`;

export class ImproveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const prompt = (text: string, goal: Goal) => `Goal: ${GOALS[goal]}\n\nPassage:\n${text}`;

async function viaAnthropic(text: string, goal: Goal, signal: AbortSignal) {
  const client = new Anthropic({ apiKey: config.anthropicKey, maxRetries: 2, timeout: 60_000 });
  try {
    const r = await client.beta.messages.create({
      model: config.anthropicModel,
      max_tokens: 16000,
      output_config: { effort: "medium" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default", // a policy decline is retried on the server-chosen fallback model
      system: SYSTEM,
      messages: [{ role: "user", content: prompt(text, goal) }],
    }, { signal });
    if (r.stop_reason === "refusal") throw new ImproveError(422, "The model declined to revise this passage.");
    if (r.stop_reason === "max_tokens") throw new ImproveError(502, "The revision was cut off; try a shorter passage.");
    return r.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
  } catch (e) {
    if (e instanceof ImproveError) throw e;
    if (e instanceof Anthropic.RateLimitError) throw new ImproveError(429, "The AI provider is rate-limiting requests; try again shortly.");
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
      throw new ImproveError(502, "The server's Anthropic key was rejected (ANTHROPIC_API_KEY).");
    if (e instanceof Anthropic.BadRequestError) throw new ImproveError(502, `The AI provider rejected the request: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new ImproveError(502, `The AI provider failed (${e.status ?? "network"}).`);
    throw e;
  }
}

async function viaOllama(text: string, goal: Goal, signal: AbortSignal) {
  const r = await fetch(`${config.ollamaUrl.replace(/\/$/, "")}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.ollamaModel, stream: false, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt(text, goal) }] }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
  }).catch(() => { throw new ImproveError(502, "The Ollama server is unreachable (OLLAMA_BASE_URL)."); });
  if (!r.ok) throw new ImproveError(502, `Ollama returned ${r.status}.`);
  const j = (await r.json()) as { message?: { content?: string } };
  return (j.message?.content ?? "").trim();
}

export async function improve(text: string, goal: Goal, signal: AbortSignal) {
  const out = config.aiProvider === "ollama" ? await viaOllama(text, goal, signal) : await viaAnthropic(text, goal, signal);
  if (!out) throw new ImproveError(502, "The AI provider returned an empty revision.");
  return out;
}
