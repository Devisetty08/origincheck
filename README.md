# origincheck

An open-source writing checker for students and teachers. Add a document and origincheck checks it for **plagiarism**, **grammar** and, if you turn it on, **AI-written text**, then helps you fix what it finds: quote and cite, rewrite in your own words, or polish your wording.

Your document is read and compared **in your browser**. Searches send only short phrases, never the whole document.

> **Scores are signals, not proof.** A match can be a properly quoted passage or common wording, and AI detectors are often wrong, especially on formal, technical or non-native-English writing. Every report says so.

![The overview: plagiarism, grammar and AI indicator scores with a "What to do next" list](example/screenshot.png)

## What it does

| Page | What you get |
|---|---|
| **Check document** | Add a file (.docx, .pdf, .txt, .md, .html, .rtf) or paste text. All checks start at once. The overview shows three scores and a **What to do next** list with one button per check. |
| **Plagiarism check** | A similarity report: your document with matching passages highlighted and numbered by source, a ranked source list, and each source passage side by side. |
| **Grammar** | Spelling, grammar, punctuation and style, checked on your device. Every suggestion is a card with **Accept** and **Dismiss**. Plus readability and a corrected .docx. |
| **Rewrite** | Click a paragraph, pick a mode (Clarity, Concise, Grammar only, Academic tone), compare your original with the suggestion, and keep only the changes you want. |
| **AI indicator** | Optional. An estimate of how likely the text is machine-written, with a sentence heatmap and the reasons. Never a verdict. |
| **History** | Every check's scores across drafts, with a chart. |
| **Settings** | Check options, plus the API keys and services the app uses. |

![The plagiarism report: highlighted matches and the source list](example/screenshot-plagiarism.png)

### Where it looks for matches

As soon as you add a document, origincheck picks up to 8 short, distinctive phrases from it (skipping quotations, cited sentences and the bibliography) and searches:

- **The internet:** Wikipedia (English, plus Korean for Korean text) and web search through Brave, Jina or Google.
- **Journals & publications:** Crossref, OpenAlex, arXiv, Semantic Scholar, CORE and Europe PMC, with Unpaywall finding free legal copies by DOI.
- **Books:** search inside books on Open Library.
- **Free classic books:** Project Gutenberg.

You can also add your own sources: upload files, paste text, add a web page, paste your reference list (origincheck finds the open-access full texts), or pick from free book lists. Each source type has a tick box to include or leave it out. The page shows which services found something, which found nothing, and which couldn't search and why.

Two optional extras sit at the bottom of the plagiarism page:

- **Copyleaks (paid):** scans the whole document against the web, journals and Copyleaks' database of submitted papers. It runs only when you press its button, after a notice that the whole document is sent.
- **Check externally:** copies your text and opens Duplichecker or CopyKiller (better for Korean) in a new tab. origincheck never sends anything to these sites itself.

### Three kinds of match

| Shown as | Meaning | Counted in the % |
|---|---|---|
| Solid highlight | **Exact match**: identical wording | Yes |
| Dotted orange underline | **Slightly changed**: a few words swapped or edited | No, listed separately |
| Double purple underline | **Reworded**: same meaning, different words | No, listed separately |

For each match you can **Mark as quoted & cited**, **Rewrite in my own words** (a closeness meter compares your new wording with the source as you type), **Cite this source** or **Remove** it. Citations come in APA 7, Harvard and IEEE.

### About Rewrite

