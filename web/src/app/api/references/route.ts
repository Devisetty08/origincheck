// Resolve a pasted reference list / DOIs and stream each entry's outcome (Server-Sent Events).
import { limit } from "@/server/rateLimit";
import { resolveReference } from "@/server/references";

export const maxDuration = 60;

export async function POST(req: Request) {
  const over = limit(req, "references", 6);
  if (over) return over;
  const { entries } = (await req.json().catch(() => ({}))) as { entries?: unknown };
  const list = Array.isArray(entries) ? entries.filter((e): e is string => typeof e === "string" && e.trim().length > 6).map((e) => e.trim().slice(0, 500)) : [];
  if (!list.length) return Response.json({ error: "Paste at least one reference or DOI." }, { status: 400 });
  if (list.length > 30) return Response.json({ error: "At most 30 references at a time." }, { status: 400 });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(c) {
      for (const [i, e] of list.entries()) {
        c.enqueue(enc.encode(`event: entry\ndata: ${JSON.stringify({ index: i, total: list.length, ...(await resolveReference(e)) })}\n\n`));
      }
      c.enqueue(enc.encode(`event: done\ndata: {}\n\n`));
      c.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform" } });
}
