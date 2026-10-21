// Citation details for one DOI (Crossref).
import { limit } from "@/server/rateLimit";
import { lookupDoi } from "@/server/references";

export async function GET(req: Request) {
  const over = limit(req, "doi", 30);
  if (over) return over;
  const doi = new URL(req.url).searchParams.get("doi")?.trim();
  if (!doi || !/^10\.\d{4,9}\//.test(doi)) return Response.json({ error: "Give a DOI such as 10.1038/nature12373." }, { status: 400 });
  try { return Response.json(await lookupDoi(doi)); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 502 }); }
}
