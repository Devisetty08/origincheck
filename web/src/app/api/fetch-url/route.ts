// Fetch a web page the user added as a source and return its readable text. SSRF-protected (see server/safeFetch.ts).
// If the page is gone or refuses the request, the latest Internet Archive (Wayback Machine) copy is used instead.
// PDFs are returned to the browser, which parses them with pdf.js; the server never parses untrusted PDFs.
import { limit } from "@/server/rateLimit";
import { BlockedError, safeFetch } from "@/server/safeFetch";
import { readable } from "@/server/readable";

export const maxDuration = 30;

class PageError extends Error { constructor(public status: number, message: string) { super(message); } }

async function page(url: string) {
  const r = await safeFetch(url);
  if (r.contentType.includes("pdf") || r.body.subarray(0, 5).toString() === "%PDF-") return { url: r.url, kind: "pdf", pdfBase64: r.body.toString("base64") };
  if (r.contentType.startsWith("text/plain")) return { url: r.url, kind: "text", text: r.body.toString("utf8") };
  if (!/html|xml/.test(r.contentType)) throw new PageError(415, `Unsupported content type (${r.contentType || "unknown"}).`);
  const { title, text, byline } = readable(r.body.toString("utf8"), r.url);
  if (text.split(/\s+/).length < 30) throw new PageError(422, "No readable text found on that page.");
  return { url: r.url, kind: "html", title, text, byline };
}

export async function POST(req: Request) {
  const over = limit(req, "fetch-url", 20);
  if (over) return over;
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url || typeof url !== "string" || url.length > 2000) return Response.json({ error: "Give a web address." }, { status: 400 });
  try {
    return Response.json(await page(url.trim()));
  } catch (e) {
    if (e instanceof BlockedError) return Response.json({ error: e.message }, { status: 400 });
    if (e instanceof PageError && e.status === 415) return Response.json({ error: e.message }, { status: 415 });
    try { // dead link, refused, or empty page: try the latest archived copy ("id_" = the page as captured, without the archive's toolbar)
      const archived = await page(`https://web.archive.org/web/2id_/${url.trim()}`);
      return Response.json({ ...archived, url: url.trim(), archived: archived.url });
    } catch {
      const status = e instanceof PageError ? e.status : (e as { status?: number }).status ? 502 : 504;
      return Response.json({ error: `${(e as Error).message} No archived copy was found either.` }, { status });
    }
  }
}
