// Copy runtime assets that must be served as files: the pdf.js worker and Harper's WebAssembly binary.
import { copyFileSync, mkdirSync } from "node:fs";

mkdirSync("public", { recursive: true });
copyFileSync("node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "public/pdf.worker.min.mjs");
for (const f of ["harper_wasm_bg.wasm", "harper_wasm_slim_bg.wasm"]) copyFileSync(`node_modules/harper.js/dist/${f}`, `public/${f}`); // harper.js loads both
