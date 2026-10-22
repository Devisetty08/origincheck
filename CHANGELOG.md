# Changelog

All notable changes to origincheck. Dates are in YYYY-MM-DD form.

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
