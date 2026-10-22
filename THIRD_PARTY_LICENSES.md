# Third-party licences

origincheck uses the open-source components below. Versions are the ones pinned in `web/package-lock.json` at the time of writing. Licences are as declared by each project. See each project for the full licence text.

## Checks

| Component | Version | Licence | Used for |
|---|---|---|---|
| [Harper](https://github.com/Automattic/harper) (`harper.js`) | 2.13.0 | Apache-2.0 | Grammar checking on the device (WebAssembly) |
| [LanguageTool](https://github.com/languagetool-org/languagetool) | self-hosted server, not bundled | LGPL-2.1 (server software) | Optional extra grammar rules through origincheck's proxy; off unless the operator enables it |
| [Transformers.js](https://github.com/huggingface/transformers.js) (`@huggingface/transformers`) | 4.3.1 | Apache-2.0 | Running the paraphrase and AI-indicator models in the browser |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (`onnxruntime-web`, via Transformers.js) | 1.31.0-dev | MIT | Model inference |
| [Tesseract.js](https://github.com/naptha/tesseract.js) (`tesseract.js`) | 7.0.0 | Apache-2.0 | Text recognition (OCR) of scanned PDFs in the browser. Its engine and the English [tessdata](https://github.com/tesseract-ocr/tessdata) language file (Apache-2.0) download from a CDN on first use. |
| [franc](https://github.com/wooorm/franc) (`franc-min`) | 6.2.0 | MIT | Detecting the document's language on the device |
| [sentiment](https://github.com/thisandagain/sentiment) | 5.0.2 | MIT | Tone of the writing on the device. Uses the [AFINN-165](http://www2.imm.dtu.dk/pubdb/pubs/6010-full.html) word list by Finn Årup Nielsen (Open Database License 1.0). |

## Models (downloaded on first use, not bundled)

| Model | Licence | Notes |
|---|---|---|
| [onnx-community/roberta-base-openai-detector-ONNX](https://huggingface.co/onnx-community/roberta-base-openai-detector-ONNX) | MIT (from the original model) | ONNX conversion of [openai-community/roberta-base-openai-detector](https://huggingface.co/openai-community/roberta-base-openai-detector) (MIT). Used quantized (`model_quantized.onnx`, ≈126 MB). |
| [Xenova/distilgpt2](https://huggingface.co/Xenova/distilgpt2) | Apache-2.0 (from the original model) | ONNX conversion of [distilbert/distilgpt2](https://huggingface.co/distilbert/distilgpt2) (Apache-2.0). Used quantized (`decoder_model_merged_quantized.onnx`, ≈85 MB). |
| [Xenova/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/Xenova/paraphrase-multilingual-MiniLM-L12-v2) | Apache-2.0 (from the original model) | ONNX conversion of [sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2](https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2) (Apache-2.0). Used quantized (q8, ≈118 MB) for paraphrase detection. |
| [Qwen2.5-7B-Instruct](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct) (`qwen2.5:7b` in [Ollama](https://ollama.com/library/qwen2.5)) | Apache-2.0 | The default Rewrite model, run locally through Ollama (not bundled; downloaded by `ollama pull qwen2.5:7b`, ≈4.7 GB). |
| [Phi-4-mini](https://huggingface.co/microsoft/Phi-4-mini-instruct) (`phi4-mini`) | MIT | Optional smaller Rewrite model (set `OLLAMA_MODEL=phi4-mini`). |

## Documents and files

| Component | Version | Licence | Used for |
|---|---|---|---|
| [mammoth.js](https://github.com/mwilliamson/mammoth.js) | 1.13.0 | BSD-2-Clause | Reading .docx |
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 6.4.299 | Apache-2.0 | Reading .pdf |
| [docx](https://github.com/dolanmiu/docx) | 9.13.0 | MIT | Writing the corrected / revised .docx |
| [jsPDF](https://github.com/parallax/jsPDF) | 4.2.1 | MIT | Self-check summary PDF |
| [JSZip](https://github.com/Stuk/jszip) | 3.10.1 | MIT or GPL-3.0-or-later (used under MIT) | Reading Word document properties |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) | 6.3.0 | Apache-2.0 | Saved documents and history in the browser |
| [stemmer](https://github.com/words/stemmer) | 2.0.1 | MIT | Stricter matching mode, and Paragraph check's patchwriting rule (Porter stemmer) |
| [citation-js](https://github.com/citation-js/citation-js) (`@citation-js/core`, `@citation-js/plugin-csl`) | 0.9.0 | MIT | Paragraph check's reference list, formatted with CSL styles. The APA style ships with `@citation-js/plugin-csl`. |
| [CSL styles](https://github.com/citation-style-language/styles): Harvard Cite Them Right (`harvard-cite-them-right.csl`) and IEEE (`ieee.csl`) | copied into `web/public/csl/` | CC BY-SA 3.0 | Harvard and IEEE reference formatting in Paragraph check. © the Citation Style Language project and the styles' authors (named in each file). |

## Server

| Component | Version | Licence | Used for |
|---|---|---|---|
| [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript) (`@anthropic-ai/sdk`) | 0.137.0 | MIT | Improve my writing (Claude) |
| [ipaddr.js](https://github.com/whitequark/ipaddr.js) | 2.5.0 | MIT | Blocking private and internal addresses in the page fetcher |
| [Readability](https://github.com/mozilla/readability) (`@mozilla/readability`) | 0.6.0 | Apache-2.0 | Extracting the main text of fetched web pages |
| [linkedom](https://github.com/WebReflection/linkedom) | 0.18.13 | ISC | Server-side DOM for Readability and Europe PMC XML |
| [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) | 5.11.2 | MIT | Reading arXiv's Atom feed |
| [server-only](https://www.npmjs.com/package/server-only) | 0.0.1 | MIT | Keeping server modules out of the browser bundle |

## Matching and editing

| Component | Version | Licence | Used for |
|---|---|---|---|
| [fastest-levenshtein](https://github.com/ka-weihe/fastest-levenshtein) | 1.0.16 | MIT | Confirming near-verbatim matches |
| [jsdiff](https://github.com/kpdecker/jsdiff) (`diff`) | 9.0.0 | BSD-3-Clause | Word diff in Improve my writing |

## Interface

| Component | Version | Licence |
|---|---|---|
| [Next.js](https://github.com/vercel/next.js) | 16.4.2 | MIT |
| [React](https://github.com/facebook/react) / React DOM | 19.3.0 | MIT |
| [Tailwind CSS](https://github.com/tailwindlabs/tailwindcss) | 4 | MIT |
| [Radix UI](https://github.com/radix-ui/primitives) (`radix-ui`, the base of Origin UI components) | 1.8.1 | MIT |
| [Origin UI](https://github.com/origin-space/originui) (component patterns) | — | MIT |
| [Lucide](https://github.com/lucide-icons/lucide) (`lucide-react`) | 1.60.0 | ISC |
| [Recharts](https://github.com/recharts/recharts) | 3.10.1 | MIT |
| [Motion](https://github.com/motiondivision/motion) | 14.4.0 | MIT |
| [Inter](https://github.com/rsms/inter) and [Source Serif 4](https://github.com/adobe-fonts/source-serif) fonts (via `next/font`) | — | SIL Open Font License 1.1 |

## Online services and their content

These are called through public APIs under their own terms of service and are not bundled with origincheck: Wikipedia (MediaWiki API), Wiktionary, Wikidata, Crossref, OpenAlex, Unpaywall, Semantic Scholar, arXiv, CORE, Europe PMC, PubMed (NCBI E-utilities), DataCite, OSF Preprints (SHARE), INSPIRE-HEP, Open Library and the Wayback Machine (Internet Archive), Google Books, Project Gutenberg (its official catalogue and book texts), PoetryDB, Brave Search, Jina, Google Programmable Search (existing customers only), Datamuse, the Free Dictionary API, Tavily (default web search), LibreTranslate (optional), Copyleaks (paid, optional), Anthropic (optional) and Ollama ([MIT](https://github.com/ollama/ollama), runs locally).

- **Wikipedia** text is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). origincheck shows matched Wikipedia passages with the article link and "Wikipedia contributors" as the author, which is the attribution the licence asks for.
- **OpenAlex**, **Open Library** and **Wikidata** data are CC0; **Wiktionary** definitions are CC BY-SA, shown with their source; **arXiv** metadata is CC0; full texts keep their own licences (shown per paper by Unpaywall / Europe PMC where known).
- **Project Gutenberg** texts are public domain in the USA; the Project Gutenberg name is a trademark and is used only to identify the source.

Duplichecker and CopyKiller have no public API and are never called: the "Check externally" panel only opens them in a new tab.

## Software you can run alongside (not bundled)

origincheck talks to these over their APIs when you set them up; none of their code is included.

| Project | Licence | Used for |
|---|---|---|
| [Ollama](https://github.com/ollama/ollama) | MIT | Running the default Rewrite model on your own computer |
| [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate) | AGPL-3.0 | Optional translation server, for catching text translated from English |
| [FreeLLMAPI](https://github.com/tashfeenahmed/freellmapi) | MIT | Optional free-model gateway for Rewrite (personal use) |
| [OmniRoute](https://github.com/diegosouzapw/OmniRoute) | MIT | Optional free-model gateway for Rewrite (personal use) |

## Command-line tool

`origincheck.py` uses [python-docx](https://github.com/python-openxml/python-docx) (MIT) and [pypdf](https://github.com/py-pdf/pypdf) (BSD-3-Clause).
