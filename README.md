# origincheck

An open-source writing checker. Add a document and three checks run automatically:

- **Similarity**: finds passages that share wording with your sources and helps you fix them honestly. Quote and cite, rewrite in your own words and cite, or remove.
- **Grammar**: spelling, grammar, punctuation, style and clarity suggestions that you accept one at a time, plus readability.
- **AI indicator**: an estimate of how likely the text is to be machine-written. It is an indicator only, never proof.

It comes in two versions. The **web app** (`web/`) runs entirely in your browser: **https://devisetty08.github.io/origincheck/**. The **command-line tool** (`origincheck.py`) does similarity checks for batch work, large source folders and web search. Both use the same matching method and give the same similarity index on the same inputs.

![The origincheck report: similarity, grammar and AI indicator scores](example/screenshot.png)

## Web app

Drop in a document (.docx, .pdf, .txt, .md, .html, .rtf) or paste text. As soon as the text is read, the three checks start in parallel, each in its own Web Worker so the page stays responsive. A progress row shows each check's state, and results appear as they finish. The summary shows one card per check, for example "47% similarity · 7 grammar suggestions · AI indicator: Unclear". Each card opens its tab.

### Similarity

- Compares the document with the sources you add (files, pasted text, web pages, DOIs and reference lists), your saved documents, earlier drafts of the same document and, if you turn them on, web and book search results. With no sources, the card says "Add sources to run this check". The check runs as soon as a source is added, and the other two checks don't wait for it.
- Turnitin-style report: the document with matches highlighted and numbered by source, a ranked source list, the matching source passage side by side, and filters (exclude quotes, the bibliography, small matches, small sources, or a single source).
- For each match: **Mark as quoted & cited**, **Rewrite in my own words**, or **Remove**. The rewrite editor hides the source by default (with a "Show source" toggle), re-checks your version against the source as you type, and shows a closeness meter (Too close / Borderline / Original wording) with a plain-language reason. It never writes replacement text.
- Citations in APA 7, Harvard and IEEE; a citation checker; a stricter mode for lightly reworded copying (reported separately, never counted in the index).

### Grammar

- The document with issues underlined: wavy red for errors, solid amber for warnings and dotted blue for style, so the line style tells them apart as well as the colour.
- Click an underline for the message, its category and rule, and suggested replacements, with **Accept** (applies that one suggestion), **Ignore** and **Ignore rule**. A side list groups issues by category (spelling, grammar, punctuation, style, clarity) with next and previous buttons.
- **Accept all spelling fixes** is available. There is no "accept all" for style.
- **Edit text** lets you edit freely. After a pause, only the changed paragraphs are checked again and the score updates.
- Readability: Flesch reading ease, average sentence length, sentences over 35 words, passive voice and repeated words.
- Download the corrected document as .docx (headings and paragraphs kept) or .txt.

### AI indicator

> AI detection is unreliable. Formal, technical or non-native-English writing is often misjudged as AI. Use this as a prompt to review, never as proof. Your institution's tools may give a different result.

