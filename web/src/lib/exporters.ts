// Downloads: standalone HTML report (10.1), revised .docx (10.2), self-check summary PDF (10.3).
import type { Passage, Result, Settings, Source } from "./engine";
import { KIND_LABEL } from "./engine";
import { type Seg, type Style, STYLE_LABEL } from "./citations";

export const PALETTE = ["#d13438", "#0078d4", "#16a34a", "#ea580c", "#9333ea", "#0891b2", "#db2777", "#a16207", "#4f46e5", "#65a30d", "#0d9488", "#be123c"];
export const band = (i: number) =>
  i < 15 ? { label: "Low similarity", color: "#16a34a" }
  : i < 25 ? { label: "Moderate similarity", color: "#d97706" }
  : i < 40 ? { label: "High similarity", color: "#ea580c" }
  : { label: "Very high similarity", color: "#d13438" };
export const pctText = (p: number) => (p > 0 && p < 1 ? "<1%" : `${Math.round(p)}%`);

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export const baseName = (n: string) => n.replace(/\.[^.]+$/, "") || "document";

export function download(name: string, data: BlobPart, type: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([data], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function settingsText(s: Settings) {
  return `${s.ngram}-word fingerprints, matches under ${s.minWords} words excluded`
    + (s.quotes ? ", quotes excluded" : "") + (s.bib ? ", bibliography excluded" : "")
    + (s.dropPct ? `, sources under ${s.dropPct}% excluded` : "") + (s.strict ? ", stricter mode on" : "");
}

/** Document text with highlight markup; used by the HTML export. */
function markup(text: string, toks: { s: number; e: number }[], r: Result, num: Map<number, number>, color: Map<number, string>) {
  const close = new Map<number, Passage>();
  for (const p of r.close) close.set(p.b, p);
  let out = "", pos = 0;
  for (let i = 0; i < toks.length; ) {
    const sid = r.owner.get(i), c = close.get(i);
    if (sid !== undefined) {
      let j = i;
      while (j + 1 < toks.length && r.owner.get(j + 1) === sid) j++;
      out += esc(text.slice(pos, toks[i].s)) + `<mark style="--c:${color.get(sid)}"><sup>${num.get(sid)}</sup>${esc(text.slice(toks[i].s, toks[j].e))}</mark>`;
      pos = toks[j].e; i = j + 1;
    } else if (c) {
      out += esc(text.slice(pos, c.s)) + `<span class="cp" title="Possible close paraphrase">${esc(text.slice(c.s, c.end))}</span>`;
      pos = c.end; i = c.e;
    } else if (r.excl.has(i)) {
      let j = i;
      while (j + 1 < toks.length && r.excl.get(j + 1) === r.excl.get(i)) j++;
      out += esc(text.slice(pos, toks[i].s)) + `<span class="ex" title="Excluded: ${r.excl.get(i)}">${esc(text.slice(toks[i].s, toks[j].e))}</span>`;
      pos = toks[j].e; i = j + 1;
    } else i++;
  }
  return out + esc(text.slice(pos));
}

export function reportHtml(o: {
  docName: string; text: string; toks: { s: number; e: number }[]; r: Result; sources: Source[]; settings: Settings; checked: Date;
}) {
  const { r, sources } = o;
  const num = new Map(r.order.map((s, i) => [s, i + 1]));
  const color = new Map(r.order.map((s, i) => [s, PALETTE[i % PALETTE.length]]));
  const b = band(r.index);
  const byKind: Record<string, number> = {};
  for (const s of r.order) byKind[sources[s].kind] = (byKind[sources[s].kind] ?? 0) + r.counts.get(s)!;
  const rows = r.order.map((s) =>
    `<li><span class="n" style="background:${color.get(s)}">${num.get(s)}</span><div><div class="sn">${esc(sources[s].name)}</div>`
    + `<div class="sk">${KIND_LABEL[sources[s].kind]} · ${r.counts.get(s)} words</div></div><b>${pctText((100 * r.counts.get(s)!) / r.total)}</b></li>`).join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Similarity report – ${esc(o.docName)}</title>
<style>
:root{--bg:#f3f8fd;--card:#fff;--ink:#0f1f33;--mute:#4a5d75;--line:#dce7f2;--top:#0078d4;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#0b1522;--card:#111e2e;--ink:#e6eef8;--mute:#9fb3c8;--line:#22364d;--top:#0a2540;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 Inter,system-ui,"Segoe UI",sans-serif}
header{background:var(--top);color:#fff;font-weight:700;padding:12px 16px}
.wrap{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;max-width:1300px;margin:auto;padding:20px 16px}
@media (max-width:900px){.wrap{grid-template-columns:minmax(0,1fr)}aside{order:-1}}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px 24px;min-width:0}
h1{font-size:18px;margin:0 0 4px;overflow-wrap:anywhere}.meta{color:var(--mute);font-size:13px}
.doc{font:16px/1.75 "Source Serif 4",Georgia,serif;white-space:pre-wrap;overflow-wrap:anywhere;margin-top:14px}
mark{background:color-mix(in srgb,var(--c) 18%,transparent);color:inherit;border-bottom:2px solid var(--c);border-radius:2px}
mark sup{background:var(--c);color:#fff;font:700 10px/1 system-ui;padding:2px 4px;border-radius:4px;margin-right:2px}
.cp{border-bottom:2px dashed #9333ea}.ex{color:var(--mute);text-decoration:line-through;opacity:.8}
aside .card{position:sticky;top:16px}.idx{font-size:56px;font-weight:700;line-height:1;color:${b.color}}
ol{list-style:none;padding:0;margin:16px 0 0}li{display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid var(--line)}
li div{flex:1;min-width:0}.sn{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-weight:600}.sk{color:var(--mute);font-size:12px}
.n{color:#fff;font-weight:700;font-size:12px;min-width:22px;text-align:center;border-radius:5px;padding:2px 4px}
.foot{color:var(--mute);font-size:12px;margin-top:14px;border-top:1px solid var(--line);padding-top:10px}
</style></head><body><header>origincheck · Similarity report</header><div class="wrap">
<main class="card"><h1>${esc(o.docName)}</h1><div class="meta">${r.total} words checked · ${o.checked.toLocaleString()}</div>
<div class="doc">${markup(o.text, o.toks, r, num, color)}</div></main>
<aside><div class="card"><div class="meta">Similarity index</div><div class="idx">${r.index}%</div><div style="font-weight:700;color:${b.color}">${b.label}</div>
<div class="meta">${Object.entries(byKind).map(([k, v]) => `${KIND_LABEL[k as Source["kind"]]} ${pctText((100 * v) / r.total)}`).join(" · ") || "No matches"}</div>
<ol>${rows || "<li>No matching sources found.</li>"}</ol>
${r.close.length ? `<p class="meta"><span class="cp">Dashed</span>: ${r.close.length} possible close paraphrase passage(s), not counted in the index.</p>` : ""}
<div class="foot">Settings: ${esc(settingsText(o.settings))}. Sources compared: ${sources.length}.<br>Struck-through text was excluded.<br>
Matches show shared wording only. Quote and cite, or rewrite and cite. Made with origincheck — https://github.com/Devisetty08/origincheck</div></div></aside>
</div></body></html>`;
}

export async function exportDocx(o: { docName: string; text: string; headings: Map<string, "h1" | "h2" | "h3">; refs: Seg[][]; style: Style; hasBib: boolean }) {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } = await import("docx");
  const H = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3 };
  const paras = o.text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean).map((p) => {
    const h = o.headings.get(p.replace(/\s+/g, " "));
    return h ? new Paragraph({ text: p, heading: H[h] }) : new Paragraph({ children: p.split("\n").map((line, i) => new TextRun({ text: line, break: i ? 1 : 0 })) });
  });
  if (o.refs.length) {
    if (!o.hasBib) paras.push(new Paragraph({ text: "References", heading: HeadingLevel.HEADING_1 }));
    for (const ref of o.refs)
      paras.push(new Paragraph({
        children: ref.map((s) => new TextRun({ text: s.t, italics: !!s.i })),
        indent: o.style === "ieee" ? undefined : { left: 720, hanging: 720 },
      }));
  }
  const doc = new Document({
    creator: "origincheck",
    styles: { default: { document: { run: { font: "Calibri", size: 24 } } } },
    sections: [{ children: paras }],
  });
  download(`${baseName(o.docName)}_revised.docx`, await Packer.toBlob(doc), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

export interface SummaryRow { excerpt: string; source: string; status: string }

export async function exportSummaryPdf(o: {
  docName: string; checked: Date; startIndex: number; index: number; sources: Source[]; r: Result; settings: Settings;
  rows: SummaryRow[]; resolved: number; style: Style;
}) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight(), M = 48;
  let y = M;
  const need = (h: number) => { if (y + h > H - M) { pdf.addPage(); y = M; } };
  const line = (t: string, size = 10, bold = false, color: [number, number, number] = [15, 31, 51], indent = 0) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size).setTextColor(...color);
    for (const l of pdf.splitTextToSize(t, W - 2 * M - indent) as string[]) { need(size * 1.4); pdf.text(l, M + indent, y); y += size * 1.4; }
  };
  const gap = (h = 8) => { y += h; };

  pdf.setFillColor(0, 120, 212).rect(0, 0, W, 34, "F");
  pdf.setFont("helvetica", "bold").setFontSize(13).setTextColor(255, 255, 255).text("origincheck · Self-check summary", M, 22);
  y = 64;
  line(o.docName, 15, true);
  line(`Checked ${o.checked.toLocaleString()} · summary created ${new Date().toLocaleString()}`, 9, false, [74, 93, 117]);
  gap(10);
  line(`Similarity index: ${o.index}%  (${band(o.index).label})`, 13, true);
  if (o.startIndex !== o.index) line(`At the first check: ${o.startIndex}%`, 10);
  line(`Flagged passages resolved: ${o.resolved} of ${o.rows.length}`, 10);
  line(`Settings: ${settingsText(o.settings)}. Citation style: ${STYLE_LABEL[o.style]}.`, 9, false, [74, 93, 117]);
  gap(10);
  line("Sources checked", 12, true);
  for (const [i, s] of o.sources.entries()) {
    const c = o.r.counts.get(i) ?? 0;
    line(`• ${s.name} — ${KIND_LABEL[s.kind]}${c ? ` — ${pctText((100 * c) / o.r.total)} of the document` : " — no current matches"}`, 9, false, undefined, 6);
  }
  gap(10);
  line("Flagged passages", 12, true);
  if (!o.rows.length) line("No passages were flagged.", 10);
  for (const row of o.rows) {
    need(40);
    line(`${row.status.toUpperCase()} · ${row.source}`, 9, true, row.status.startsWith("open") ? [209, 52, 56] : [22, 163, 74]);
    line(`"${row.excerpt}"`, 9, false, [74, 93, 117], 8);
    gap(4);
  }
  gap(10);
  line("A moderate similarity index made up of correctly quoted and cited material is normal. This summary records the writer's own pre-submission review; it is not an institutional similarity report.", 8.5, false, [74, 93, 117]);
  pdf.save(`${baseName(o.docName)}_self_check.pdf`);
}
