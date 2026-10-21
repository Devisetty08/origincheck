# origincheck

An open-source writing checker. Add a document and three checks run automatically:

- **Similarity**: finds passages that share wording or meaning with your sources and helps you fix them honestly: quote and cite, rewrite in your own words and cite, or remove.
- **Grammar**: spelling, grammar, punctuation, style and clarity suggestions that you accept one at a time, plus readability.
- **AI indicator** (off unless the server enables it): an estimate of how likely the text is to be machine-written. It is an indicator only, never proof.

> **Similarity and AI-likelihood scores are signals, not proof.** A match can be a properly quoted passage or common wording; an AI estimate can be wrong, especially on formal, technical or non-native-English writing. Every report says so.

It comes in two versions. The **web app** (`web/`) is a Next.js app: documents are read and matched in your browser, and a small server proxies the search APIs so no key ever reaches the browser. The **command-line tool** (`origincheck.py`) does similarity checks for batch work, large source folders and web search. Both use the same matching method and give the same similarity index on the same inputs.

![The origincheck report: similarity, grammar and AI indicator scores](example/screenshot.png)

## Web app

Drop in a document (.docx, .pdf, .txt, .md, .html, .rtf) or paste text. The checks start in parallel, each in its own Web Worker, and results appear as they finish. The summary shows one card per check, for example "47% similarity · 7 grammar suggestions".

### Sources to compare against

Seven inputs, each with a **Yes/No** switch. Turning one off removes its sources from the check.

| Input | What it adds |
|---|---|
| Files | Source documents you upload |
| Paste | Text you paste (with an optional name or URL) |
| Web page | A page you give the address of, fetched by the server |
| References & DOIs | Your reference list or DOIs, resolved to open-access full text where it exists |
| Search the web | Wikipedia (English, plus Korean for Korean text) and Brave Search (or Jina, or Google for existing customers) |
| Books (Open Library) | Open Library's search inside books |
| Free book lists | Project Gutenberg (Gutendex) and curated lists of free books |

**Run all sources** picks up to 8 short, distinctive 8–12-word passages from your document (skipping quotations, cited sentences and the bibliography), sends only those to every enabled source in parallel, and streams one row per source with its status — `success`, `no results`, `failed`, `rate-limited` or `not configured` — and timing. Publications come from Crossref, OpenAlex, Semantic Scholar, arXiv, CORE and Europe PMC; Unpaywall adds open-access links by DOI. Found sources are added to the check with their authors, year, DOI and link.

### Similarity

- Turnitin-style report: the document with matches highlighted and numbered by source, a ranked source list, the matching source passage side by side, and filters (exclude quotes, the bibliography, small matches, small sources, or a single source).
- Three match types:
  - **Verbatim** (solid highlight): identical wording. Only these count toward the similarity index.
  - **Near-verbatim** (dotted orange underline): lightly edited copying, found with MinHash/LSH and confirmed by edit distance (≥ 75% similar).
  - **Paraphrase** (double purple underline): the same idea in different words, found with multilingual sentence embeddings (cosine ≥ 0.80). Can be turned off in Settings.
- For each match: **Mark as quoted & cited**, **Rewrite in my own words**, **Cite this source** or **Remove**. The rewrite editor hides the source by default, re-checks your version as you type and shows a closeness meter. It never writes replacement text.
- **Check externally (optional)**: copies your text to the clipboard and opens Duplichecker or CopyKiller (stronger for Korean) in a new tab. origincheck never sends text to these sites itself; they have no public API.
- Citations in APA 7, Harvard and IEEE; a citation checker.

### Grammar

- Harper checks English on your device. Text that isn't mostly English is not checked, and the tab says so (for Korean it points to CopyKiller and a Korean spell checker).
- Click an underline for the message and suggestions: **Apply**, **Dismiss**, **Ignore rule** and, for spelling, **Add to dictionary** (kept in your browser). Definitions and synonyms come from the Free Dictionary API and Datamuse; click a synonym to use it.
- Optional second opinion from a self-hosted LanguageTool server, when the server enables it.
- Readability: Flesch reading ease, sentence length, passive voice and repeated words. Download the corrected document as .docx or .txt.

### Improve my writing

On the Grammar tab, select a passage and choose a goal (clarity, concise, grammar only or academic tone). Only the selected passage is sent, through origincheck's server, to Anthropic's Claude or your own Ollama server. The suggestion appears as a word-level diff: click any change to accept or reject it, then **Apply accepted**.

