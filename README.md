# origincheck

origincheck is a free, open-source writing checker. You give it an essay, report or thesis chapter, and it tells you three things:

- which parts match something already published (plagiarism check)
- where the spelling, grammar or style needs work
- how likely the text is to be machine-written, if you switch that on

Then it helps you fix what it found. You can quote and cite a matched passage, rewrite it in your own words, or tidy up your own sentences.

Your document stays in your browser. When origincheck searches the web or journals, it sends a few short phrases, never the whole document.

A word of caution: these scores are signals, not proof. A match can be a properly quoted line or a common phrase, and AI detectors are wrong often, especially on formal, technical or non-native English writing. The app says this next to every score, and so do we.

![The overview page with the plagiarism, grammar and AI indicator scores](example/screenshot.png)

## What it can do

- **Find copied and reworded text.** It matches your document against your own sources, the web, journals, books and your earlier drafts. It reports exact copying, lightly edited copying and reworded passages (same meaning, different words) separately, and it can catch text translated from an English source.
- **Search about 20 public sources** at once, including Wikipedia, Crossref, OpenAlex, PubMed, arXiv, Semantic Scholar, CORE, Open Library and Project Gutenberg (a few need a free key), and show which ones found something, which found nothing and why.
- **Help you fix each match** by quoting and citing it, citing a paraphrase, rewriting it in your own words with a closeness meter and the source hidden, or removing it. It then re-checks the passage straight away.
- **Check one paragraph sentence by sentence** (Paragraph check) for copied wording, patchwriting, uncited quotations and ideas, long or heavy quoting, and citations that are missing or in the wrong style. It adds quotation marks, citations and the reference list for you.
- **Check your referencing:** citations with no reference entry, entries never cited, claims such as statistics with no citation, and quotations of 40 words or more. It formats citations and reference lists in APA 7, Harvard and IEEE.
- **Check spelling, grammar, punctuation and style** on your own device, with readability, tone, and definitions and synonyms for any word.
- **Estimate how likely text is to be machine-written,** if you switch it on, sentence by sentence and with the reasons, always marked as a signal rather than a verdict.
- **Record how you wrote a document** (writing history), so you can show your process if your work is questioned.
- **Point out confidential names** you list, such as your employer, clients or internal systems, and rank your sections so you fix the worst ones first.
- **Keep your own reference library** of books and papers you own (PDF, EPUB, Word), your Zotero items, a .bib or .ris export, and free open-access or public-domain books, and compare every check against it.
- **Give you reports and files:** a PDF or HTML originality report, a corrected .docx, and the paragraph with its references.
- **Work from the command line** for batches of documents, with the same matching as the web app.

## What it can't do

- **It can't see private databases.** Paid plagiarism services also compare against private collections of journals, web archives and past student papers. origincheck only searches public sources, so your institution's report may find matches this one doesn't. The optional Copyleaks scan narrows the gap.
- **It can't prove plagiarism or AI use.** A match can be a properly quoted line or a common phrase. AI detection is often wrong, especially on short, formal, technical or non-native English text. Every score is a signal for a person to judge.
- **It won't write your text for you, and it won't hide where text came from.** It has no paraphraser for copied text, no "humanizer" and no way to get past AI detectors. When a passage is too close to a source, you rewrite it yourself. The AI suggestions on the Rewrite page are only for your own sentences, and any you keep are labelled AI-assisted.
- **It can't know what you read or what your institution allows.** It can't tell whether you read a source you cite, whether a claim is common knowledge, or what your course's rules on AI and reuse are. It tells you where to look; you make the call.
- **It doesn't search every sentence.** By default it searches 8 phrases per document. For long documents, raise "Passages searched per run" in Settings.
- **It can't read paywalled papers.** They're matched on their abstracts only. If you have the full text, add it as a source.
- **It won't get you copies of copyrighted books.** Book search adds full texts only for open-access and public-domain books. For the rest it shows where to borrow or buy them, and you add the copy you own. DRM-protected e-books can't be read.
- **Some checks are English only.** Grammar, tone and OCR work in English. Other languages are detected and skipped, with a note. OCR also covers only the first 30 pages, and poor scans can be misread.
- **It only catches translation if a translation server is set up,** and only for documents in Latin script or Korean.
- **It can't run as a static website,** such as GitHub Pages. Searching and lookups go through its own server, which keeps API keys safe, so it needs Node.js or a host such as Vercel.

