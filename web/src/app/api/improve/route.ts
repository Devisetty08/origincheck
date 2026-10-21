// Revises one selected passage. Only that passage is sent to the AI provider, never the whole document,
// and its text is never logged.
import { config, publicConfig, redact } from "@/server/config";
import { limit } from "@/server/rateLimit";
import { GOALS, improve, ImproveError, MAX_CHARS, type Goal } from "@/server/improve";

export const maxDuration = 60;

export async function POST(req: Request) {
  const provider = publicConfig().improve;
  if (!provider) return Response.json({ error: "“Improve my writing” is not configured on this server (AI_PROVIDER and its key or model)." }, { status: 503 });
  const over = limit(req, "improve", 10);
  if (over) return over;
  const body = (await req.json().catch(() => null)) as { text?: unknown; goal?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  const goal = body?.goal as Goal;
  if (!text || text.length > MAX_CHARS) return Response.json({ error: `Select between 1 and ${MAX_CHARS} characters.` }, { status: 400 });
  if (!Object.hasOwn(GOALS, goal)) return Response.json({ error: "Unknown goal." }, { status: 400 });
  try {
    const revised = await improve(text, goal, req.signal);
    return Response.json({ revised, provider, model: provider === "ollama" ? config.ollamaModel : config.anthropicModel });
  } catch (e) {
    if (e instanceof ImproveError) return Response.json({ error: e.message }, { status: e.status });
    console.error("improve failed:", redact((e as Error).message));
    return Response.json({ error: "The revision failed." }, { status: 502 });
  }
}
