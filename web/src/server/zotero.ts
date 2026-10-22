// Zotero Web API (v3), with the user's own key: their references, and the full text Zotero has indexed from the
// PDFs in their library. Personal data, so it only runs when origincheck runs on the user's own computer.
import "server-only";
import type { CiteMeta } from "@/lib/similarity";
import { config } from "./config";
import { get } from "./http";

const API = "https://api.zotero.org";

export class ZoteroError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function zoteroProblem(): string | null {
  if (process.env.VERCEL) return "Zotero import uses your personal key, so it only works when origincheck runs on your own computer.";
  if (!config.zoteroUserId || !config.zoteroKey) return "Add your Zotero user ID and API key in Settings (My library).";
  return null;
}

async function z<T>(path: string): Promise<T> {
  const problem = zoteroProblem();
  if (problem) throw new ZoteroError(503, problem);
  const r = await get(`${API}/users/${encodeURIComponent(config.zoteroUserId!)}${path}`, {
    headers: { "Zotero-API-Key": config.zoteroKey!, "Zotero-API-Version": "3" }, timeoutMs: 15_000,
  }).catch((e: Error & { status?: number }) => {
    if (e.status === 403) throw new ZoteroError(502, "Zotero rejected the key, or it can't read this library. Check ZOTERO_USER_ID and ZOTERO_API_KEY.");
    if (e.status === 404) throw new ZoteroError(404, "Zotero has no indexed full text for that item.");
    throw new ZoteroError(502, `Zotero didn't answer (${e.message}).`);
  });
  return r.json() as Promise<T>;
}

type ZItem = { key: string; data: {
  key: string; itemType: string; title?: string; date?: string; parentItem?: string; contentType?: string;
  creators?: { creatorType: string; firstName?: string; lastName?: string; name?: string }[];
  publicationTitle?: string; bookTitle?: string; websiteTitle?: string; volume?: string; issue?: string; pages?: string;
  publisher?: string; DOI?: string; url?: string; accessDate?: string; ISBN?: string;
} };

export const zoteroMeta = (d: ZItem["data"]): CiteMeta => ({
  authors: (d.creators ?? []).filter((c) => c.creatorType === "author" || c.creatorType === "editor")
    .map((c) => (c.name ? { family: c.name } : { family: c.lastName ?? "", given: c.firstName || undefined })),
  title: d.title ?? "Untitled", year: d.date?.match(/\d{4}/)?.[0], container: d.publicationTitle ?? d.bookTitle ?? d.websiteTitle,
  volume: d.volume || undefined, issue: d.issue || undefined, pages: d.pages || undefined, publisher: d.publisher || undefined,
  doi: d.DOI || undefined, url: d.url || undefined, accessed: d.accessDate?.slice(0, 10) || undefined, isbn: d.ISBN?.split(/\s+/)[0] || undefined,
});

export interface ZoteroEntry { key: string; meta: CiteMeta; itemType: string; textKey?: string }

/** Top-level items (optionally matching `q`), each with the key of a child attachment Zotero has full text for. */
export async function zoteroItems(q = ""): Promise<ZoteroEntry[]> {
  const [top, attachments, indexed] = await Promise.all([
    z<ZItem[]>(`/items/top?limit=50&sort=dateModified&format=json${q ? `&q=${encodeURIComponent(q)}` : ""}`),
    z<ZItem[]>("/items?itemType=attachment&limit=100&format=json"),
    z<Record<string, number>>("/fulltext?since=0"),
  ]);
  const textOf = new Map<string, string>();
  for (const a of attachments) if (a.data.parentItem && indexed[a.key] != null && !textOf.has(a.data.parentItem)) textOf.set(a.data.parentItem, a.key);
  return top.filter((i) => !["note", "attachment", "annotation"].includes(i.data.itemType))
    .map((i) => ({ key: i.key, meta: zoteroMeta(i.data), itemType: i.data.itemType, textKey: indexed[i.key] != null ? i.key : textOf.get(i.key) }));
}

/** The full text Zotero indexed from one attachment. */
export async function zoteroText(attachmentKey: string) {
  if (!/^[A-Z0-9]{8}$/.test(attachmentKey)) throw new ZoteroError(400, "Not a Zotero item key.");
  return (await z<{ content?: string }>(`/items/${attachmentKey}/fulltext`)).content ?? "";
}
