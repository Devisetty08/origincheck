# origincheck

An open-source similarity checker and academic writing assistant. It finds passages in your document that share wording with your sources, explains why each one was flagged, and helps you fix it honestly: quote and cite, paraphrase and cite, or remove. The goal is a document where every borrowed idea is credited, not a score of 0%.

It comes in two versions that use the same matching method and give the same similarity index on the same inputs:

- **Web app** (`web/`): runs entirely in your browser. **Live: https://devisetty08.github.io/origincheck/**
- **Command-line tool** (`origincheck.py`): for batch checks, large source folders and an optional internet search.

![Report view of the web app](example/screenshot.png)

## Web app

Open https://devisetty08.github.io/origincheck/, add your document and your sources, and select **Run check**. Files are read in your browser and never uploaded.

**Similarity check**
- Reads .docx, .pdf, .txt, .md, .html/.htm and .rtf for the document and the sources, or pasted text. Scanned PDFs need OCR first.
- Turnitin-style split view: the document with matches highlighted and numbered in each source's colour, the similarity index, a breakdown by source type and a ranked source list.
- Click a highlight or **View matches** to compare your text with the source passage, then step through that source's matches.
- Filters: exclude quotes, the bibliography, matches under N words, sources under X%, or individual sources (their words go to the next best source).
- **Stricter mode** also flags lightly reworded copying (word stems and common synonyms) as "possible close paraphrase", shown separately and never counted in the index.

**Guided revision**
- For each flagged passage: **Quote and cite**, **Paraphrase and cite** or **Remove**. Each edit is re-checked straight away, with undo.
- The paraphrase editor hides the source while you write and shows a live closeness meter (**Too close / Borderline / Original wording**) with plain-language reasons such as "6 words in a row match the source". It gives advice, never replacement text.
- Progress shows how many flagged passages are resolved and how the index has changed.

**Citations**
- Record author, title, year, journal or publisher, DOI, URL and access date for each source. Details are pre-filled from Word and PDF metadata, or from the DOI.
- In-text citations and reference lists in **APA 7**, **Harvard** and **IEEE**.
- Citation checker: citations with no reference entry, entries never cited, quotations without a citation, and matched sources not cited anywhere.

**More**
- **Draft history**: every check is saved with its date, label, index and sources, with a chart across drafts and a list of passages resolved or introduced between two drafts. Earlier drafts of the same document are compared automatically and excluded from the index by default.
- **Self-plagiarism check**: mark saved documents as your own earlier work, and their matches are reported as a separate category.
- **Source import** (optional internet features): paste a reference list or DOIs to fetch open-access full text (Crossref, OpenAlex, Unpaywall, Europe PMC), or add a web page by URL. Entries that couldn't be retrieved are listed with a link.
- **Writing feedback** (advisory): reading ease, long sentences, passive voice, repeated words and inconsistent terminology.
- **Exports**: standalone HTML report, print or save as PDF, the revised document as **.docx** (headings kept, citations and missing reference entries added), and a **self-check summary PDF** recording what you reviewed and resolved.
- A short **guide to avoiding plagiarism**: when to quote, how to paraphrase and how to cite.
- Light and dark themes, keyboard accessible, works on phone-width screens.

**Privacy.** Documents are processed on your device. Saved documents, draft history and citation details stay in your browser (IndexedDB). You can export them to a file or delete them all in one step. Internet features are off by default. When on, they send only the DOIs, references and web addresses you enter, never your document. If a site blocks in-browser downloads, an optional reader service (r.jina.ai) is given the page address only.

**Not included, by design.** origincheck doesn't rewrite or "spin" text to lower the score, doesn't "humanize" AI-generated text, and doesn't do AI-writing detection (current detectors are unreliable and flag human writing).

### Developing and deploying the web app

Built with Next.js (static export), TypeScript, Tailwind CSS, Radix-based components in the Origin UI style, Lucide icons, Recharts, mammoth.js and pdf.js.

```
cd web
npm ci
npm run dev        # http://localhost:3000
npm run build      # static site in web/out
```

Deployment uses `.github/workflows/pages.yml`, which builds `web/` on every push to `main` and publishes it to GitHub Pages. One-time setup: in the repository, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.

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
- **Internet search in the web app.** A static site can't call a search API without exposing a key, so the web app adds internet sources by DOI, reference or URL instead. The CLI's `--web` option searches the web.
- **Blocked downloads.** Many publishers and websites block in-browser downloads. The optional reader service gets around most of these. Anything still blocked is listed so you can download it and add the file.
- **Copied wording, not heavy paraphrase.** It catches copied or lightly edited text. Turnitin's main score works the same way.
- **No AI-writing detection.** AI detectors are unreliable and flag human writing as AI-generated, so origincheck doesn't include one.
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