This caveat is always shown with the score. The tab has a sentence-level heatmap (tooltips, or "Show numbers", give each sentence's estimate, passage probability and perplexity) and a "Why this score" panel. Nothing in origincheck rewrites text to change this score.

### History, saved documents and exports

- **History** keeps every check's date, version label, the three scores and the source breakdown, with a chart of all three scores across drafts and a comparison of two drafts.
- **Saved documents** stay in your browser. Mark your earlier work to have matches reported as self-plagiarism. You can export everything to a file or delete it all in one step.
- **Download report** saves a standalone HTML file with the three scores, the similarity highlights, the grammar issue list and the AI heatmap. **Print / PDF** uses print styles.

## How the scores are calculated

| Score | Calculation |
|---|---|
| **Similarity index** (0–100%) | Matched words ÷ words not excluded (see [How the matching works](#how-the-matching-works)). Bands: under 15 green, 15–24 amber, 25–39 orange, 40+ red. |
| **Writing score** (0–100) | `max(0, 100 − weighted issues per 100 words × 2)`, with errors weighing 3, warnings 1 and style suggestions 0.5. Words not in Harper's dictionary count as warnings, since in academic writing they are often names or technical terms. Measured with Harper: the example draft scores 95, a Wikipedia article 90 and a messy student paragraph 41. |
| **AI indicator** (0–100) | 60% RoBERTa detector (length-weighted mean over 200–400-token passages) + 40% language-model signal. That signal is 60% perplexity (geometric mean over sentences: 100 or more scores 0, 25 or less scores 1, on a log scale) and 40% variation (the spread of log-perplexity across sentences: 0.75 or more scores 0, 0.35 or less scores 1). Labels: **Low** under 30, **Unclear** 30–70, **High** over 70. Documents under 150 words show "Not enough text to estimate". |

The AI weighting was calibrated on real model output. Six Wikipedia articles plus passages from Thoreau and Darwin scored 3–24. Four AI-written essays scored 21, 37, 84 and 93: the detector missed one completely, which is why the caveat matters. The scoring code and its tests are in [`web/src/lib/aiScore.ts`](web/src/lib/aiScore.ts).

## Components

| Check | Component | Runs |
|---|---|---|
| Grammar | [Harper](https://github.com/Automattic/harper) (`harper.js`, WebAssembly) | On your device |
| Grammar (optional) | [LanguageTool](https://github.com/languagetool-org/languagetool) public API or your own server | Online, **off by default** |
| AI indicator | [Transformers.js](https://github.com/huggingface/transformers.js) with [`onnx-community/roberta-base-openai-detector-ONNX`](https://huggingface.co/onnx-community/roberta-base-openai-detector-ONNX) and [`Xenova/distilgpt2`](https://huggingface.co/Xenova/distilgpt2), quantized, in a Web Worker | On your device. About 210 MB is downloaded the first time and then cached by the browser. It can be turned off in Settings. |
| Similarity | origincheck's own matching engine (`web/src/lib/similarity.ts`, same algorithm as `origincheck.py`) | On your device |

Both models are the ones named in the spec, and both are available and work with Transformers.js 4.3.1 (checked October 2026). The app also uses Next.js (static export), TypeScript, Tailwind CSS, Radix-based components in the Origin UI style, Lucide icons, Recharts, Motion, mammoth.js and pdf.js. Licences are listed in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## Privacy

Documents are processed on your device. Saved documents, draft history and citation details are stored in your browser (IndexedDB) and never leave it. Anything that sends data elsewhere is off by default, opt-in and labelled where you turn it on:

| Setting | What is sent, and where |
|---|---|
| LanguageTool | **Your document text**, in chunks, to LanguageTool's public API (or the server you enter). |
| Web search | Up to N short phrases (24 words each) to Jina Search, with your own key. |
| Books (Open Library) | Up to N short phrases to Open Library's search inside books. |
| Web page, DOI and reference import | Only the addresses, DOIs and references you type, to the page itself, Crossref, OpenAlex, Unpaywall or Europe PMC. An optional reader service (r.jina.ai) receives the page address only. |

The AI indicator downloads its models from Hugging Face, but your text never leaves your device.

## Developing and deploying

```
cd web
npm ci
npm run dev        # http://localhost:3100
npm test           # unit tests (Vitest)
npm run build      # static site in web/out (set BASE_PATH=/origincheck to match GitHub Pages)
npx playwright test   # end-to-end tests against the build (the AI models are mocked)
```

`.github/workflows/pages.yml` runs lint, the type check, the unit tests and the end-to-end tests on every push to `main`, then publishes `web/out` to GitHub Pages. One-time setup: **Settings → Pages → Build and deployment → Source → GitHub Actions**. GitHub Pages needs a public repository, or a paid plan for a private one.
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

A typical dissertation check:

```
python origincheck.py "Dissertation.docx" -s references --exclude-quotes --exclude-bib --min-words 8 --exclude-source-pct 1
```

### Internet check (optional)

`--web` picks up to N evenly spaced sentences of at least 12 words, searches the first 24 words of each as a quoted phrase with the [Brave Search API](https://brave.com/search/api/) (free tier available), downloads the top 3 results (HTML or PDF) and adds them as "Internet" sources. Requests are spaced about 1.1 s apart to stay within the free tier. If no key is set, the web check is skipped with a warning.

Windows cmd:

```
set BRAVE_API_KEY=your_key
```

PowerShell:

```
$env:BRAVE_API_KEY="your_key"
```

macOS / Linux:

```
export BRAVE_API_KEY=your_key
```

Then:

```
python origincheck.py "Dissertation.docx" -s references --web --web-queries 25
```

## How the matching works

1. **Tokenize.** Words are matched with `[A-Za-z0-9À-ɏ]+(?:['’][A-Za-z]+)?`, lowercased, with `’` normalised to `'`. Each word keeps its character offsets so highlights map back onto the original text.
2. **Fingerprint.** The text is cut into overlapping 5-word shingles.
3. **Match.** For each source, every document word covered by a shingle that also appears in that source is marked. Excluded words are skipped.
4. **Passages.** Marked words are joined into contiguous runs. Runs shorter than `min-words` (default 8) are dropped.
5. **Attribution.** Each matched word is credited to exactly one source, preferring the source with the most matched words overall, so the source percentages add up to the similarity index.
6. **Score.** Similarity index = matched words ÷ words not excluded, rounded to a whole percent.

Quotes, the bibliography, small matches and small sources can be excluded, as in Turnitin.

## Limits compared with real Turnitin

- **The database.** Commercial services compare against billions of web pages, journals and past student papers in private databases that origincheck can't search. origincheck only knows the sources you give it, your saved documents and drafts, imported open-access papers and, in the CLI, what the web search finds. Your institution's report can show matches this tool doesn't.
- **Internet search.** origincheck searches the open web with a search API (Jina in the web app, Brave in the CLI), using a key you supply. Google's Custom Search API is closed to new users and shuts down on 1 January 2027. Search finds pages that contain the same phrases, not a commercial service's private index.
- **Blocked downloads.** Many publishers and websites block in-browser downloads. The optional reader service gets around most of these. Anything still blocked is listed so you can download it and add the file.
- **Copied wording, not heavy paraphrase.** It catches copied or lightly edited text. Turnitin's main score works the same way.
- **AI indicator, not AI detection.** Detectors are unreliable, especially on formal, technical or non-native-English writing. origincheck shows an indicator with its reasons and a caveat, never a verdict, and never offers to rewrite text to change it. Turnitin's own AI detector uses different, private models, so its result can differ.
- **Scanned PDFs** have no text layer. Run OCR on them first.

## Fixing flagged passages

For each highlighted passage, do one of these, then check again:

- **Quote and cite**: put the exact words in quotation marks and cite the source.
- **Rewrite and cite**: explain the idea in your own words and still cite the source.
- **Cut** it if your work doesn't need it.

## Repository layout

```
web/                web app (Next.js, static export)
  src/lib/          matching engine, citations, closeness meter, writing feedback, import, exports
  src/components/   user interface
.github/workflows/  GitHub Pages deployment
origincheck.py      command-line tool
requirements.txt    python-docx, pypdf
example/            sample document, sources, CLI report and screenshot
```
