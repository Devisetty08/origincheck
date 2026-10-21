// Word lookups for the grammar popup: synonyms (Datamuse), definitions (Free Dictionary API, then Wiktionary), and whether
// the word is a known name (Wikidata), so names and technical terms flagged as misspellings can be recognised.
// Editor only — never used for plagiarism matching. Cached per word.
import { getJson, stripTags } from "@/server/http";
import { limit } from "@/server/rateLimit";

type Def = { partOfSpeech: string; definition: string };
type Entry = { synonyms: string[]; definitions: Def[]; definitionSource?: string; entity?: { label: string; description: string; url: string } };
const cache = new Map<string, Entry>();
const enc = encodeURIComponent;

export async function GET(req: Request) {
  const over = limit(req, "words", 60);
  if (over) return over;
  const raw = new URL(req.url).searchParams.get("w")?.trim() ?? "";
  if (!/^[A-Za-z][A-Za-z0-9'-]{0,40}$/.test(raw)) return Response.json({ error: "Give one word." }, { status: 400 });
  const word = raw.toLowerCase();
  const hit = cache.get(raw);
  if (hit) return Response.json(hit);
  const [syn, dict, wikt, wd] = await Promise.allSettled([
    getJson<{ word: string }[]>(`https://api.datamuse.com/words?rel_syn=${enc(word)}&max=8`, { timeoutMs: 5000 }),
    getJson<{ meanings: { partOfSpeech: string; definitions: { definition: string }[] }[] }[]>(`https://api.dictionaryapi.dev/api/v2/entries/en/${enc(word)}`, { timeoutMs: 5000 }),
    getJson<Record<string, { partOfSpeech: string; language: string; definitions: { definition: string }[] }[]>>(`https://en.wiktionary.org/api/rest_v1/page/definition/${enc(word)}`, { timeoutMs: 5000 }),
    getJson<{ search?: { id: string; label?: string; description?: string }[] }>(`https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${enc(raw)}&language=en&type=item&limit=1&format=json`, { timeoutMs: 5000 }),
  ]);
  const free: Def[] = dict.status === "fulfilled"
    ? dict.value.flatMap((d) => d.meanings.map((m) => ({ partOfSpeech: m.partOfSpeech, definition: m.definitions[0]?.definition ?? "" }))) : [];
  const wiktionary: Def[] = wikt.status === "fulfilled"
    ? (wikt.value.en ?? []).map((m) => ({ partOfSpeech: m.partOfSpeech, definition: stripTags(m.definitions[0]?.definition) })).filter((d) => d.definition) : [];
  const e = wd.status === "fulfilled" ? wd.value.search?.[0] : undefined;
  const entry: Entry = {
    synonyms: syn.status === "fulfilled" ? syn.value.map((s) => s.word) : [],
    definitions: (free.length ? free : wiktionary).slice(0, 3),
    definitionSource: free.length ? "Free Dictionary" : wiktionary.length ? "Wiktionary" : undefined,
    // names only (not dictionary words), and only an exact match: "PostgreSQL" finds the database, "Paris" doesn't pull in "Paris Hilton"
    entity: e && !free.length && e.label?.toLowerCase() === word && e.description
      ? { label: e.label, description: e.description, url: `https://www.wikidata.org/wiki/${e.id}` } : undefined,
  };
  cache.set(raw, entry);
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return Response.json(entry);
}