- A notice names the provider before the first passage is sent.
- It is turned off for passages the similarity check flagged: quote and cite those, or rewrite them yourself.
- Documents with accepted AI edits are labelled **AI-assisted** in the HTML report and in the .docx properties.
- There is no "humanize" or "avoid detection" mode, and there won't be.

### AI indicator

> AI detection is unreliable. Detectors are probabilistic and produce false positives — formal, technical or non-native-English writing is often misjudged as AI — and they work best on English. Use this as a prompt to review, never as proof, and never as the sole basis for an accusation.

Off unless the server sets `ENABLE_AI_LIKELIHOOD=true`. When on, the caveat is always shown with the score, with a sentence-level heatmap and a "Why this score" panel. The models run in the browser.

### History, saved documents and exports

- **History** keeps every check's date, version label, scores and source breakdown, with a chart across drafts.
- **Saved documents** stay in your browser. Mark your earlier work to have matches reported as self-plagiarism.
- **Download report** saves a standalone HTML file. **Print / PDF** uses print styles.

## How the scores are calculated

| Score | Calculation |
|---|---|
| **Similarity index** (0–100%) | Verbatim-matched words ÷ words not excluded (see [How the matching works](#how-the-matching-works)). Near-verbatim and paraphrase matches are listed separately and not counted. Bands: under 15 green, 15–24 amber, 25–39 orange, 40+ red. |
| **Writing score** (0–100) | `max(0, 100 − weighted issues per 100 words × 2)`, with errors weighing 3, warnings 1 and style suggestions 0.5. |
| **AI indicator** (0–100) | 60% RoBERTa detector + 40% language-model signal (60% perplexity, 40% variation in perplexity across sentences). Labels: **Low** under 30, **Unclear** 30–70, **High** over 70. Under 150 words: "Not enough text to estimate". Calibration notes are in [`web/src/lib/aiScore.ts`](web/src/lib/aiScore.ts). |

## Components

| Part | Component | Runs |
|---|---|---|
| Grammar | [Harper](https://github.com/Automattic/harper) (`harper.js`, WebAssembly) | In the browser |
| Grammar (optional) | [LanguageTool](https://github.com/languagetool-org/languagetool), self-hosted | Your server, through origincheck's proxy |
| Paraphrase | [Transformers.js](https://github.com/huggingface/transformers.js) with [`Xenova/paraphrase-multilingual-MiniLM-L12-v2`](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2) (≈118 MB, downloaded once) | In the browser |
| AI indicator (optional) | Transformers.js with [`onnx-community/roberta-base-openai-detector-ONNX`](https://huggingface.co/onnx-community/roberta-base-openai-detector-ONNX) and [`Xenova/distilgpt2`](https://huggingface.co/Xenova/distilgpt2) | In the browser |
| Similarity | origincheck's matching engine (`web/src/lib/similarity.ts`, same algorithm as `origincheck.py`) plus `hybrid.ts` / `minhash.ts` | In the browser |
| Search and import | Route handlers in `web/src/app/api/`, adapters in `web/src/server/adapters/` | On the server |
| Improve my writing | [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) (default model `claude-opus-5-5`) or Ollama | On the server |

Licences are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Privacy

Your document is read and matched in your browser. Saved documents, history, your dictionary and settings are stored in the browser (IndexedDB and localStorage). What leaves the browser, and only after a notice naming the services:

| Feature | What is sent, and where |
|---|---|
| Run all sources | Up to 8 passages of at most 16 words each (the server rejects anything longer), never the document, to the enabled sources listed above. |
| Web page, DOI and reference import | Only the addresses, DOIs and references you enter, to the page itself, Crossref, OpenAlex, Unpaywall or Europe PMC. |
| Word lookup | The single word you look up, to Datamuse and the Free Dictionary API. |
| LanguageTool (if enabled) | The document text, to the LanguageTool server the operator configured. |
| Improve my writing (if configured) | The passage you selected, to Anthropic or the operator's Ollama server. |
| Check externally | Nothing: you paste the text into the other site yourself. |

The server never logs documents or passages, strips keys from any error it logs, and rate-limits its own endpoints per client. The page fetcher blocks private, loopback, link-local and metadata addresses (checked after DNS resolution and on every redirect) and caps size (3 MB), time (10 s) and redirects (4).

## Developing and deploying

```
cd web
npm ci
cp .env.example .env.local   # then fill in what you have; every key is optional
npm run dev                  # http://localhost:3100
npm test                     # unit tests (Vitest), external APIs mocked
npm run build && npx playwright test   # end-to-end tests against the production server, APIs and models mocked
```

### Keys and settings

All keys are read from environment variables on the server and never sent to the browser. A source without its key shows as **not configured** and is skipped.

| Variable | Needed for | Notes |
|---|---|---|
| `CONTACT_EMAIL`, `HTTP_USER_AGENT` | Polite access to Wikipedia, Crossref and OpenAlex | Recommended |
| `UNPAYWALL_EMAIL` | Unpaywall open-access links | Must be a real address; placeholders are rejected |
| `CROSSREF_MAILTO`, `OPENALEX_MAILTO` | Polite pools | Default to `CONTACT_EMAIL` |
| `BRAVE_API_KEY` | Web search | [Brave Search API](https://brave.com/search/api/); usage is paid from a monthly credit |
| `JINA_API_KEY` | Web search fallback | |
| `CORE_API_KEY`, `SEMANTIC_SCHOLAR_API_KEY` | Higher rate limits | Both work without a key, but Semantic Scholar often returns `rate-limited` without one |
| `GOOGLE_API_KEY`, `GOOGLE_CSE_ID` | Google Programmable Search | Existing customers only; Google closed it to new customers and shuts it down on 1 January 2027 |
| `AI_PROVIDER` | Improve my writing | `anthropic` (default) or `ollama` |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Improve my writing with Claude | Model defaults to `claude-opus-5-5` |
| `OLLAMA_BASE_URL`, `OLLAMA_MODEL` | Improve my writing with Ollama | |
| `ENABLE_AI_LIKELIHOOD` | AI indicator | `false` by default |
| `ENABLE_LANGUAGETOOL`, `LANGUAGETOOL_URL` | LanguageTool second opinion | Point at your own server, for example the `erikvl87/languagetool` Docker image |
| `SEARCH_MAX_QUERIES` | Passages per run | Default 8, at most 40 |

### Deploying to Vercel

1. Import the repository in Vercel and set **Root Directory** to `web`. The framework is detected as Next.js.
2. Add the environment variables above under **Settings → Environment Variables**.
3. Deploy. Search, reference import and Improve my writing run as serverless functions (`maxDuration` 30–60 s, which the Hobby plan allows).

The rate limiter and search cache are in memory, so they are per function instance. That is enough to stop accidental floods, not a determined client; put Vercel's firewall or a shared store in front for a public deployment.

`.github/workflows/ci.yml` runs lint, the type check, the unit tests, the build and the end-to-end tests on every push and pull request. Vercel does the deploying.

### Adding a source adapter

1. Write an `Adapter` in `web/src/server/adapters/` (see `types.ts`): an `id`, a `label`, a `group` (`refs`, `web`, `books` or `lists`), `minIntervalMs` for the API's rate limit, `missing()` returning the name of a missing env var or `null`, and `search(query, { signal })` returning `NormalizedResult[]`. Use `getJson` / `getText` from `../http`, which send the User-Agent and honour the abort signal; throw `HttpError` with `retryAfterMs` on 429 so the orchestrator backs off.
2. Add it to `ADAPTERS` in `adapters/index.ts`.
3. Add success, empty, error, 429 and timeout cases to `adapters.test.ts` with a fixture in the API's real response shape.

Only add APIs that are public and allow automated access. Don't scrape sites that forbid it.

## Command-line tool

### Setup

You need Python 3.9 or later.

```
pip install -r requirements.txt
```

### Usage

```
python origincheck.py <document> -s <sources folder> [options]
```

Example with the bundled sample:

```
python origincheck.py example/draft.docx -s example/references --exclude-quotes --exclude-bib
```

```
Similarity index: 47%
   25.7%  azure.txt
   21.0%  ora2pg.pdf
```

The command writes `example/draft_similarity.html` (see [example/sample_report.html](example/sample_report.html)). Without the two exclusion flags the same check gives 61% (azure.txt 33%, ora2pg.pdf 28%).

| Option | What it does |
|---|---|
| `-s`, `--sources DIR` | Folder of source documents, read recursively. Repeat it to add more folders. |
| `-o`, `--out FILE` | Report path. Default `<document>_similarity.html`. |
| `--ngram N` | Fingerprint (shingle) size in words. Default 5. Lower is stricter. |
| `--min-words N` | Ignore matches shorter than N words. Default 8. |
| `--exclude-quotes` | Ignore text inside "…" or “…” (up to 800 characters). |
| `--exclude-bib` | Ignore everything after the last References / Bibliography / Works cited heading. |
| `--exclude-source-pct X` | Drop sources contributing less than X% and re-attribute their words. |
| `--web` | Also search the internet (needs `BRAVE_API_KEY`, see below). |
| `--web-queries N` | Maximum number of web searches. Default 15. |
| `--save-to-repo` | Keep this document in `./repository/` so future checks compare against it. |
| `--no-repo` | Don't compare against `./repository/` for this run. |
| `--json` | Also write a JSON summary next to the report. |

### Internet check (optional)

`--web` picks up to N evenly spaced sentences of at least 12 words, searches the first 24 words of each as a quoted phrase with the [Brave Search API](https://brave.com/search/api/), downloads the top 3 results (HTML or PDF) and adds them as "Internet" sources. Requests are spaced about 1.1 s apart. If no key is set, the web check is skipped with a warning.

```
export BRAVE_API_KEY=your_key            # macOS / Linux
$env:BRAVE_API_KEY="your_key"            # PowerShell
set BRAVE_API_KEY=your_key               # Windows cmd
python origincheck.py "Dissertation.docx" -s references --web --web-queries 25
```

## How the matching works

1. **Tokenize.** Words are matched with `[A-Za-z0-9À-ɏᄀ-ᇿ㄰-㆏가-힣]+(?:['’][A-Za-z]+)?` (Latin and Hangul), lowercased, with `’` normalised to `'`. Each word keeps its character offsets so highlights map back onto the original text.
2. **Fingerprint.** The text is cut into overlapping 5-word shingles.
3. **Match.** For each source, every document word covered by a shingle that also appears in that source is marked. Excluded words are skipped.
4. **Passages.** Marked words are joined into contiguous runs. Runs shorter than `min-words` (default 8) are dropped.
5. **Attribution.** Each matched word is credited to exactly one source, preferring the source with the most matched words overall, so the source percentages add up to the similarity index.
6. **Score.** Similarity index = matched words ÷ words not excluded, rounded to a whole percent.

The web app then looks for what verbatim matching misses, without changing the index:

7. **Near-verbatim.** Sentences are signed with 64-hash MinHash over 3-word shingles; LSH (16 bands) proposes candidate pairs, and a Levenshtein ratio of 0.75 or more confirms them.
8. **Paraphrase.** A second LSH pass over content-word stems proposes up to 400 candidate pairs (Jaccard ≥ 0.15); a pair is a paraphrase if its sentence embeddings have cosine similarity of 0.80 or more.

## Limits compared with real Turnitin

- **The database.** Commercial services compare against private databases of web pages, journals and past student papers. origincheck searches public APIs (Wikipedia, scholarly indexes, open-access repositories, Open Library, Gutenberg) and, with a key, a web search API. Search finds pages that share a passage; it is not a commercial index. Your institution's report can show matches this tool doesn't.
- **Search is sampled.** Only up to 8 passages are searched per run, so a source matching only other parts of the document can be missed. Raise `SEARCH_MAX_QUERIES` for long documents.
- **Paywalls.** Closed-access papers are matched only on their metadata and abstracts. Add the file yourself if you have it.
- **Paraphrase detection** is a signal for review. Embeddings also match sentences that state the same common fact.
- **AI indicator, not AI detection.** See the caveat above. Turnitin's detector uses different, private models, so its result can differ.
- **Scanned PDFs** have no text layer. Run OCR on them first.

## Fixing flagged passages

For each highlighted passage, do one of these, then check again:

- **Quote and cite**: put the exact words in quotation marks and cite the source.
- **Rewrite and cite**: explain the idea in your own words and still cite the source.
- **Cut** it if your work doesn't need it.

## Repository layout

```
web/                    web app (Next.js)
  src/app/api/          server routes: search, fetch-url, references, doi, catalog, words, languagetool, improve, config
  src/server/           adapters, orchestrator, SSRF-safe fetcher, rate limiter, config
  src/lib/              matching engine, hybrid matching, query selection, citations, import, exports
  src/components/       user interface
  src/workers/          embedding worker
.github/workflows/      CI
origincheck.py          command-line tool
prose-inspector/        Streamlit app that reports sentence rhythm, stock phrases and repetition (analysis only)
requirements.txt        python-docx, pypdf
example/                sample document, sources, CLI report and screenshot
```
