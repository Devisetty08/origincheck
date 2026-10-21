// "Improve my writing": revise one passage of the author's own draft. Default engine: a local model through Ollama
// (Phi-4-mini, MIT), so there is no per-use cost and the text stays on the machine. Optional engine: the Anthropic API,
// only when AI_PROVIDER=anthropic and a key is set, and capped per month. There is deliberately no "humanize" or
// "avoid detection" mode: the prompt asks for better writing, never for hiding how it was written.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import { CapReachedError, spend } from "./usage";

export const GOALS = {
  clearer: "Make it clearer and easier to follow.",
  shorter: "Make it shorter: say the same thing in fewer words.",
  formal: "Make the tone more formal, suitable for academic or professional writing.",
  casual: "Make the tone more casual and conversational.",
  plain: "Rewrite it in plain language: short sentences and everyday words, for a general reader.",
  nofiller: "Cut filler words and repeated phrases; change nothing else.",
} as const;
export type Goal = keyof typeof GOALS;
export const MAX_CHARS = 4000;

const SYSTEM = `You are a careful editor helping an author revise their own draft.
Revise the passage the user sends according to the goal. Keep the author's meaning, claims, facts, numbers, quotations,
citations and references exactly as they are; do not add new ideas or sources. Keep the language of the original.
Reply with the revised passage only: no preamble, no notes, no quotation marks around it.`;

export class ImproveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const prompt = (text: string, goal: Goal) => `Goal: ${GOALS[goal]}\n\nPassage:\n${text}`;
const ollamaBase = () => config.ollamaUrl.replace(/\/$/, "");

/** Whether Rewrite can run, and if not, what to do about it (shown in the app). */
export async function improveStatus(): Promise<{ provider: "ollama" | "anthropic" | null; model?: string; note?: string }> {
  if (config.aiProvider === "anthropic")
    return config.anthropicKey ? { provider: "anthropic", model: config.anthropicModel } : { provider: null, note: "AI_PROVIDER is anthropic but ANTHROPIC_API_KEY is not set." };
  try {
    const r = await fetch(`${ollamaBase()}/api/tags`, { signal: AbortSignal.timeout(1500) });
    const j = (await r.json()) as { models?: { name: string }[] };
    const want = config.ollamaModel;
    if (!j.models?.some((m) => m.name === want || m.name.startsWith(`${want}:`)))
      return { provider: null, note: `Ollama is running but the model isn't downloaded yet. Run: ollama pull ${want}` };
    return { provider: "ollama", model: want };
  } catch {
    return { provider: null, note: `Ollama isn't running at ${config.ollamaUrl}. Install it from ollama.com, then run: ollama pull ${config.ollamaModel}` };
  }
}

async function viaAnthropic(text: string, goal: Goal, signal: AbortSignal) {
  try { spend("anthropic"); } catch (e) {
    if (e instanceof CapReachedError) throw new ImproveError(429, `This month's Anthropic cap (${e.cap} requests) is reached. Raise ANTHROPIC_MONTHLY_REQUEST_CAP in Settings, or switch to the free local model.`);
    throw e;
  }
  const client = new Anthropic({ apiKey: config.anthropicKey, maxRetries: 0, timeout: 60_000 }); // no SDK retries: each would be an uncounted billed call
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
  const r = await fetch(`${ollamaBase()}/api/chat`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: config.ollamaModel, stream: false, options: { temperature: 0.3 },
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt(text, goal) }] }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]), // a small local model on a laptop CPU can take a while
  }).catch(() => { throw new ImproveError(502, `Ollama isn't reachable at ${config.ollamaUrl}. Is it running?`); });
  if (r.status === 404) throw new ImproveError(502, `The model "${config.ollamaModel}" isn't downloaded. Run: ollama pull ${config.ollamaModel}`);
  if (!r.ok) throw new ImproveError(502, `Ollama returned ${r.status}.`);
  const j = (await r.json()) as { message?: { content?: string } };
  return (j.message?.content ?? "").trim();
}

export async function improve(text: string, goal: Goal, signal: AbortSignal) {
  const out = config.aiProvider === "anthropic" ? await viaAnthropic(text, goal, signal) : await viaOllama(text, goal, signal);
  if (!out) throw new ImproveError(502, "The AI provider returned an empty revision.");
  return out;
}
