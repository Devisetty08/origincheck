// Wikipedia Action API (search + plain-text extracts). Content is CC BY-SA: results keep their page URL for attribution.
import "server-only";
import { getJson, stripTags } from "../http";
import type { Adapter, NormalizedResult } from "./types";

type Search = { query?: { search?: { title: string; snippet: string }[] } };
type Pages = { query?: { pages?: { title: string; fullurl?: string; extract?: string; missing?: boolean }[] } };

export function wikipedia(lang: "en" | "ko"): Adapter {
  const api = `https://${lang}.wikipedia.org/w/api.php`;
  const id = lang === "en" ? "wikipedia" : "wikipedia-ko";
  return {
    id,
    label: lang === "en" ? "Wikipedia" : "Wikipedia (Korean)",
    group: "web",
    missing: () => null,
    minIntervalMs: 200,
    async search(query, { signal }) {
      const s = await getJson<Search>(`${api}?action=query&list=search&srsearch=${encodeURIComponent(`"${query}"`)}&srlimit=2&format=json&formatversion=2`, { signal });
      const hits = s.query?.search ?? [];
      const out: NormalizedResult[] = [];
      for (const h of hits) { // full article text for matching (one page per request, as the API requires for full extracts)
        const p = await getJson<Pages>(`${api}?action=query&prop=extracts|info&inprop=url&explaintext=1&titles=${encodeURIComponent(h.title)}&format=json&formatversion=2`, { signal });
        const page = p.query?.pages?.[0];
        if (!page || page.missing) continue;
        out.push({ title: page.title, snippet: stripTags(h.snippet), url: page.fullurl, authors: ["Wikipedia contributors"], source: id, text: page.extract?.slice(0, 200_000) });
      }
      return out;
    },
  };
}
