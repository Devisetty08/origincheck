// Shared by the browser and the server.
import type { CiteMeta } from "./similarity";

export const DOI_RE = /\b10\.\d{4,9}\/[^\s"<>]+[^\s"<>.,;)\]]/g;

export function crossrefToMeta(m: Record<string, unknown>): CiteMeta {
  const get = <T,>(k: string) => m[k] as T | undefined;
  const parts = (get<{ "date-parts": number[][] }>("issued") ?? get<{ "date-parts": number[][] }>("published"))?.["date-parts"]?.[0];
  return {
    authors: (get<{ family?: string; given?: string; name?: string }[]>("author") ?? []).map((a) => ({ family: a.family ?? a.name ?? "", given: a.given })),
    title: (get<string[]>("title") ?? [""])[0].replace(/<[^>]+>/g, ""),
    year: parts?.[0] ? String(parts[0]) : undefined,
    container: (get<string[]>("container-title") ?? [])[0],
    volume: get<string>("volume"),
    issue: get<string>("issue"),
    pages: get<string>("page")?.replace("-", "–"),
    publisher: get<string>("publisher"),
    doi: get<string>("DOI"),
    url: get<string>("URL"),
  };
}
