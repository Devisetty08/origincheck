// The full text of a free book, for "Read here" and My library: an Internet Archive public-domain scan or a Project
// Gutenberg book. Lending-only (in-copyright) Internet Archive books are never downloaded. Searching is in finder.ts.
import "server-only";
import { getJson, getText } from "./http";

export const MAX_BOOK_CHARS = 3_000_000;

export async function bookText(get: string): Promise<string> {
  const ia = get.match(/^ia:([\w.-]+)$/), pg = get.match(/^gutenberg:(\d+)$/);
  if (pg) return (await getText(`https://www.gutenberg.org/cache/epub/${pg[1]}/pg${pg[1]}.txt`, { timeoutMs: 30_000 })).slice(0, MAX_BOOK_CHARS);
  if (!ia) throw new Error("Unknown book.");
  type M = { metadata?: Record<string, unknown>; files?: { name: string }[] };
  const m = await getJson<M>(`https://archive.org/metadata/${ia[1]}`, { timeoutMs: 15_000 });
  if (String(m.metadata?.["access-restricted-item"]) === "true") throw new Error("This book is lending-only, so its text can't be downloaded. Borrow it from Open Library instead.");
  const file = m.files?.find((f) => f.name.endsWith("_djvu.txt"));
  if (!file) throw new Error("The Internet Archive has no text for this scan.");
  return (await getText(`https://archive.org/download/${ia[1]}/${encodeURIComponent(file.name)}`, { timeoutMs: 45_000 })).slice(0, MAX_BOOK_CHARS);
}
