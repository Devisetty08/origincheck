// Settings page: GET says which settings are set (secrets as set/not set only); POST saves them on a local machine.
import { limit } from "@/server/rateLimit";
import { readSettings, saveSettings, writeBlocked } from "@/server/settings";

export async function GET(req: Request) {
  const blocked = writeBlocked(req);
  return Response.json({ writable: !blocked, reason: blocked, vars: readSettings() });
}

export async function POST(req: Request) {
  const over = limit(req, "settings", 20);
  if (over) return over;
  const blocked = writeBlocked(req);
  if (blocked) return Response.json({ error: blocked }, { status: 403 });
  const body = (await req.json().catch(() => null)) as { values?: Record<string, unknown> } | null;
  if (!body?.values || typeof body.values !== "object") return Response.json({ error: "Send { values }." }, { status: 400 });
  try {
    saveSettings(body.values);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  return Response.json({ writable: true, reason: null, vars: readSettings() });
}
