// Revises one selected passage. Only that passage is sent to the AI provider, never the whole document,
// and its text is never logged.
import { config, redact } from "@/server/config";
import { limit } from "@/server/rateLimit";
import { GOALS, improve, ImproveError, MAX_CHARS, type Goal } from "@/server/improve";

export const maxDuration = 180; // a local model on a laptop can take a while

export async function POST(req: Request) {
  const provider = config.aiProvider;
  if (provider === "anthropic" && !config.anthropicKey)
    return Response.json({ error: "Rewrite is set to Anthropic but ANTHROPIC_API_KEY is not set. Add it in Settings, or switch to the free local model." }, { status: 503 });
  const over = limit(req, "improve", 10);
  if (over) return over;
  const body = (await req.json().catch(() => null)) as { text?: unknown; goal?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const goal = body?.goal as Goal;
  if (!text || text.length > MAX_CHARS) return Response.json({ error: `Select between 1 and ${MAX_CHARS} characters.` }, { status: 400 });
  if (!Object.hasOwn(GOALS, goal)) return Response.json({ error: "Unknown goal." }, { status: 400 });
  try {
    const { revised, model } = await improve(text, goal, req.signal);
    return Response.json({ revised, provider, model });
  } catch (e) {
    if (e instanceof ImproveError) return Response.json({ error: e.message }, { status: e.status });
    console.error("improve failed:", redact((e as Error).message));
    return Response.json({ error: "The revision failed." }, { status: 502 });
  }
}
