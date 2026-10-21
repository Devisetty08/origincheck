// Free book catalogues (markdown lists on GitHub), cached for an hour.
import { getText } from "@/server/http";
import { limit } from "@/server/rateLimit";

const CATALOGS: Record<string, string> = {
  "fpb-subjects": "https://raw.githubusercontent.com/EbookFoundation/free-programming-books/main/books/free-programming-books-subjects.md",
  "fpb-langs": "https://raw.githubusercontent.com/EbookFoundation/free-programming-books/main/books/free-programming-books-langs.md",
  aosd: "https://raw.githubusercontent.com/44bits/awesome-opensource-documents/master/README.md",
};
const cache = new Map<string, { at: number; md: string }>();

export async function GET(req: Request) {
  const over = limit(req, "catalog", 30);
  if (over) return over;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const url = CATALOGS[id];
  if (!url) return Response.json({ error: "Unknown list." }, { status: 404 });
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < 3_600_000) return new Response(hit.md, { headers: { "content-type": "text/markdown; charset=utf-8" } });
  try {
    const md = await getText(url, { timeoutMs: 10_000 });
    cache.set(id, { at: Date.now(), md });
    return new Response(md, { headers: { "content-type": "text/markdown; charset=utf-8" } });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 502 }); }
}
