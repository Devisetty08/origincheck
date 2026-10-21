// Copyleaks calls this when a scan finishes ({STATUS} = completed, error, creditsChecked or indexed).
// Only requests carrying the scan's random secret are accepted. Delivery is at-least-once, so repeats are harmless.
import { timingSafeEqual } from "node:crypto";
import { copyleaks } from "@/server/paid/copyleaks";
import { getScan } from "@/server/paid/scans";

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function POST(req: Request, ctx: { params: Promise<{ status: string }> }) {
  const { status } = await ctx.params;
  const q = new URL(req.url).searchParams;
  const scan = getScan(q.get("scan") ?? "");
  if (!scan || !same(q.get("t") ?? "", scan.secret)) return Response.json({ error: "Unknown scan." }, { status: 404 });
  const parsed = copyleaks.parseWebhook(status, await req.json().catch(() => null));
  if (parsed && "result" in parsed) Object.assign(scan, { status: "done", result: parsed.result });
  else if (parsed) Object.assign(scan, { status: "error", error: parsed.error });
  return new Response(null, { status: 204 });
}
