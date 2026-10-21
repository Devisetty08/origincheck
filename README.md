# origincheck

An open-source similarity checker that works like Turnitin. It finds passages in your document that share wording with source documents you supply and reports a **similarity index**, a ranked list of matching sources and colour-coded highlights.

It comes in two versions that use the same matching method and give the same similarity index on the same inputs:

- **Web app**: one HTML page that runs entirely in your browser. **Live: https://devisetty08.github.io/origincheck/**
- **Command-line tool**: `origincheck.py`, for batch checks, large source folders and an optional internet search.

![Report view of the web app](example/screenshot.png)

## Web app

Open https://devisetty08.github.io/origincheck/, add your document and your sources, and select **Run check**. Files are read in your browser and never uploaded.

- Supports .docx, .pdf, .txt, .md, .html/.htm and .rtf, for the document and the sources. You can also paste text. A pasted source named with a URL is labelled "Internet".
- Turnitin-style split view: the document on the left with matches highlighted in each source's colour, and the similarity index, a breakdown by source type and a ranked source list on the right.
- Click a highlight or **View matches** to see the matching passage in the source, then step through the matches with ‹ ›.
- **Exclude source** removes a source and gives its words to the next best source. **Include again** undoes it.
- Filters: exclude quotes, exclude the bibliography, ignore matches under N words, exclude sources under X%, and change the fingerprint size.
- Save a checked document in your browser (localStorage) so later checks also compare against it, like Turnitin's student-paper repository.
- Download the report as a standalone HTML file, or print it or save it as a PDF.
- Light and dark themes.

### Hosting it on GitHub Pages

`index.html` is a static file with no build step. In the repository, go to **Settings → Pages → Build and deployment → Deploy from a branch**, pick **`main`** and **`/ (root)`**, then save. The site appears at `https://<user>.github.io/origincheck/` within a minute or two. You can also just open `index.html` locally in a browser.

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

- **The database.** Turnitin compares against billions of web pages, journals and past student papers. origincheck only knows the sources you give it, your saved documents and, in the CLI, what the web search finds. Your institution's report can show matches this tool doesn't.
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
index.html          web app (single file)
origincheck.py      command-line tool
requirements.txt    python-docx, pypdf
example/            sample document, sources, CLI report and screenshot
```
