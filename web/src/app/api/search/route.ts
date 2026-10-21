// "Run all sources": search every enabled source in parallel and stream each one's result as Server-Sent Events.
// Accepts only short query chunks (never the document) — enforced here, not just in the browser.
import { config } from "@/server/config";
import { GROUPS, type Group, addOpenAccess, pick } from "@/server/adapters";
import { runAll } from "@/server/orchestrator";
import { limit } from "@/server/rateLimit";
import { redact } from "@/server/config";

export const maxDuration = 60;

const MAX_QUERY_CHARS = 200, MAX_QUERY_WORDS = 16;

export async function POST(req: Request) {
  const over = limit(req, "search", 6);
  if (over) return over;
  const body = (await req.json().catch(() => ({}))) as { queries?: unknown; groups?: unknown; korean?: unknown };
  const queries = Array.isArray(body.queries) ? body.queries.filter((q): q is string => typeof q === "string").map((q) => q.trim()).filter(Boolean) : [];
  const groups = Array.isArray(body.groups) ? body.groups.filter((g): g is Group => typeof g === "string" && g in GROUPS) : [];
  if (!queries.length || !groups.length) return Response.json({ error: "Send at least one query and one source group." }, { status: 400 });
  if (queries.length > config.maxQueries) return Response.json({ error: `At most ${config.maxQueries} queries per run.` }, { status: 400 });
  if (queries.some((q) => q.length > MAX_QUERY_CHARS || q.split(/\s+/).length > MAX_QUERY_WORDS))
    return Response.json({ error: `Queries must be short chunks (at most ${MAX_QUERY_WORDS} words); full documents are never accepted.` }, { status: 400 });

  const adapters = pick(groups, body.korean === true);
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(enc.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      send("start", { sources: adapters.map((a) => ({ id: a.id, label: a.label, group: a.group })), queries: queries.length });
      const t0 = Date.now();
      try {
        await runAll(adapters, queries, async (e) => {
          await addOpenAccess(e.results, AbortSignal.timeout(8000));
          if (e.error) e.error = redact(e.error);
          send("source", e);
        });
      } catch (err) {
        send("error", { error: redact((err as Error).message) });
      }
      send("done", { ms: Date.now() - t0 });
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" } });
}
