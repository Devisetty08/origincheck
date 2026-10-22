// Find a book or paper (GET ?q=&mode=), where to get one (GET ?where=1&title=&isbn=…), and the full text of a free book
// (GET ?get=ia:ID | gutenberg:ID). Only public-domain and open-access texts are fetched; open-access PDFs go through
// /api/fetch-url.
import { redact } from "@/server/config";
import { whereToGet } from "@/server/availability";
import { bookText } from "@/server/books";
import { type Mode, find } from "@/server/finder";
import { limit } from "@/server/rateLimit";

export const maxDuration = 60;

export async function GET(req: Request) {
  const over = limit(req, "books", 20);
  if (over) return over;
  const p = new URL(req.url).searchParams;
  const get = p.get("get"), q = (p.get("q") ?? "").trim();
  try {
    if (get) return Response.json({ text: await bookText(get) });
    if (p.has("where")) { // where a book can be read, borrowed or bought, and whether it's free or paid
      const title = (p.get("title") ?? "").slice(0, 200), isbn = p.get("isbn")?.replace(/[^0-9X]/gi, "") || undefined;
      if (!title && !isbn) return Response.json({ error: "Give a title or ISBN." }, { status: 400 });
      return Response.json(await whereToGet({ title, isbn, author: p.get("author")?.slice(0, 100) || undefined, country: p.get("country")?.toUpperCase() || undefined }));
    }
    if (q.length < 2 || q.length > 400) return Response.json({ error: "Search for a title, author, words from the text, a citation, an ISBN or a DOI." }, { status: 400 });
    const mode = (p.get("mode") ?? "any") as Mode;
    if (!["any", "title", "author", "keywords", "citation", "isbn", "doi"].includes(mode)) return Response.json({ error: "Unknown search type." }, { status: 400 });
    return Response.json(await find(q, mode));
  } catch (e) {
    const msg = redact((e as Error).message);
    return Response.json({ error: /^(This book|The Internet Archive|Unknown book)/.test(msg) ? msg : `The book service failed (${msg}).` }, { status: 502 });
  }
}