## What's different about it

Most plagiarism and writing tools give you a score, or offer to reword your text until the score drops. origincheck is built around a different idea: it helps you make the work genuinely yours and shows you how close you are.

- **It's free and open source.** Anyone can read how the scores are calculated (the formulas are [below](#how-the-scores-work)), run it on their own computer, or host it.
- **Your document stays with you.** Matching, grammar, OCR, language detection and the AI indicator all run in your browser. Searches send only short phrases, and every outside service is named before anything is sent. The default Rewrite model runs on your own computer too.
- **It teaches the fix instead of hiding the problem.** When you rewrite a copied passage, the source is hidden and a meter tells you as you type whether your wording is still too close. Paragraph check goes further: it fixes the mechanics (quotation marks, citations, references, grammar) and leaves the wording to you, with questions about your own work instead of sample sentences.
- **It catches patchwriting and reworded copying,** not just identical text. It compares meaning with a language model on your device, and word stems and word order sentence by sentence.
- **It checks referencing as well as wording:** missing citations, mismatched reference lists, citation style, and claims that need a source.
- **It gives you evidence of your own process.** The writing history records what you typed, pasted or accepted from AI, stays in your browser, and can be exported if you're ever asked how you wrote something.
- **It's honest about its limits.** It shows which services it searched and which failed, never presents a score as proof, and says plainly what it can't see.
- **It won't run up costs without asking.** Paid services are off by default, and each has a monthly cap that is checked before every call.

## Getting started

