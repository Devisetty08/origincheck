"use client";
// Paragraph check exports: the corrected paragraph with its references (.docx, .txt) and a small HTML report.
import { STYLE_LABEL, type Style } from "../citations";
import { download, exportDocx } from "../exporters";
import type { RefEntry } from "./citations";
import type { Analysis, Status } from "./rules";

export const STATUS_TEXT: Record<Status, string> = { original: "Original", "needs-citation": "Needs citation", quoted: "Quoted", "too-close": "Too close" };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const exportParagraphDocx = (text: string, refs: RefEntry[], style: Style) =>
  exportDocx({ docName: "paragraph", fileName: "paragraph.docx", text, headings: new Map(), refs: refs.map((r) => r.segs ?? [{ t: r.text }]), style, hasBib: false });

export const paragraphTxt = (text: string, refs: RefEntry[]) => `${text.trim()}\n${refs.length ? `\nReferences\n${refs.map((r) => r.text).join("\n")}\n` : ""}`;
export const exportParagraphTxt = (text: string, refs: RefEntry[]) => download("paragraph.txt", paragraphTxt(text, refs), "text/plain");

export interface Summary { before: Record<Status, number>; after: Record<Status, number>; citationsAdded: number; grammarFixes: number }

export function paragraphReport(text: string, a: Analysis, refs: RefEntry[], style: Style, s: Summary) {
  const counts = (c: Record<Status, number>) => (Object.keys(STATUS_TEXT) as Status[]).map((k) => `${STATUS_TEXT[k]}: ${c[k]}`).join(" · ");
  const rows = a.sentences.map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.text)}</td><td class="${x.status}">${STATUS_TEXT[x.status]}</td><td>${x.issues.map((y) => esc(y.message)).join("<br>") || "—"}</td></tr>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Paragraph check report</title>
<style>body{font:15px/1.55 system-ui,sans-serif;max-width:860px;margin:2rem auto;padding:0 16px;color:#1b2a3a}h1{color:#0078d4}table{border-collapse:collapse;width:100%}td,th{border:1px solid #d6e3f0;padding:6px;vertical-align:top;text-align:left}
.original{color:#16a34a}.needs-citation{color:#b45309}.quoted{color:#ea580c}.too-close{color:#d13438}blockquote{background:#f3f8fd;margin:0;padding:12px;border-left:4px solid #0078d4}.note{color:#5a6b7d;font-size:13px}</style></head><body>
<h1>Paragraph check report</h1><p class="note">Made with origincheck on ${esc(new Date().toLocaleString())}. Citation style: ${STYLE_LABEL[style]}. Similarity checks are signals, not proof.</p>
<h2>Summary</h2><p><b>${esc(a.verdict)}</b></p><p>Before: ${counts(s.before)}<br>After: ${counts(s.after)}<br>Quoted: ${a.quotedPct}% of words · citations added: ${s.citationsAdded} · grammar fixes applied: ${s.grammarFixes}</p>
<h2>Final paragraph</h2><blockquote>${esc(text)}</blockquote>${refs.length ? `<h3>References</h3>${refs.map((r) => `<p>${esc(r.text)}</p>`).join("")}` : ""}
<h2>Sentences</h2><table><tr><th>#</th><th>Sentence</th><th>Status</th><th>Issues</th></tr>${rows}</table></body></html>`;
}
export const exportParagraphHtml = (...a: Parameters<typeof paragraphReport>) => download("paragraph_report.html", paragraphReport(...a), "text/html");
