// Where a book that isn't free can be read, borrowed or bought, and whether each option is free or paid.
// Open Library reports live loan status; Google Books reports e-book prices and previews (with a free key);
// WorldCat finds libraries; BookFinder compares prices across bookshops. Nothing is downloaded.
import "server-only";
import { config } from "./config";
import { getJson } from "./http";

export type Access = "free" | "borrow" | "preview" | "library" | "paid" | "restricted";
export interface Offer { site: string; url: string; access: Access; price?: string; note: string }
export interface BookQuery { isbn?: string; title: string; author?: string; country?: string }

const ORDER: Access[] = ["free", "borrow", "preview", "library", "paid", "restricted"];
const enc = encodeURIComponent;

type OLAvail = { status?: string; available_to_borrow?: boolean; available_to_waitlist?: boolean; is_readable?: boolean; is_printdisabled?: boolean; num_waitlist?: number | null; identifier?: string };

async function openLibrary(b: BookQuery): Promise<Offer[]> {
  const q = b.isbn ? `isbn:${b.isbn}` : `title:"${b.title}"${b.author ? ` author:"${b.author}"` : ""}`;
  const j = await getJson<{ docs?: { key: string; ebook_access?: string; availability?: OLAvail }[] }>(
    `https://openlibrary.org/search.json?q=${enc(q)}&limit=1&fields=key,ebook_access,availability`, { timeoutMs: 12_000 });
  const d = j.docs?.[0];
  if (!d) return [];
  const a = d.availability ?? {}, url = `https://openlibrary.org${d.key}`;
  if (a.is_readable || d.ebook_access === "public")
    return [{ site: "Open Library / Internet Archive", url: a.identifier ? `https://archive.org/details/${a.identifier}` : url, access: "free", note: "Free to read online: it's in the public domain." }];
  if (a.available_to_borrow) return [{ site: "Open Library", url, access: "borrow", note: "Free to borrow now with a free Open Library account (1-hour or 14-day loan)." }];
  if (a.available_to_waitlist || a.status === "borrow_unavailable")
    return [{ site: "Open Library", url, access: "borrow", note: `Free to borrow, but every copy is on loan. Join the waiting list${a.num_waitlist ? ` (${a.num_waitlist} waiting)` : ""}.` }];
  if (a.is_printdisabled || d.ebook_access === "printdisabled")
    return [{ site: "Open Library", url, access: "restricted", note: "Online only for readers with a print disability. Others: find it in a library." }];
  return [];
}

type GVolume = {
  volumeInfo?: { previewLink?: string; infoLink?: string };
  saleInfo?: { saleability?: string; buyLink?: string; retailPrice?: { amount: number; currencyCode: string }; listPrice?: { amount: number; currencyCode: string } };
  accessInfo?: { viewability?: string; webReaderLink?: string };
};
const money = (p?: { amount: number; currencyCode: string }) => (p ? new Intl.NumberFormat("en", { style: "currency", currency: p.currencyCode }).format(p.amount) : undefined);

/** Google Books: e-book sale status and price in the reader's country, and whether pages can be previewed. */
async function googleBooks(b: BookQuery): Promise<Offer[]> {
  const q = b.isbn ? `isbn:${b.isbn}` : `intitle:"${b.title}"${b.author ? `+inauthor:"${b.author}"` : ""}`;
  const key = config.googleBooksKey ? `&key=${enc(config.googleBooksKey)}` : "";
  const country = b.country && /^[A-Z]{2}$/.test(b.country) ? `&country=${b.country}` : "";
  const j = await getJson<{ items?: GVolume[] }>(`https://www.googleapis.com/books/v1/volumes?q=${enc(q)}&maxResults=1${country}${key}`, { timeoutMs: 12_000 });
  const v = j.items?.[0];
  if (!v) return [];
  const out: Offer[] = [], s = v.saleInfo ?? {}, view = v.accessInfo?.viewability;
  if (s.saleability === "FREE" || view === "ALL_PAGES")
    out.push({ site: "Google Books", url: v.accessInfo?.webReaderLink ?? v.volumeInfo?.infoLink ?? "", access: "free", note: "Free to read in full on Google Books." });
  else if (view === "PARTIAL")
    out.push({ site: "Google Books", url: v.volumeInfo?.previewLink ?? v.volumeInfo?.infoLink ?? "", access: "preview", note: "Preview: some pages are free to read online." });
  if (s.saleability === "FOR_SALE" || s.saleability === "FOR_SALE_AND_RENTAL")
    out.push({ site: "Google Play Books", url: s.buyLink ?? v.volumeInfo?.infoLink ?? "", access: "paid", price: money(s.retailPrice ?? s.listPrice), note: s.saleability === "FOR_SALE_AND_RENTAL" ? "E-book to buy or rent." : "E-book to buy." });
  return out.filter((o) => o.url);
}

/** Every known way to get the book, free options first. A service that fails is skipped and noted. */
export async function whereToGet(b: BookQuery): Promise<{ offers: Offer[]; note?: string }> {
  const [ol, gb] = await Promise.allSettled([openLibrary(b), googleBooks(b)]);
  const id = b.isbn ? b.isbn.replace(/[^0-9X]/gi, "") : "";
  const q = enc([b.title, b.author].filter(Boolean).join(" "));
  const offers: Offer[] = [
    ...(ol.status === "fulfilled" ? ol.value : []), ...(gb.status === "fulfilled" ? gb.value : []),
    { site: "WorldCat", url: id ? `https://search.worldcat.org/search?q=bn:${id}` : `https://search.worldcat.org/search?q=${q}`, access: "library", note: "Free to borrow from libraries that hold it. Shows the libraries nearest you." },
    { site: "BookFinder", url: id ? `https://www.bookfinder.com/search/?isbn=${id}` : `https://www.bookfinder.com/search/?title=${enc(b.title)}&author=${enc(b.author ?? "")}`, access: "paid", note: "Compare prices to buy it, new and used, across bookshops." },
  ];
  const note = gb.status === "rejected"
    ? config.googleBooksKey ? "Google Books didn't answer, so e-book prices aren't shown." : "Add a free Google Books API key in Settings to see e-book prices and previews."
    : undefined;
  return { offers: offers.sort((x, y) => ORDER.indexOf(x.access) - ORDER.indexOf(y.access)), note };
}
