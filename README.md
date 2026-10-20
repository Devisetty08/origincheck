# origincheck: a local Turnitin-style similarity checker

origincheck checks a document against your reference files (and optionally the web). It produces a colour-coded HTML report with:
- a similarity index (%)
- a numbered source list with the % from each source
- each matching passage highlighted in its source's colour

Everything runs on your own laptop. Nothing is uploaded anywhere unless you turn on `--web`.

## Setup (Windows, macOS or Linux)

```
pip install -r requirements.txt
```

## Basic use

1. Put the papers, web articles (saved as .html or .pdf) and docs you used into a folder, for example `references\`.
2. Run:

```
python origincheck.py "My Dissertation.docx" --sources references
```

3. Open `My Dissertation_similarity.html` in your browser.

Supported formats: **.docx, .pdf, .txt, .md, .html/.htm, .rtf**. These work both for the document you check and for the sources. Scanned PDFs need OCR first.

## Turnitin-style options

| Option | What it does |
|---|---|
| `--exclude-quotes` | Ignores text inside quotation marks (properly quoted material) |
| `--exclude-bib` | Ignores everything after a "References" / "Bibliography" heading |
| `--min-words 8` | Ignores matches shorter than N words (Turnitin's "exclude small matches") |
| `--exclude-source-pct 1` | Drops sources that contribute less than N% |
| `--ngram 5` | Fingerprint size. Lower values are stricter and catch lightly edited copying |
| `-s folder` (repeatable) | Adds more source folders |
| `--save-to-repo` | Saves this document to `repository/` so later drafts or other documents are checked against it (like Turnitin's student-paper repository) |
| `--no-repo` | Skips the repository for this run |
| `--web --web-queries 15` | Also searches the internet (see below) |
| `--json` | Also writes a machine-readable result |
| `-o report.html` | Sets the report file name |

A typical dissertation check:

```
python origincheck.py "Dissertation.docx" -s references --exclude-quotes --exclude-bib --min-words 8 --exclude-source-pct 1
```

## Internet check (optional)

origincheck can search distinctive sentences from your document on the web, fetch the result pages and compare against them. This uses the Brave Search API (it has a free tier). Get a key at https://brave.com/search/api/, then:

```
set BRAVE_API_KEY=your_key          (Windows cmd)
$env:BRAVE_API_KEY="your_key"       (PowerShell)
export BRAVE_API_KEY=your_key       (macOS/Linux)

python origincheck.py "Dissertation.docx" -s references --web --web-queries 25
```

## How it works

origincheck uses the same core idea as Turnitin and MOSS:
1. Both texts are split into overlapping 5-word fingerprints.
2. Shared fingerprints are found.
3. Adjacent hits are merged into passages.
4. Passages shorter than `--min-words` are dropped.
5. Each matched word is credited to one source only, so source percentages add up to the overall index.

## Limits compared with real Turnitin

- **The database is the big difference.** Turnitin compares against billions of web pages, journals and past student papers. origincheck only knows your folders, its repository and whatever the web search finds. Your university's report can still show matches this tool doesn't.
- **It finds copied or lightly edited wording, not heavy paraphrase.** Turnitin's main score works the same way.
- **There is no AI-writing detection.** AI detectors are unreliable and produce false positives on human writing, so this tool doesn't pretend to do it.

## Fixing what it flags

For each highlighted passage, do one of these:
- quote it and cite it
- rewrite the idea in your own words and still cite the source
- cut it if it isn't needed

Then re-run the check.
