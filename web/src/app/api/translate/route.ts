// Translates search phrases (never the document) into English through LibreTranslate, so a document written in another
// language can be checked against English sources it may have been translated from. Self-host LibreTranslate for free,
// or use libretranslate.com with an API key.
import { config, redact } from "@/server/config";
import { limit } from "@/server/rateLimit";

export const maxDuration = 30;
const MAX_ITEMS = 20, MAX_CHARS = 200, MAX_WORDS = 16;

export async function POST(req: Request) {
  if (!config.libreTranslateUrl) return Response.json({ error: "Translation is not configured on this server (LIBRETRANSLATE_URL)." }, { status: 503 });
  const over = limit(req, "translate", 10);
  if (over) return over;
  const body = (await req.json().catch(() => null)) as { q?: unknown; target?: unknown } | null;
  const q = Array.isArray(body?.q) ? body.q.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean) : [];
  const target = typeof body?.target === "string" && /^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(body.target) ? body.target : "en";
  if (!q.length || q.length > MAX_ITEMS || q.some((x) => x.length > MAX_CHARS || x.split(/\s+/).length > MAX_WORDS))
    return Response.json({ error: `Send up to ${MAX_ITEMS} short phrases (${MAX_WORDS} words each); whole documents are never translated.` }, { status: 400 });
  try {
    const r = await fetch(`${config.libreTranslateUrl}/translate`, {
      method: "POST", headers: { "Content-Type": "application/json", "User-Agent": config.userAgent }, signal: AbortSignal.timeout(25_000),
      body: JSON.stringify({ q, source: "auto", target, format: "text", ...(config.libreTranslateKey ? { api_key: config.libreTranslateKey } : {}) }),
    });
    const j = (await r.json().catch(() => ({}))) as { translatedText?: string | string[]; error?: string };
    if (!r.ok) return Response.json({ error: `LibreTranslate: ${j.error ?? `HTTP ${r.status}`}` }, { status: r.status === 429 ? 429 : 502 });
    const out = Array.isArray(j.translatedText) ? j.translatedText : [j.translatedText ?? ""];
    return Response.json({ translated: out.map((t) => t.split(/\s+/).slice(0, MAX_WORDS).join(" ")) });
  } catch (e) {
    return Response.json({ error: `Translation server unreachable: ${redact((e as Error).message)}` }, { status: 502 });
  }
}