You need [Node.js 22](https://nodejs.org/).

```
git clone https://github.com/Devisetty08/origincheck.git
cd origincheck/web
npm ci
npm run dev
```

Open http://localhost:3100 and drop in a document. The plagiarism check, grammar check and the free sources work straight away. You don't need any keys to try it.

## What's in the app

**Check document.** Upload a .docx, .pdf, .txt, .md, .html or .rtf file, or paste text. Scanned PDFs are read with OCR in the browser. All the checks start at once, and the overview shows the scores with a short "what to do next" list.

**Plagiarism check.** Your document with every matching passage highlighted and numbered by source, a ranked list of sources, and each source passage shown next to yours. There are three kinds of match:

| How it looks | What it means | Counts towards the % |
|---|---|---|
| Solid highlight | Exact match, same wording | Yes |
| Dotted orange underline | Slightly changed, a few words swapped | No, listed separately |
| Double purple underline | Reworded, same meaning in different words | No, listed separately |

For each match you can mark it as quoted and cited, cite the source, rewrite it in your own words, or remove it. When you rewrite, the source text is hidden and a meter tells you whether your version is still too close. Citations come in APA 7, Harvard and IEEE.

If you're short on time, start with "Fix these sections first", which ranks your sections by how much of each matches a source. The Citations tab checks the rest of your referencing:

- in-text citations with no reference-list entry, and entries you never cite
- quotations with no citation, quotations of 40 words or more, and text that is mostly quotes
- claims that usually need a source, such as statistics, "studies show" or "according to", with no citation (your own findings, written with "we" or "our", are left alone)
- matched sources you never cite

**Rewrite.** Your document with every sentence that matches a source highlighted in red, plus the similarity score. Click a red sentence to see the source wording and fix it right there: quote and cite it, rewrite it yourself, or remove it. After each fix the passage is checked again. Click any of your own sentences (or switch to whole paragraphs) to get a rewrite suggestion: clearer, shorter, more formal, more casual, plain language, or without filler. You see your original next to the suggestion and keep only the changes you like.

The AI won't reword the red sentences. Rewording copied text is still copying, so those you quote, cite or rewrite yourself. There's also no "humanize" or "beat the AI detector" mode, and there won't be.

**Write.** A built-in editor where every check updates as you type. It can keep a writing history (see below). Next to the editor is a list of the passages that match a source. Pick one and it's selected in the editor, ready for you to rewrite in your own words. While you type, a meter shows whether your version is still too close to the source (the source wording stays hidden unless you ask for it) and whether the passage still matches. When it no longer matches, add the citation with one click.

**Paragraph check.** Paste one paragraph and the source it's based on, and fix it sentence by sentence until every sentence is either your own wording with a citation or a properly quoted and cited passage. See [Paragraph check](#paragraph-check) below.

**Grammar.** Spelling, grammar, punctuation and style, checked on your own device. Each suggestion has Accept and Dismiss. You also get definitions and synonyms for any word, a readability score, the tone of the text, and a corrected .docx.

**AI indicator.** Off by default. When on, it estimates how likely the text is machine-written, shows a sentence-by-sentence heatmap and explains why. It's an estimate, never a verdict.

**My library.** Your own reference books and papers, kept in your browser and compared in every check, so copying from a book you own is caught even when it isn't online. Open it from the books icon at the top. You can add to it in four ways:

- **Your files:** books and papers you own, as PDF, EPUB, Word and other formats. E-books with DRM can't be read; use a DRM-free copy.
- **Find a book:** search by title, author or subject. A full text is added only when there's a free, legal copy: an open-access book (through OpenAlex), a public-domain scan on the Internet Archive, or Project Gutenberg. For other books you get links to borrow it (Open Library), find it in a library near you (WorldCat) or preview it (Google Books).
- **A reference file:** a .bib or .ris export from Zotero, Mendeley, EndNote and others. Each reference is looked up and its free full text added when there is one. The rest are listed with where to find a copy.
- **Zotero:** with your own Zotero key (Settings, My library), import items along with the full text Zotero has indexed from the PDFs in your library. This only works when origincheck runs on your own computer.

Paragraph check can use any book in your library as a source, too.

**Will it get me a copy of any book?** No. It never downloads copyrighted books, and it won't use sites that share them without permission. For a book that isn't free, add the copy you own, or paste the passage you used.

**History.** Your scores across drafts, with a chart.

**Download report.** A PDF originality report: a cover page, your document with matches highlighted in each source's colour, the similarity index with its breakdown (internet, publications, your own sources, saved papers), the top sources, the settings used, and a page on grammar, the AI indicator and writing history. There's an interactive HTML version too. Documents in non-Latin scripts such as Korean get the HTML version, because the PDF fonts can't draw them.

![The plagiarism report with highlighted matches and the source list](example/screenshot-plagiarism.png)

## Paragraph check

Paragraph check is for one paragraph at a time: a literature-review paragraph, say, or a section of a report built on one or two sources. You paste the paragraph, add its sources, and it shows each sentence with a status:

| Status | Meaning |
|---|---|
| 🟢 Original | Your own wording, cited where it needs to be |
| 🟡 Needs citation | Your own wording, but it draws on a source and has no citation |
| 🟠 Quoted | Quoted and cited. Fine, but it counts towards the quoting limit |
| 🔴 Too close | Copied wording or patchwriting |

Each status comes with an icon and a label, not just a colour.

You can add sources by pasting text, uploading a file, or entering a DOI (Crossref, plus a free legal copy from Unpaywall when there is one), an ISBN (Open Library, then Google Books) or a Wikipedia link. "Find possible sources" is off by default. When you turn it on, it sends a few short phrases from your paragraph to Wikipedia, Crossref and OpenAlex and offers what it finds. Citation details are filled in from the lookups, and you can correct them.

### The rules

| Check | What it looks for | Severity |
|---|---|---|
| Copied wording | 6 or more words in a row that match a source and aren't in quotation marks | Error |
| Patchwriting | Not copied word for word, but too close to one source sentence: the same content words (stemmed, stop words removed) in much the same order, or 60% of the sentence's content words taken from one source sentence | Error |
| Quote without citation | A quotation with no citation in the same sentence or the next | Error |
| Borrowed idea without citation | A sentence that draws on a source, even rewritten, with no citation | Error |
| Quote too long | A quotation longer than 40 words (you can change the limit) | Warning |
| Too much quoting | More than 30% of the paragraph inside quotation marks | Warning |
| Citation without reference | An in-text citation that doesn't match any of your sources | Warning |
| Citation format | A citation in the wrong style, for example "(Microsoft 2024)" in APA, which wants "(Microsoft, 2024)" | Warning |
| Grammar and spelling | Harper, on your device | Suggestion |

Technical terms you list, such as "Azure Database for PostgreSQL flexible server", are never counted as borrowed wording. Cited quotations are never counted as copied.

### What it fixes for you, and what you write

It fixes the mechanical things in one click, always with a preview first, and you can undo any of them:

- **Quote and cite** puts the copied words in quotation marks and adds the citation (with a page number if you give one).
- **Add citation** puts the citation at the end of the sentence, before the full stop.
- **Fix citation format** rewrites a citation into your chosen style.
- **The reference list** is built for every source you cite, with [citation-js](https://github.com/citation-js/citation-js) and the official CSL styles for APA 7, Harvard (Cite Them Right) and IEEE. If a style can't load, origincheck's own templates are used.
- **Grammar suggestions** are accepted one at a time, or all spelling fixes at once.

The new wording is yours to write. When a sentence is too close, **Rewrite in my own words** opens an editor. The source is hidden unless you ask to see it, and a meter tells you as you type whether your sentence is Too close, Borderline or Original wording. The citation is kept, because rewritten ideas still need one. The only help it gives is questions about your own work ("How did this apply in your project?", "What result or decision followed from this?"), never sample sentences.

Paragraph check never generates replacement wording. There's no paraphraser, no "rewrite for me" button, no synonym swapping, no AI humanizer, and no language model writing sentences. The only automatic changes are quotation marks, citations, reference entries, and grammar and spelling fixes you accept yourself. This is deliberate: a paragraph is only non-plagiarised if the wording is genuinely yours, and text a tool rewords for you isn't.

Two other parts of origincheck can change your wording, and both are outside Paragraph check: the AI suggestions on the Rewrite page (for your own sentences only, never for text that matches a source, and labelled AI-assisted when kept), and the synonym list in the Grammar page's word lookup.

When you're done, you get the final paragraph and its references, each with a Copy button, a before-and-after summary, and exports as .docx, .txt or a small HTML report. Recent checks can be saved in your browser. Your paragraph is never sent anywhere unless you turn on "Find possible sources" or look up a DOI.

Shortcuts: Ctrl+Enter checks now, Alt+↓ and Alt+↑ move between issues, and Ctrl+Z and Ctrl+Y undo and redo.

From the plagiarism report, **Fix in Paragraph check** opens a flagged passage's paragraph there, together with its source.

## Where it searches

When you add a document, origincheck picks up to 8 short, distinctive phrases from it. It skips quotations, cited sentences and the bibliography. Then it searches:

- the web: Wikipedia, and web search through Tavily (free plan, no card needed) or, if you add a key, Brave, Jina or Google
- journals and papers: Crossref, OpenAlex, PubMed, arXiv, Semantic Scholar, CORE, Europe PMC, DataCite, OSF Preprints and INSPIRE-HEP, with Unpaywall finding free legal copies
- books: Open Library and Google Books
- classic books and poems: Project Gutenberg and PoetryDB

You can also add your own sources. Upload files, paste text, add a web page, or paste your reference list and let origincheck find the open-access copies. If a web page has gone, the latest copy from the Wayback Machine is used. The results page shows which services found something, which found nothing, and which couldn't search and why.

If you set up a translation server, documents in other languages are also searched in English, so text translated from an English source can still be caught.

At the bottom of the plagiarism page are two extras. Copyleaks (paid) scans the whole document against the web, journals and its own database of submitted papers, but only when you press its button and after a notice that the whole document will be sent. "Check externally" copies your text and opens Duplichecker or CopyKiller in a new tab, so you paste it in yourself. origincheck never sends anything to those sites.

## Rewrite setup

By default Rewrite uses Qwen2.5 7B, an Apache-2.0 model, running on your own computer through [Ollama](https://ollama.com/). It's free and your text never leaves your machine. To set it up once, install Ollama and run:

```
ollama pull qwen2.5:7b
```

It's about 4.7 GB. The first rewrite takes a minute or so while the model loads, and after that each one takes a second or two. We picked Qwen because in side-by-side tests it kept facts such as names, numbers and durations, where the smaller Phi-4-mini sometimes changed them. Still, read every suggested change before you keep it. You can choose any other Ollama model in Settings, or use Anthropic's Claude instead (paid, with a monthly cap).

Any change you keep is labelled AI-assisted in the writing history, the reports and the .docx properties.

### Using a free-model gateway (FreeLLMAPI or OmniRoute)

If your computer is too slow for a local model, Rewrite can use a free-model gateway that runs on your computer and passes each request to one of the free AI tiers you've signed up for: Gemini, Groq, OpenRouter, Mistral and others. Two open-source gateways work:

- [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) (MIT) rotates across about 34 free providers. Install the desktop app or run it with Docker, add your free provider keys on its Keys page, and copy the unified `freellmapi-…` key.
- [OmniRoute](https://github.com/diegosouzapw/OmniRoute) (MIT) is a gateway with a dashboard and automatic fallback. Install it with `npm install -g omniroute`, run `omniroute`, connect providers, and copy the key from its Endpoints page.

Then, in origincheck's Settings, set Provider to `gateway`, and fill in the gateway address (FreeLLMAPI `http://localhost:3001/v1`, or `http://localhost:31415/v1` for its desktop app; OmniRoute `http://localhost:20128/v1`), the key, and a model.

Before you switch, know what changes:

- **Your passage leaves your computer.** It goes to whichever free provider the gateway picks, and free tiers may keep or learn from what they receive. origincheck tells you this before the first request.
- **Pin a model.** With `auto`, a different model may answer each time, and smaller ones are more likely to change names and numbers. Choose one strong model in Gateway model, and read every change before keeping it.
- **Turn OmniRoute's prompt compression off for this.** It shortens text before it reaches the model, which would change the very passage you asked to have rewritten.
- **It's for personal use only.** FreeLLMAPI describes itself as "for personal experimentation and learning, not production", and each provider's own terms still apply. So origincheck refuses the gateway on a hosted deployment such as Vercel. Use Ollama or Anthropic there.
- **It's capped too:** 1,000 requests a month by default, so it can't use up your free quotas without you noticing.

## Writing history

The Write page can record how your document grows, so you can show your process if anyone asks. It's on by default. You'll see a "Writing history is on" notice and a switch to turn it off.

It saves a version after every 5-second pause (or when you press Save version) and notes where each part of the text came from: typed, pasted, AI-assisted or imported. You get a summary like "62% typed, 25% pasted, 13% AI-assisted" and a timeline to step through the versions. You can export it as PDF or JSON, or delete it whenever you like.

It never records keystrokes, takes screenshots, watches anything outside origincheck, or sends the history anywhere. It lives in your browser and nowhere else. The export says it's evidence of process, not proof of authorship on its own.

## Settings and API keys

Open Settings in the app, paste a key and press Save settings. Keys are saved on your computer in `web/.env.local`, which git ignores, and they work immediately. Once saved, the page only shows whether a key is set, never the key itself.

| Setting | What it gives you | Where to get it |
|---|---|---|
| Contact email | Fewer rate limits from Wikipedia, Crossref and OpenAlex | Your own email |
| Unpaywall email | Free legal copies of papers | Your own email |
| Tavily key (free, no card) | Web search | [tavily.com](https://www.tavily.com/) |
| Brave Search key (paid, optional) | More web search, capped at 800 searches a month | [brave.com/search/api](https://brave.com/search/api/) |
| Semantic Scholar key | Fewer rate limits from Semantic Scholar | [semanticscholar.org/product/api](https://www.semanticscholar.org/product/api) |
| CORE key (free) | CORE's open-access papers (it won't answer without one) | [core.ac.uk/services/api](https://core.ac.uk/services/api) |
| Google Books key (free) | Search inside millions of books | [Google Cloud console, Books API](https://console.cloud.google.com/apis/library/books.googleapis.com) |
| LibreTranslate server | Searching in English for documents in other languages | [Self-host](https://github.com/LibreTranslate/LibreTranslate) or [libretranslate.com](https://libretranslate.com/) |
| Ollama | Rewrite on your own computer (the default) | [ollama.com](https://ollama.com/) |
| Anthropic key (paid, optional) | Rewrite with Claude, capped at 500 requests a month | [console.anthropic.com](https://console.anthropic.com/) |
| Gateway address, key and model (optional, personal use) | Rewrite through FreeLLMAPI or OmniRoute on your own computer, capped at 1,000 requests a month | [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi), [OmniRoute](https://github.com/diegosouzapw/OmniRoute) |
| Copyleaks email and key (paid, optional) | The Copyleaks scan, capped at 20 scans a month | [copyleaks.com](https://copyleaks.com/) |
| Zotero user ID and key (free, optional) | Importing your Zotero library into My library (on your own computer only) | [zotero.org/settings/keys](https://www.zotero.org/settings/keys) |
| AI indicator | The AI-likelihood estimate | A switch in Settings |
| Confidential words | Flags names you shouldn't hand in, such as your employer, clients or internal systems, on the overview and the Write page | Type them in Settings (kept in your browser) |

### Keeping costs under control

Nothing that charges per use is on by default. Every paid service needs its own key and has a monthly cap: Tavily 900 credits, Brave 800 searches, Anthropic 500 requests, Copyleaks 20 scans. The free-model gateway is capped too (1,000 requests), so it can't drain your free quotas unnoticed. The count is checked before every call, retries included. When a cap is reached the call simply isn't made, and the service shows "cap reached". You can see usage and change the caps in Settings. Counts reset each month and are kept in `web/.data/usage.json`, which git ignores.

### The services' rules

| Service | Credit | Keeping results | Worth knowing |
|---|---|---|---|
| Brave Search | Optional, but if shown it must read "POWERED BY BRAVE" with Brave's logo. The app shows the text; add the logo from [Brave's brand page](https://brave.com/brand/) if you rely on the free credit. | Not allowed, so Brave results are never cached | Card required. Use beyond the free credit is billed. No redistributing results or training AI on them. |
| Tavily | Not required | No stated limit | The free plan stops at 1,000 credits rather than billing. Tavily may keep the queries it receives, so only short phrases are sent and the privacy notice says so. |
| Wikipedia | Article link and "Wikipedia contributors" (CC BY-SA), shown with every match | Cached for 1 hour | Needs a User-Agent with contact details |
| CORE | See [CORE's terms](https://core.ac.uk/terms) | Cached for 1 hour | Free key needed. Check the terms before commercial use. |
| Copyleaks | Not required | Scans are deleted after 24 hours and not indexed | Paid credits, results arrive by webhook |
| Anthropic | Not required | Not cached | Paid per request. Only the chosen passage is sent. |
| Crossref, OpenAlex, PubMed and the rest | Shown per source in the report | Cached for 1 hour | Contact email sent, rate limits respected |

## Privacy

Your document, saved documents, history and settings stay in your browser. Anything that has to leave it goes only after a notice telling you where.

| Feature | What's sent, and to whom |
|---|---|
| Searching sources | Up to 8 phrases of at most 16 words, to the sources you ticked. The server refuses anything longer. |
| Translated search | The same short phrases, to your translation server |
| Adding a web page or references | Only the addresses, DOIs and references you enter |
| Word lookup | The one word, to Datamuse, the Free Dictionary API, Wiktionary and Wikidata |
| My library | Your files stay in your browser. Book search sends what you type to OpenAlex, Open Library and the Internet Archive. A reference file sends its references, never your document. Zotero import uses your key to read your own library. |
| Paragraph check lookups | Only what you enter: a DOI (to Crossref and Unpaywall, through the server), an ISBN (to Open Library or Google Books) or a Wikipedia title. With "Find possible sources" on: up to 4 short phrases, to Wikipedia, Crossref and OpenAlex. |
| Scanned PDFs, language detection, tone | Nothing. These run in your browser. |
| Rewrite | Nothing with Ollama. With Anthropic, the passage you picked. With a free-model gateway, the passage you picked, to whichever free provider the gateway chooses. |
| Writing history | Nothing |
| LanguageTool (optional) | The document text, to the LanguageTool server you set up |
| Copyleaks (optional) | The whole document. It isn't added to their database and is deleted after 24 hours. |

The server never logs documents, strips keys from anything it logs, and limits how often each visitor can call it. The web-page fetcher refuses private and internal network addresses, even after redirects, and caps size, time and redirects.

## Putting it online

1. Import the repository in [Vercel](https://vercel.com/) and set the root directory to `web`.
2. Add your keys under Settings, Environment Variables. The names are in [`web/.env.example`](web/.env.example). On Vercel the in-app Settings page is read-only.
   Also add `ONNXRUNTIME_NODE_INSTALL` = `skip`. It stops the install from downloading GPU files the app never uses.
3. Deploy.

The rate limiter, search cache and pending Copyleaks scans live in memory, so each server instance has its own. For heavy public use, put Vercel's firewall in front and move Copyleaks scans to a shared store such as Upstash Redis. Copyleaks sends results to `PUBLIC_BASE_URL`; when running locally, use a tunnel such as `ngrok http 3100`.

## How the scores work

The similarity index is the number of exactly matched words divided by the words checked. Quotes and the bibliography can be left out. Under 15% shows green, 15 to 24% amber, 25 to 39% orange, and 40% or more red.

Matching works like this. The text is split into words and cut into overlapping 5-word fingerprints. Any word covered by a fingerprint that also appears in a source is marked, and runs shorter than 8 words are dropped. Each matched word is credited to one source, so the source percentages add up to the index. On top of that, MinHash finds likely sentence pairs: an edit-distance check (75% alike or more) confirms "slightly changed" ones, and multilingual sentence embeddings (cosine 0.80 or more) confirm "reworded" ones.

The writing score is `100 − (weighted issues per 100 words × 2)`, where errors count 3, warnings 1 and style suggestions 0.5.

The AI indicator is 60% a RoBERTa detector and 40% a language-model signal (how predictable the wording is, and how much that changes from sentence to sentence). Under 30 is low, 30 to 70 unclear, over 70 high. It needs at least 150 words.

## Command-line tool

`origincheck.py` checks a document against a folder of sources, which is handy for batch work. It uses the same matching as the web app and gives the same index for the same inputs.

```
pip install -r requirements.txt
python origincheck.py example/draft.docx -s example/references --exclude-quotes --exclude-bib
```

```
Similarity index: 47%
   25.7%  azure.txt
   21.0%  ora2pg.pdf
```

It writes a colour-coded HTML report, like [example/sample_report.html](example/sample_report.html).

| Option | What it does |
|---|---|
| `-s DIR` | Folder of sources, read recursively. Repeat it for more folders. |
| `-o FILE` | Where to write the report (default `<document>_similarity.html`) |
| `--exclude-quotes`, `--exclude-bib` | Ignore quoted text and the bibliography |
| `--min-words N`, `--ngram N` | Shortest match counted (default 8) and fingerprint size (default 5) |
| `--exclude-source-pct X` | Drop sources that contribute less than X% |
| `--web`, `--web-queries N` | Also search the web with Brave (needs `BRAVE_API_KEY`) |
| `--save-to-repo`, `--no-repo` | Keep this document for future comparisons, or skip them |
| `--json` | Also write a JSON summary |

## Prose Inspector

`prose-inspector/` is a small Streamlit app that looks at sentence rhythm, stock phrases and repetition in a piece of writing. It only reports; it doesn't rewrite anything.

```
pip install -r prose-inspector/requirements.txt
streamlit run prose-inspector/app.py
```

## Contributing

```
cd web
npm test                             # unit tests; every external API is mocked
npm run build && npx playwright test # end-to-end tests, desktop and mobile
npm run lint
```

CI ([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) runs lint, the type check, the unit tests, the build and the end-to-end tests on every push.

To add a search source, write an adapter in `web/src/server/adapters/` following `types.ts`. It needs an `id`, a `label`, a `group`, a minimum interval that respects the API's rate limit, `missing()` for required keys, and `search(query, { signal })`. Register it in `adapters/index.ts` and add tests to `adapters.test.ts` for success, no results, errors, rate limits and timeouts. Please only add APIs that are public and allow automated access.

```
web/                    the web app (Next.js)
  src/app/api/          server routes: search, fetch-url, references, doi, catalog, words,
                        languagetool, improve, paid, settings, config
  src/server/           source adapters, search orchestrator, safe page fetcher, rate limiter,
                        settings, usage caps, Copyleaks
  src/lib/              matching, hybrid matching, query selection, citations, import, exports
  src/lib/paragraph/    Paragraph check: sentences, rules, patchwriting, citations, fixes
  src/components/       the interface (Paragraph check in components/paragraph/)
  src/workers/          matching, embedding and AI-indicator workers
origincheck.py          command-line tool
prose-inspector/        Streamlit writing-pattern report
example/                sample document, sources, report and screenshots
```

## Credits

origincheck stands on a lot of open-source work, including [Harper](https://github.com/Automattic/harper), [Transformers.js](https://github.com/huggingface/transformers.js), [pdf.js](https://github.com/mozilla/pdf.js), [mammoth.js](https://github.com/mwilliamson/mammoth.js), [Readability](https://github.com/mozilla/readability), [Next.js](https://github.com/vercel/next.js) and [React](https://github.com/facebook/react). Matched Wikipedia text is CC BY-SA and is always shown with its article link. The full list, with versions and licences, is in [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
