// Citation details for one DOI (Crossref), plus an open-access full-text link from Unpaywall when asked (?oa=1).
import { config } from "@/server/config";
import { getJson } from "@/server/http";
import { limit } from "@/server/rateLimit";
import { lookupDoi } from "@/server/references";

export async function GET(req: Request) {
  const over = limit(req, "doi", 30);
  if (over) return over;
  const params = new URL(req.url).searchParams;
  const doi = params.get("doi")?.trim();
  if (!doi || !/^10\.\d{4,9}\//.test(doi)) return Response.json({ error: "Give a DOI such as 10.1038/nature12373." }, { status: 400 });
  try {
    const meta = await lookupDoi(doi);
    let oaUrl: string | undefined;
    if (params.get("oa") && config.unpaywallEmail)
      try {
        const u = await getJson<{ best_oa_location?: { url_for_pdf?: string; url?: string } }>(
          `https://api.unpaywall.org/v2/${encodeURIComponent(doi)}?email=${encodeURIComponent(config.unpaywallEmail)}`, { timeoutMs: 8000 });
        oaUrl = u.best_oa_location?.url_for_pdf ?? u.best_oa_location?.url;
      } catch { /* no open-access copy known */ }
    return Response.json(oaUrl ? { ...meta, oaUrl } : meta);
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 502 }); }
}
