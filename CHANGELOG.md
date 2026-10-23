# Changelog

All notable changes to origincheck. Dates are in YYYY-MM-DD form.

## v1.0.6 (2026-10-23)

- **The owner's accounts stay the owner's.** When phones or other computers on the same Wi-Fi use origincheck, Zotero import and the free-model gateway now only work on the computer running it, like Settings. Before, anyone on the network could browse the owner's Zotero library or use their free AI quota. Everything else works on every device.
- One shared check (`server/local.ts`) now decides "is this the computer itself?" for Settings, Zotero and the gateway, with its own tests.

## v1.0.5 (2026-10-23)

- **Phones and tablets work with `npm run dev`.** Opened from another device on the same Wi-Fi, the page loaded, but only "Check document" responded, because Next.js's development server blocked that device's requests for the page's code. Devices on private home networks (192.168.x.x, 10.x.x.x, 172.16–31.x.x, *.local) are now allowed. Settings still can only be changed on the computer itself.
- **README:** a "Use it on your phone or tablet" section, covering the Wi-Fi address, Windows' Private network setting and VPNs.

## v1.0.4 (2026-10-23)

- **CI in stages:** lint & type check, unit tests, security audit and a command-line tool check run in parallel. The app is then built once, and end-to-end tests run on that build for desktop and phone side by side. A failed end-to-end run keeps its HTML report.
- **Safer releases:** a release is published only when the changelog has notes for the version and every CI stage passes.

## v1.0.3 (2026-10-23)

- **Prose Inspector removed.** The separate Streamlit app (`prose-inspector/`) duplicated most of the Grammar page and wasn't used by the main app. Removing it means one app to install and run, with no Streamlit dependency. The command-line tool (`origincheck.py`) stays.

## v1.0.2 (2026-10-23)

- **No known vulnerabilities:** `npm audit` now reports 0, down from 5. The lint setup no longer uses `eslint-config-next`, whose Next.js plugin was the only route to the vulnerable `braces` package. The same TypeScript, React, React hooks and accessibility rules still run. Only the Next.js-specific ones are dropped (pages router, `<Head>`, `<Script>`, Google Fonts), which this app doesn't use.
- **README:** a step-by-step installation guide for Windows, macOS and Linux, troubleshooting for common problems, and a "How to use" walkthrough for each task.
- **`npm start` uses port 3100,** the same as `npm run dev`.

## v1.0.1 (2026-10-23)

Fixes and housekeeping after the first release.

- **Smaller hosted deployments:** the server no longer bundles the whole project. Two runtime file paths (the settings file and the usage caps) are now marked as data, so the build has no warnings.
- **Up-to-date wording:** labels and report text that still used old feature names now use the current ones (Search, Rewrite, sentence or paragraph).
- **Node 22 is declared** in `package.json`, so npm warns early when an older Node is used.
- **SECURITY.md** explains how to report a vulnerability privately.
- **Safer ignores:** a root `.env` (for command-line keys) and local copies of earlier versions can't be committed by accident.
- **README:** the release badge now always points to the latest release.

## v1.0.0 (2026-10-22)

The first public release: one app on your laptop to check writing for plagiarism, grammar and AI text, fix what it finds, and find the books and papers you need.

### Checking

- **Plagiarism check** against your own sources, the web, journals, books, your earlier drafts and your library. Exact, slightly changed and reworded matches are reported separately, and translated copying can be caught with a translation server.
- **About 20 public sources** searched with short phrases only: Wikipedia, Tavily web search, Crossref, OpenAlex, PubMed, arXiv, Semantic Scholar, CORE, Europe PMC, DataCite, OSF Preprints, INSPIRE-HEP, Open Library, Google Books, Project Gutenberg and PoetryDB. Brave, Jina, Google and Copyleaks are optional.
- **Grammar and style** on your device (Harper), with readability, tone, and definitions and synonyms.
- **AI indicator** (optional): a sentence-by-sentence estimate with reasons, always marked as a signal rather than a verdict.
- **Referencing checks:** missing and unused references, statistics and "studies show" claims without a source, and long or heavy quoting, in APA 7, Harvard and IEEE.
- **OCR** for scanned PDFs, **EPUB** reading, and **language detection**.

### Fixing

- **Fix each match** by quoting and citing it, citing a paraphrase, or rewriting it while a closeness meter tells you when it's your own wording, with the source hidden. Each fix is re-checked straight away.
- **Rewrite page:** matched sentences shown in red and fixed in place, plus rewrite suggestions for your own sentences, from a local model (Qwen2.5 7B through Ollama, by default), Anthropic, or a personal free-model gateway (FreeLLMAPI or OmniRoute).
- **Paragraph check:** sentence-by-sentence integrity rules, with one-click quotation marks, citations, reference lists (citation-js) and grammar fixes. It never writes wording for you.
- **Write page** with writing history, as evidence of how you wrote a document.
- **Confidential words**, and **"Fix these sections first"**.

### Finding sources

- **Find a book or paper:** search by title, author, words in the text, a citation, an ISBN or a DOI. Free, legal copies can be downloaded or read in the app; for other books, "Where to get it: free or paid?" lists options to read, borrow or buy.
- **My library:** your own books and papers (files, Zotero, .bib/.ris, free books), compared in every check.

### Reports and tools

- A PDF originality report, an interactive web report, corrected .docx, and Paragraph check exports.
- A command-line tool with the same matching, and Prose Inspector (Streamlit).
- Monthly caps on every paid service, and a privacy notice before anything leaves your browser.
- The MIT licence, and a full list of third-party licences.
