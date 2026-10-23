// Zotero import (the user's own library, with their key from Settings): GET ?q= lists items; GET ?text=KEY returns the
// full text Zotero indexed from one attachment. Only on the user's own computer; nothing is logged.
import { redact } from "@/server/config";
import { isLocalRequest } from "@/server/local";
import { limit } from "@/server/rateLimit";
import { ZoteroError, zoteroItems, zoteroProblem, zoteroText } from "@/server/zotero";

export async function GET(req: Request) {
  const problem = zoteroProblem(isLocalRequest(req)); // the owner's library: not for other devices on the network
  if (problem) return Response.json({ error: problem }, { status: 503 });
  const over = limit(req, "zotero", 30);
  if (over) return over;
  const p = new URL(req.url).searchParams;
  try {
    const key = p.get("text");
    if (key) return Response.json({ text: await zoteroText(key) });
    return Response.json({ items: await zoteroItems((p.get("q") ?? "").slice(0, 100)) });
  } catch (e) {
    if (e instanceof ZoteroError) return Response.json({ error: e.message }, { status: e.status });
    console.error("zotero failed:", redact((e as Error).message));
    return Response.json({ error: "The Zotero import failed." }, { status: 502 });
  }
}
