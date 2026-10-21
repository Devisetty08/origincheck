// Word lookups for the grammar popup: synonyms (Datamuse) and definitions (Free Dictionary API). Editor only — never used
// for plagiarism matching. Cached per word.
import { getJson } from "@/server/http";
import { limit } from "@/server/rateLimit";

type Entry = { synonyms: string[]; definitions: { partOfSpeech: string; definition: string }[] };
const cache = new Map<string, Entry>();

export async function GET(req: Request) {
  const over = limit(req, "words", 60);
  if (over) return over;
  const word = new URL(req.url).searchParams.get("w")?.trim().toLowerCase() ?? "";
  if (!/^[a-z][a-z'-]{0,40}$/.test(word)) return Response.json({ error: "Give one English word." }, { status: 400 });
  const hit = cache.get(word);
  if (hit) return Response.json(hit);
  const [syn, dict] = await Promise.allSettled([
    getJson<{ word: string }[]>(`https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=8`, { timeoutMs: 5000 }),
    getJson<{ meanings: { partOfSpeech: string; definitions: { definition: string }[] }[] }[]>(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`, { timeoutMs: 5000 }),
  ]);
  const entry: Entry = {
    synonyms: syn.status === "fulfilled" ? syn.value.map((s) => s.word) : [],
    definitions: dict.status === "fulfilled"
      ? dict.value.flatMap((d) => d.meanings.map((m) => ({ partOfSpeech: m.partOfSpeech, definition: m.definitions[0]?.definition ?? "" }))).slice(0, 3) : [],
  };
  cache.set(word, entry);
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return Response.json(entry);
}
