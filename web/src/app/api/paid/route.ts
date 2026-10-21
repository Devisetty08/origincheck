// Paid plagiarism scan (Copyleaks). POST submits the whole document; GET ?scan= polls for the result.
// The document is never logged; only the provider sees it, after the user confirms a notice saying so.
import { config, redact } from "@/server/config";
import { limit } from "@/server/rateLimit";
import { copyleaks } from "@/server/paid/copyleaks";
import { createScan, dropScan, getScan } from "@/server/paid/scans";

export const maxDuration = 30;
const MAX_CHARS = 300_000;

export async function POST(req: Request) {
  const missing = copyleaks.missing();
  if (missing) return Response.json({ error: `${copyleaks.label} is not configured: ${missing}.` }, { status: 503 });
  const over = limit(req, "paid", 3);
  if (over) return over;
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.split(/\s+/).length < 10 || text.length > MAX_CHARS) return Response.json({ error: `Send between 10 words and ${MAX_CHARS / 1000}k characters.` }, { status: 400 });
  const { id, scan } = createScan();
  const hook = `${config.publicBaseUrl}/api/paid/webhook/{STATUS}?scan=${id}&t=${scan.secret}`;
  try {
    await copyleaks.submit(text, id, hook, AbortSignal.timeout(25_000));
  } catch (e) {
    dropScan(id);
    const status = (e as { status?: number }).status;
    return Response.json({ error: redact((e as Error).message) }, { status: status === 429 ? 429 : 502 });
  }
  return Response.json({ scan: id, sandbox: config.copyleaksSandbox });
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("scan") ?? "";
  const s = getScan(id);
  if (!s) return Response.json({ error: "Unknown or expired scan." }, { status: 404 });
  return Response.json({ status: s.status, result: s.result, error: s.error });
}
