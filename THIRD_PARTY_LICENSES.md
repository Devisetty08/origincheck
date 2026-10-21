# Third-party licences

origincheck uses the open-source components below. Versions are the ones pinned in `web/package-lock.json` at the time of writing. Licences are as declared by each project. See each project for the full licence text.

## Checks

| Component | Version | Licence | Used for |
|---|---|---|---|
| [Harper](https://github.com/Automattic/harper) (`harper.js`) | 2.13.0 | Apache-2.0 | Grammar checking on the device (WebAssembly) |
| [LanguageTool](https://github.com/languagetool-org/languagetool) | public HTTP API, not bundled | LGPL-2.1 (server software) | Optional extra grammar rules; off by default, sends text when on |
| [Transformers.js](https://github.com/huggingface/transformers.js) (`@huggingface/transformers`) | 4.3.1 | Apache-2.0 | Running the AI-indicator models in the browser |
| [ONNX Runtime Web](https://github.com/microsoft/onnxruntime) (`onnxruntime-web`, via Transformers.js) | 1.31.0-dev | MIT | Model inference |

## Models (downloaded on first use, not bundled)

| Model | Licence | Notes |
|---|---|---|
| [onnx-community/roberta-base-openai-detector-ONNX](https://huggingface.co/onnx-community/roberta-base-openai-detector-ONNX) | MIT (from the original model) | ONNX conversion of [openai-community/roberta-base-openai-detector](https://huggingface.co/openai-community/roberta-base-openai-detector) (MIT). Used quantized (`model_quantized.onnx`, ≈126 MB). |
| [Xenova/distilgpt2](https://huggingface.co/Xenova/distilgpt2) | Apache-2.0 (from the original model) | ONNX conversion of [distilbert/distilgpt2](https://huggingface.co/distilbert/distilgpt2) (Apache-2.0). Used quantized (`decoder_model_merged_quantized.onnx`, ≈85 MB). |

## Documents and files

| Component | Version | Licence | Used for |
|---|---|---|---|
| [mammoth.js](https://github.com/mwilliamson/mammoth.js) | 1.13.0 | BSD-2-Clause | Reading .docx |
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 6.4.299 | Apache-2.0 | Reading .pdf |
| [docx](https://github.com/dolanmiu/docx) | 9.13.0 | MIT | Writing the corrected / revised .docx |
| [jsPDF](https://github.com/parallax/jsPDF) | 4.2.1 | MIT | Self-check summary PDF |
| [JSZip](https://github.com/Stuk/jszip) | 3.10.1 | MIT or GPL-3.0-or-later (used under MIT) | Reading Word document properties |
| [idb-keyval](https://github.com/jakearchibald/idb-keyval) | 6.3.0 | Apache-2.0 | Saved documents and history in the browser |
| [stemmer](https://github.com/words/stemmer) | 2.0.1 | MIT | Stricter matching mode |

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

## Online services (only when the user turns them on)

Crossref, OpenAlex, Unpaywall, Europe PMC, Open Library / Internet Archive, Jina (search and reader) and the LanguageTool public API are used under their own terms of service. They are not bundled with origincheck.

## Command-line tool

`origincheck.py` uses [python-docx](https://github.com/python-openxml/python-docx) (MIT) and [pypdf](https://github.com/py-pdf/pypdf) (BSD-3-Clause).