Rewrite works only on your own document, one passage at a time, and only that passage is sent to the AI provider (Anthropic's Claude, or a free Ollama server on your computer).

- Paragraphs that match a source are **locked**: fix those yourself in the plagiarism check.
- Changes you keep mark the document **AI-assisted** in the HTML report and the .docx properties.
- There is no "humanize" or "avoid AI detection" mode, and there won't be.

## Run it on your computer

You need [Node.js 22](https://nodejs.org/).

```
git clone https://github.com/Devisetty08/origincheck.git
cd origincheck/web
npm ci
npm run dev
```

Open **http://localhost:3100**. Plagiarism, grammar and the free sources work straight away with no keys.

To turn on more, open **Settings** in the app, paste a key and press **Save settings**. Keys are saved on your computer in `web/.env.local` (never committed to git) and work immediately. After saving, the page only shows whether a key is set, never the key itself.

| Setting | What it turns on | Where to get it |
|---|---|---|
| Contact email | Fewer rate limits from Wikipedia, Crossref and OpenAlex | Your own email |
| Unpaywall email | Free legal copies of papers by DOI | Your own email (a real one) |
| Brave Search API key | Web search, the widest internet coverage | [brave.com/search/api](https://brave.com/search/api/) |
| Semantic Scholar API key | Semantic Scholar without constant rate limits | [semanticscholar.org/product/api](https://www.semanticscholar.org/product/api) |
| CORE API key (free) | CORE's open-access papers (it no longer answers without a key) | [core.ac.uk/services/api](https://core.ac.uk/services/api) |
| Anthropic API key | Rewrite with Claude | [console.anthropic.com](https://console.anthropic.com/) |
| Ollama server and model | Rewrite with a free model on your computer | [ollama.com](https://ollama.com/) |
| Copyleaks email and key | The paid Copyleaks scan | [copyleaks.com](https://copyleaks.com/) |
| AI indicator | The AI-likelihood estimate (off by default) | Switch in Settings |

## Privacy

Your document, saved documents, history and settings stay in your browser. Things leave it only after a notice naming where they go:

| Feature | What is sent, and where |
|---|---|
| Searching sources | Up to 8 phrases of at most 16 words each, to the sources you ticked. The server refuses anything longer. |
| Web page and reference import | Only the addresses, DOIs and references you enter. |
| Word lookup | The single word you look up, to Datamuse and the Free Dictionary API. |
| Rewrite | The passage you chose, to Anthropic or your Ollama server. |
| LanguageTool (optional) | The document text, to the LanguageTool server you set up. |
| Copyleaks (optional, on request) | **The whole document.** Compared but not added to any Copyleaks database; deleted after 24 hours. |
| Check externally | Nothing. You paste the text into the other site yourself. |

The server never logs documents, removes keys from any error it logs, and limits how often each visitor can call it. The web-page fetcher refuses private and internal network addresses, including after redirects, and caps size, time and redirects.

## Put it online (Vercel)

1. Import the repository in [Vercel](https://vercel.com/) and set **Root Directory** to `web`.
2. Add your keys under **Settings → Environment Variables** (the names are in [`web/.env.example`](web/.env.example)). On Vercel the in-app Settings page is read-only.
3. Deploy.

Things to know for a public deployment:

- The rate limiter, search cache and pending Copyleaks scans live in memory, so they are per server instance. For heavy public use, put Vercel's firewall in front and move Copyleaks scans to a shared store such as Upstash Redis.
- Copyleaks sends results to `PUBLIC_BASE_URL`, which defaults to your Vercel production address. When running locally, use a tunnel such as `ngrok http 3100`.

## How the scores are calculated

| Score | Calculation |
|---|---|
| **Similarity index** (0–100%) | Exactly matched words ÷ words checked (quotes and the bibliography can be excluded). Under 15% green, 15–24% amber, 25–39% orange, 40%+ red. |
| **Writing score** (0–100) | `100 − (weighted issues per 100 words × 2)`, with errors weighing 3, warnings 1 and style suggestions 0.5. |
| **AI indicator** (0–100) | 60% RoBERTa detector + 40% language-model signal (how predictable the wording is, and how much that varies between sentences). Low under 30, Unclear 30–70, High over 70. Needs at least 150 words. |

How matching works:

1. The text is split into words (Latin and Korean) and cut into overlapping 5-word fingerprints.
2. Every word covered by a fingerprint that also appears in a source is marked; runs shorter than 8 words are dropped.
3. Each matched word is credited to one source, so the source percentages add up to the index.
4. On top of that, MinHash/LSH finds candidate sentence pairs. An edit-distance check (75% or more alike) confirms **slightly changed** ones. Multilingual sentence embeddings (cosine 0.80 or more) confirm **reworded** ones.

## Limits

- **Not a commercial database.** Commercial plagiarism services compare against private databases of web pages, journals and past student papers. origincheck searches public sources, so your institution's report can show matches this doesn't. The paid Copyleaks option narrows the gap.
- **Searches are sampled.** Up to 8 phrases per document by default. Raise **Passages searched per run** in Settings for long documents.
- **Paywalled papers** are matched on their abstracts only. Add the file yourself if you have it.
- **Grammar is English-only** (Harper). Other languages are detected and skipped, with a note.
- **AI detection is unreliable**, as the app says next to every score.
- **Scanned PDFs** have no text. Run OCR on them first.

## If a passage is flagged

- **Quote and cite**: put the exact words in quotation marks and cite the source.
- **Rewrite and cite**: explain the idea in your own words and still cite the source.
- **Cut** it if your work doesn't need it.

## Command-line tool

`origincheck.py` checks a document against a folder of sources, for batch work and large source folders. It uses the same matching as the web app and gives the same index on the same inputs.

```
pip install -r requirements.txt
python origincheck.py example/draft.docx -s example/references --exclude-quotes --exclude-bib
```

```
Similarity index: 47%
   25.7%  azure.txt
   21.0%  ora2pg.pdf
```

It writes a colour-coded HTML report (see [example/sample_report.html](example/sample_report.html)).

| Option | What it does |
|---|---|
| `-s DIR` | Folder of sources, read recursively. Repeat for more folders. |
| `-o FILE` | Report path (default `<document>_similarity.html`). |
| `--exclude-quotes`, `--exclude-bib` | Ignore quoted text and the bibliography. |
| `--min-words N`, `--ngram N` | Shortest match counted (default 8) and fingerprint size (default 5). |
| `--exclude-source-pct X` | Drop sources contributing under X%. |
| `--web`, `--web-queries N` | Also search the web with Brave (needs `BRAVE_API_KEY`). |
| `--save-to-repo`, `--no-repo` | Keep this document for future comparisons, or skip them. |
| `--json` | Also write a JSON summary. |

## Prose Inspector

`prose-inspector/` is a small Streamlit app that reports sentence rhythm, stock phrases and repetition in a piece of writing. It only analyses; it doesn't rewrite.

```
pip install -r prose-inspector/requirements.txt
streamlit run prose-inspector/app.py
```

## For developers

```
cd web
npm test                             # unit tests (Vitest); every external API is mocked
npm run build && npx playwright test # end-to-end tests, desktop and mobile
npm run lint
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint, the type check, unit tests, the build and the end-to-end tests on every push.

**Adding a search source:** write an adapter in `web/src/server/adapters/` following `types.ts`. It needs an `id`, `label`, `group`, a minimum interval for the API's rate limit, `missing()` for required keys, and `search(query, { signal })`. Register it in `adapters/index.ts` and add success, empty, error, rate-limit and timeout tests to `adapters.test.ts`. Only add APIs that are public and allow automated access.

```
web/                    web app (Next.js)
  src/app/api/          server routes: search, fetch-url, references, doi, catalog, words,
                        languagetool, improve, paid, settings, config
  src/server/           source adapters, search orchestrator, safe page fetcher, rate limiter,
                        settings, Copyleaks
  src/lib/              matching engine, hybrid matching, query selection, citations, import, exports
  src/components/       user interface
  src/workers/          embedding worker
origincheck.py          command-line tool
prose-inspector/        Streamlit writing-pattern report
example/                sample document, sources, CLI report and screenshots
```

## Credits and licences

origincheck is built on open-source projects including [Harper](https://github.com/Automattic/harper), [Transformers.js](https://github.com/huggingface/transformers.js), [pdf.js](https://github.com/mozilla/pdf.js), [mammoth.js](https://github.com/mwilliamson/mammoth.js), [Readability](https://github.com/mozilla/readability), [Next.js](https://github.com/vercel/next.js) and [React](https://github.com/facebook/react). Matched Wikipedia text is CC BY-SA and is shown with its article link. The full list, with versions and licences, is in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
