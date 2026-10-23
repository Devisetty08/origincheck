// "Improve my writing": revise one passage of the author's own draft. Default engine: a local model through Ollama
// (Qwen2.5 7B, Apache-2.0), so there is no per-use cost and the text stays on the machine. Optional engine: the Anthropic API,
// only when AI_PROVIDER=anthropic and a key is set, and capped per month. There is deliberately no "humanize" or
// "avoid detection" mode: the prompt asks for better writing, never for hiding how it was written.
import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config";
import { LOCAL_ONLY } from "./local";
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

const SYSTEM = `You are a careful copy editor helping an author revise their own draft.
Revise the passage the user sends according to the goal, changing only the wording.
Rules:
- Keep every fact exactly: the same people, places, objects, names, numbers, dates, durations and quantities.
  Never replace a thing with a different thing (for example "the wall row" must stay "the wall row").
- Keep the author's claims, meaning and certainty; keep quotations, citations and references unchanged.
- Do not add new ideas, examples or sources. Keep the language of the original.
Reply with the revised passage only: no preamble, no notes, no quotation marks around it.`;

export class ImproveError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

const prompt = (text: string, goal: Goal) => `Goal: ${GOALS[goal]}\n\nPassage:\n${text}`;
const ollamaBase = () => config.ollamaUrl.replace(/\/$/, "");

/**
 * Why the free-model gateway can't be used, or null. FreeLLMAPI and OmniRoute route to free tiers under your own
 * accounts: "personal experimentation only" (FreeLLMAPI's terms), so a hosted deployment serving others can't use one.
 */
export function gatewayProblem(local = true): string | null {
  if (process.env.VERCEL) return "A free-model gateway is for personal use on your own computer, so it is off on a hosted deployment. Use Ollama or Anthropic here.";
  if (!local) return `Rewrite uses the computer owner's free-model gateway, so it ${LOCAL_ONLY}.`;
  if (!config.gatewayUrl) return "AI_PROVIDER is gateway but GATEWAY_BASE_URL is not set (FreeLLMAPI: http://localhost:3001/v1 or http://localhost:31415/v1; OmniRoute: http://localhost:20128/v1).";
  if (!config.gatewayKey) return "AI_PROVIDER is gateway but GATEWAY_API_KEY is not set. Copy it from the gateway's dashboard.";
  return null;
}

/** Whether Rewrite can run, and if not, what to do about it (shown in the app). `local`: asked from the computer itself. */
export async function improveStatus(local = true): Promise<{ provider: "ollama" | "anthropic" | "gateway" | null; model?: string; note?: string }> {
  if (config.aiProvider === "anthropic")
    return config.anthropicKey ? { provider: "anthropic", model: config.anthropicModel } : { provider: null, note: "AI_PROVIDER is anthropic but ANTHROPIC_API_KEY is not set." };
  if (config.aiProvider === "gateway") {
    const problem = gatewayProblem(local);
    if (problem) return { provider: null, note: problem };
    try {
      const r = await fetch(`${config.gatewayUrl}/models`, { headers: { Authorization: `Bearer ${config.gatewayKey}` }, signal: AbortSignal.timeout(1500) });
      if (r.status === 401 || r.status === 403) return { provider: null, note: "The gateway rejected GATEWAY_API_KEY. Copy the key again from its dashboard." };
      return { provider: "gateway", model: config.gatewayModel };
    } catch {
      return { provider: null, note: `The gateway isn't running at ${config.gatewayUrl}. Start FreeLLMAPI or OmniRoute, or switch back to Ollama.` };
    }
  }
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
    body: JSON.stringify({ model: config.ollamaModel, stream: false, options: { temperature: 0 }, // deterministic: small local models drift from the facts at higher temperatures
      messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt(text, goal) }] }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]), // a small local model on a laptop CPU can take a while
  }).catch(() => { throw new ImproveError(502, `Ollama isn't reachable at ${config.ollamaUrl}. Is it running?`); });
  if (r.status === 404) throw new ImproveError(502, `The model "${config.ollamaModel}" isn't downloaded. Run: ollama pull ${config.ollamaModel}`);
  if (!r.ok) throw new ImproveError(502, `Ollama returned ${r.status}.`);
  const j = (await r.json()) as { message?: { content?: string } };
  return (j.message?.content ?? "").trim();
}

/** An OpenAI-compatible gateway (FreeLLMAPI, OmniRoute): it passes the passage to one of its free providers. */
async function viaGateway(text: string, goal: Goal, signal: AbortSignal): Promise<{ text: string; model: string }> {
  const problem = gatewayProblem();
  if (problem) throw new ImproveError(503, problem);
  try { spend("gateway"); } catch (e) {
    if (e instanceof CapReachedError) throw new ImproveError(429, `This month's gateway cap (${e.cap} requests) is reached. Raise GATEWAY_MONTHLY_REQUEST_CAP in Settings, or switch to the local model.`);
    throw e;
  }
  const r = await fetch(`${config.gatewayUrl}/chat/completions`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.gatewayKey}` },
    body: JSON.stringify({ model: config.gatewayModel, temperature: 0, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt(text, goal) }] }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(120_000)]),
  }).catch(() => { throw new ImproveError(502, `The gateway isn't reachable at ${config.gatewayUrl}. Is it running?`); });
  if (r.status === 401 || r.status === 403) throw new ImproveError(502, "The gateway rejected GATEWAY_API_KEY.");
  if (r.status === 429) throw new ImproveError(429, "Every free provider behind the gateway is rate-limited right now. Try again later, or switch to the local model.");
  if (!r.ok) throw new ImproveError(502, `The gateway returned ${r.status}.`);
  const j = (await r.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
  return { text: (j.choices?.[0]?.message?.content ?? "").trim(), model: j.model || config.gatewayModel }; // which model actually answered
}

export async function improve(text: string, goal: Goal, signal: AbortSignal): Promise<{ revised: string; model: string }> {
  const out = config.aiProvider === "anthropic" ? { text: await viaAnthropic(text, goal, signal), model: config.anthropicModel }
    : config.aiProvider === "gateway" ? await viaGateway(text, goal, signal)
    : { text: await viaOllama(text, goal, signal), model: config.ollamaModel };
  if (!out.text) throw new ImproveError(502, "The AI provider returned an empty revision.");
  return { revised: out.text, model: out.model };
}
