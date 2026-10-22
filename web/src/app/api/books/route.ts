// Book search for My library (GET ?q=) and the full text of a free book (GET ?get=ia:ID | gutenberg:ID).
// Only public-domain and open-access texts are fetched; open-access PDFs go through /api/fetch-url.
import { redact } from "@/server/config";
import { bookText, searchBooks } from "@/server/books";
import { limit } from "@/server/rateLimit";

export const maxDuration = 60;

export async function GET(req: Request) {
  const over = limit(req, "books", 20);
  if (over) return over;
  const p = new URL(req.url).searchParams;
  const get = p.get("get"), q = (p.get("q") ?? "").trim();
  try {
    if (get) return Response.json({ text: await bookText(get) });
    if (q.length < 2 || q.length > 200) return Response.json({ error: "Search for a title, author or subject." }, { status: 400 });
    return Response.json({ books: await searchBooks(q) });
  } catch (e) {
    const msg = redact((e as Error).message);
    return Response.json({ error: /^(This book|The Internet Archive|Unknown book)/.test(msg) ? msg : `The book service failed (${msg}).` }, { status: 502 });
  }
}
