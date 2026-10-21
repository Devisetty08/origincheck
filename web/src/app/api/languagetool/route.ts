// LanguageTool second opinion. Forwards to the self-hosted server in LANGUAGETOOL_URL (enable with ENABLE_LANGUAGETOOL=true).
// Rate-limit responses (429) are passed through so the browser can show them and back off.
import { config, redact } from "@/server/config";
import { limit } from "@/server/rateLimit";

export const maxDuration = 30;

export async function POST(req: Request) {
  if (!config.languageTool) return Response.json({ error: "LanguageTool is not enabled on this server (ENABLE_LANGUAGETOOL)." }, { status: 503 });
  const over = limit(req, "languagetool", 40);
  if (over) return over;
  const form = new URLSearchParams(await req.text());
  const text = form.get("text") ?? "";
  if (!text || text.length > 20_000) return Response.json({ error: "Send up to 20 KB of text per request." }, { status: 400 });
  try {
    const r = await fetch(`${config.languageToolUrl.replace(/\/$/, "")}/v2/check`, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": config.userAgent },
      body: new URLSearchParams({ text, language: form.get("language") || "auto" }), signal: AbortSignal.timeout(25_000),
    });
    return new Response(await r.text(), { status: r.status, headers: { "content-type": r.headers.get("content-type") ?? "application/json", ...(r.headers.get("retry-after") ? { "retry-after": r.headers.get("retry-after")! } : {}) } });
  } catch (e) {
    return Response.json({ error: `LanguageTool server unreachable: ${redact((e as Error).message)}` }, { status: 502 });
  }
}
