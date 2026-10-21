"use client";
// Harper grammar checking on the device (its WorkerLinter runs the WebAssembly in a Web Worker).
// Results are cached per paragraph, so after an edit only changed paragraphs are checked again.
import { type Issue, codePointToUtf16, harperKind, languageTool, likelyTerm, paragraphs } from "./grammar";

type Linter = import("harper.js").WorkerLinter;
let linter: Promise<Linter> | null = null;
const cache = new Map<string, Omit<Issue, "id">[]>(); // paragraph text → issues relative to the paragraph
const KIND = ["replace", "remove", "insertAfter"] as const;

function getLinter() {
  linter ??= (async () => {
    const { WorkerLinter, createBinaryModuleFromUrl } = await import("harper.js");
    // absolute URL: the linter's worker is a blob, so a relative path wouldn't resolve inside it
    const l = new WorkerLinter({ binary: createBinaryModuleFromUrl(new URL(`${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/harper_wasm_bg.wasm`, location.href).href) });
    await l.setup();
    return l;
  })();
  return linter;
}

/** Start loading Harper's WebAssembly while the page is idle, so the first check doesn't wait for it. */
export function warmGrammar() {
  const start = () => { getLinter().catch(() => { linter = null; }); };
  if ("requestIdleCallback" in window) requestIdleCallback(start, { timeout: 3000 });
  else setTimeout(start, 500);
}

async function lintParagraph(l: Linter, text: string) {
  const hit = cache.get(text);
  if (hit) return hit;
  const toU16 = codePointToUtf16(text);
  const byRule = await l.organizedLints(text, { language: "plaintext" });
  const out: Omit<Issue, "id">[] = [];
  for (const [rule, lints] of Object.entries(byRule))
    for (const lint of lints) {
      const span = lint.span(), start = toU16(span.start), end = toU16(span.end);
      const category = harperKind(lint.lint_kind())[0];
      let severity = harperKind(lint.lint_kind())[1];
      if (category === "spelling" && likelyTerm(text.slice(start, end), text, start)) severity = "style";
      out.push({
        start, end, rule, category, severity, engine: "harper", message: lint.message(),
        suggestions: lint.suggestions().slice(0, 5).map((s) => ({ text: s.get_replacement_text(), kind: KIND[s.kind()] ?? "replace" })),
      });
    }
  cache.set(text, out);
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
  return out;
}

/* LanguageTool (optional; sends text). Same per-paragraph cache, so an edit re-sends only the changed paragraphs. */
const ltCache = new Map<string, Omit<Issue, "id">[]>();

export async function languageToolCheck(text: string, opts: { url?: string; language?: string; onProgress?: (done: number, total: number) => void }) {
  const paras = paragraphs(text);
  const missing = [...new Set(paras.map((p) => p.text).filter((t) => !ltCache.has(`${opts.language}|${t}`)))];
  if (missing.length) {
    let combined = "";
    const starts: number[] = [];
    for (const t of missing) { starts.push(combined.length); combined += t + "\n\n"; }
    const found = await languageTool(combined, opts);
    const fresh = missing.map(() => [] as Omit<Issue, "id">[]);
    for (const i of found) {
      let k = starts.length - 1;
      while (k > 0 && starts[k] > i.start) k--;
      const { id: _id, ...rest } = i;
      void _id;
      fresh[k].push({ ...rest, start: i.start - starts[k], end: i.end - starts[k] });
    }
    missing.forEach((t, k) => ltCache.set(`${opts.language}|${t}`, fresh[k]));
  }
  const out: Issue[] = [];
  for (const p of paras)
    for (const x of ltCache.get(`${opts.language}|${p.text}`) ?? [])
      out.push({ ...x, start: p.start + x.start, end: p.start + x.end, id: `lt:${x.rule}:${p.start + x.start}:${text.slice(p.start + x.start, p.start + x.end)}` });
  return out;
}

export async function harperCheck(text: string, onProgress?: (pct: number) => void): Promise<Issue[]> {
  const l = await getLinter();
  const paras = paragraphs(text);
  const issues: Issue[] = [];
  for (const [i, p] of paras.entries()) {
    for (const x of await lintParagraph(l, p.text))
      issues.push({ ...x, start: p.start + x.start, end: p.start + x.end, id: `h:${x.rule}:${p.start + x.start}:${text.slice(p.start + x.start, p.start + x.end)}` });
    if (i % 10 === 0) onProgress?.(Math.round((100 * (i + 1)) / paras.length));
  }
  onProgress?.(100);
  return issues.sort((a, b) => a.start - b.start);
}
