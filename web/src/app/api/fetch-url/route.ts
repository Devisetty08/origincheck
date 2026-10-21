// Fetch a web page the user added as a source and return its readable text. SSRF-protected (see server/safeFetch.ts).
// PDFs are returned to the browser, which parses them with pdf.js; the server never parses untrusted PDFs.
import { limit } from "@/server/rateLimit";
import { BlockedError, safeFetch } from "@/server/safeFetch";
import { readable } from "@/server/readable";

export const maxDuration = 20;

export async function POST(req: Request) {
  const over = limit(req, "fetch-url", 20);
  if (over) return over;
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url || typeof url !== "string" || url.length > 2000) return Response.json({ error: "Give a web address." }, { status: 400 });
  try {
    const r = await safeFetch(url.trim());
    if (r.contentType.includes("pdf") || r.body.subarray(0, 5).toString() === "%PDF-")
      return Response.json({ url: r.url, kind: "pdf", pdfBase64: r.body.toString("base64") });
    if (r.contentType.startsWith("text/plain")) return Response.json({ url: r.url, kind: "text", text: r.body.toString("utf8") });
    if (!/html|xml/.test(r.contentType)) return Response.json({ error: `Unsupported content type (${r.contentType || "unknown"}).` }, { status: 415 });
    const { title, text, byline } = readable(r.body.toString("utf8"), r.url);
    if (text.split(/\s+/).length < 30) return Response.json({ error: "No readable text found on that page." }, { status: 422 });
    return Response.json({ url: r.url, kind: "html", title, text, byline });
  } catch (e) {
    const status = e instanceof BlockedError ? 400 : (e as { status?: number }).status ? 502 : 504;
    return Response.json({ error: (e as Error).message }, { status });
  }
}
