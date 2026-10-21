// Everything is kept in this browser (IndexedDB). Nothing is sent anywhere.
import { clear, get, set } from "idb-keyval";
import type { CiteMeta } from "./engine";

export interface SavedDoc {
  id: string;
  name: string;
  text: string;
  own: boolean; // the user's own earlier work (self-plagiarism category)
  savedAt: string;
}

export interface DraftCheck {
  id: string;
  project: string; // groups drafts of the same document
  docName: string;
  label: string;
  date: string;
  index: number;
  breakdown: { name: string; kind: string; pct: number }[];
  passages: { key: string; text: string; source: string }[];
  text: string;
}

export interface Prefs {
  theme?: "light" | "dark";
  style?: "apa" | "harvard" | "ieee";
  internet?: boolean;
  proxy?: boolean;
  email?: string;
  webSearch?: boolean; // search the web for matching phrases on each check
  searchKey?: string; // the user's own Jina API key, kept in this browser only
  webQueries?: number;
  books?: boolean; // search inside Open Library's scanned books on each check
  bookQueries?: number;
}

async function safeGet<T>(key: string, fallback: T): Promise<T> {
  try { return ((await get(key)) as T) ?? fallback; } catch { return fallback; }
}
async function safeSet(key: string, value: unknown) {
  try { await set(key, value); return true; } catch { return false; }
}

export const loadSaved = () => safeGet<SavedDoc[]>("saved", []);
export const storeSaved = (docs: SavedDoc[]) => safeSet("saved", docs);
export const loadHistory = () => safeGet<DraftCheck[]>("history", []);
export const storeHistory = (h: DraftCheck[]) => safeSet("history", h);
export const loadMeta = () => safeGet<Record<string, CiteMeta>>("meta", {});
export const storeMeta = (m: Record<string, CiteMeta>) => safeSet("meta", m);

export function loadPrefs(): Prefs {
  try { return JSON.parse(localStorage.getItem("oc-prefs") ?? "{}"); } catch { return {}; }
}
export function storePrefs(p: Prefs) {
  try { localStorage.setItem("oc-prefs", JSON.stringify(p)); } catch {}
}

export async function exportAll() {
  return JSON.stringify(
    { app: "origincheck", exported: new Date().toISOString(), saved: await loadSaved(), history: await loadHistory(), meta: await loadMeta() },
    null, 2,
  );
}

export async function deleteAll() {
  try { await clear(); } catch {}
  try { localStorage.removeItem("oc-prefs"); localStorage.removeItem("oc-repo"); } catch {}
}

/** Drafts of one document share a project key: the file name without version suffixes. */
export const projectKey = (name: string) =>
  name.replace(/\.[^.]+$/, "").toLowerCase()
    .replace(/[\s_-]*(\(\d+\)|v(ersion)?\s*\d+|draft\s*\d+|final|rev(ised)?\s*\d*)$/g, "").trim() || "document";

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
