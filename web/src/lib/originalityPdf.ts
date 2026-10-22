// The downloadable originality report (PDF), laid out like the similarity reports students get from their institution:
// a cover page, the document with each matched passage highlighted in its source's colour and numbered, then the
// originality summary (similarity index, breakdown by source type, primary sources) and the settings used.
import { AI_CAVEAT, type AiResult } from "./aiScore";
import { PALETTE, band, baseName } from "./exporters";
import type { Kind, Result, Settings, Source } from "./similarity";

type RGB = [number, number, number];
const rgb = (hex: string): RGB => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
const tint = (hex: string, k = 0.22): RGB => rgb(hex).map((c) => Math.round(255 - (255 - c) * k)) as RGB; // light highlight
const INK: RGB = [33, 37, 41], MUTE: RGB = [108, 117, 125], RED: RGB = [209, 52, 56], LINE: RGB = [170, 170, 170];

/** Source-type columns of the summary. */
export const CATEGORY: Record<Kind, "internet" | "publications" | "yours" | "saved"> = {
  internet: "internet", scholarly: "publications", library: "publications", mylib: "yours", file: "yours", paste: "yours", saved: "saved", own: "saved", draft: "saved",
};
export const TYPE_LABEL: Record<Kind, string> = {
  internet: "Internet Source", scholarly: "Publication", library: "Book", mylib: "My library", file: "Uploaded file", paste: "Pasted text",
  saved: "Saved document", own: "Your earlier work", draft: "Earlier draft",
};

/**
 * Share of the document matched by any source of each type. Like institutional reports, the columns are computed
 * separately (a passage found both online and in a journal counts in both), so they can add up to more than the index.
 */
export function categoryShares(r: Result, sources: Source[], skip: Set<number>) {
  const hit: Record<string, Set<number>> = { internet: new Set(), publications: new Set(), yours: new Set(), saved: new Set() };
  for (const [sid, runs] of r.runs) {
    if (skip.has(sid) || !sources[sid]) continue;
    const set = hit[CATEGORY[sources[sid].kind]];
    for (const [b, e] of runs) for (let i = b; i < e; i++) if (!r.excl.has(i)) set.add(i);
  }
  const pct = (s: Set<number>) => (r.total ? Math.round((100 * s.size) / r.total) : 0);
  return { internet: pct(hit.internet), publications: pct(hit.publications), yours: pct(hit.yours), saved: pct(hit.saved) };
}

/** What to call a source in the list: its web address host when it has one (as in "www.example.org"), else its title. */
export function sourceLabel(s: Source) {
  const url = s.meta?.url ?? s.found?.url;
  if (url && s.kind === "internet") try { return new URL(url).hostname; } catch { /* not a URL */ }
  return s.name;
}

/** Standard PDF fonts only cover Latin-1 and common punctuation. */
export const pdfSafe = (t: string) => t.replace(/[^\x09\x0a\x0d\x20-\x7e\xa0-\xff‘’“”–—…•€™]/g, "?");
export const needsHtmlReport = (t: string) => /[Ͱ-ϿЀ-ӿ֐-ۿऀ-෿฀-๿ᄀ-ᇿ　-鿿가-힯]/.test(t);

export interface ReportInput {
  docName: string; text: string; toks: { s: number; e: number }[]; r: Result | null; sources: Source[]; skip: Set<number>;
  settings: Settings; checked: Date; checkId: string;
  grammar?: { score: number; errors: number; warnings: number; style: number };
  ai?: { result: AiResult | null; note?: string };
  history?: string; aiAssisted?: number;
}

export async function exportOriginalityPdf(o: ReportInput) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const W = pdf.internal.pageSize.getWidth(), H = pdf.internal.pageSize.getHeight();
  const font = (size: number, bold = false, color: RGB = INK) => pdf.setFont("helvetica", bold ? "bold" : "normal").setFontSize(size).setTextColor(...color);
  const r = o.r;
  const num = new Map((r?.order ?? []).map((s, i) => [s, i + 1]));
  const color = new Map((r?.order ?? []).map((s, i) => [s, PALETTE[i % PALETTE.length]]));

  /* ---------- 1. cover ---------- */
  font(30, false, INK);
  const title = pdf.splitTextToSize(pdfSafe(o.docName), W - 140) as string[];
  let y = H * 0.4 - (title.length - 1) * 18;
  for (const l of title) { pdf.text(l, W / 2, y, { align: "center" }); y += 38; }
  font(11, false, MUTE).text("Originality report · origincheck", W / 2, y, { align: "center" });
  pdf.setDrawColor(...LINE).setLineWidth(1).line(48, H - 230, W - 48, H - 230);
  const facts: [string, string][] = [
    ["Check date:", o.checked.toLocaleString()], ["Check ID:", o.checkId], ["File name:", o.docName],
    ["Word count:", String(o.toks.length)], ["Character count:", String(o.text.length)],
  ];
  facts.forEach(([k, v], i) => {
    font(10, true).text(k, 48, H - 205 + i * 21);
    const after = 48 + pdf.getTextWidth(k) + 5; // measured in the bold label font
    font(10).text(pdfSafe(v), after, H - 205 + i * 21);
  });

  /* ---------- 2. the document, highlighted ---------- */
  const owner = new Int32Array(o.text.length).fill(-1); // character → source, gaps inside a passage included
  if (r) for (let i = 0; i < o.toks.length; i++) {
    const sid = r.owner.get(i);
    if (sid === undefined) continue;
    const end = r.owner.get(i + 1) === sid && o.toks[i + 1] ? o.toks[i + 1].s : o.toks[i].e;
    owner.fill(sid, o.toks[i].s, end);
  }
  const BOX = 48, X0 = 96, X1 = W - 96, TOP = 100, BOTTOM = H - 80, LH = 19, SIZE = 11;
  const newPage = () => { pdf.addPage(); pdf.setDrawColor(0, 0, 0).setLineWidth(0.8).rect(BOX, BOX, W - 2 * BOX, H - 2 * BOX); y = TOP; };
  newPage();
  font(SIZE);
  const space = pdf.getTextWidth(" ");
  let prevOwner = -1, paraStart = 0; // paraStart: offset of the current line in the text
  for (const para of o.text.split("\n")) {
    if (!para.trim()) { y += LH * 0.6; paraStart += para.length + 1; continue; }
    let x = X0;
    const words = [...para.matchAll(/\S+/g)];
    words.forEach((m, k) => {
      const start = paraStart + m.index!;
      const w = pdfSafe(m[0]);
      const wWidth = pdf.getTextWidth(w);
      if (x > X0 && x + wWidth > X1) { x = X0; y += LH; }
      if (y > BOTTOM) { newPage(); x = X0; }
      let sid = -1;
      for (let c = start; c < start + m[0].length && sid < 0; c++) sid = owner[c];
      if (sid >= 0) {
        const next = words[k + 1];
        const joined = next && owner[paraStart + next.index!] === sid; // highlight the space to a following word of the same passage
        pdf.setFillColor(...tint(color.get(sid)!)).rect(x - 1, y - SIZE + 1, wWidth + (joined ? space : 0) + 2, SIZE + 4, "F");
        if (sid !== prevOwner) { // numbered badge where a passage starts
          const n = String(num.get(sid) ?? "");
          pdf.setFillColor(...rgb(color.get(sid)!)).rect(x - 1, y - SIZE - 9, 4 + n.length * 5, 9, "F");
          font(6.5, true, [255, 255, 255]).text(n, x + 1, y - SIZE - 2.5);
          font(SIZE);
        }
      }
      prevOwner = sid;
      pdf.setTextColor(...INK).text(w, x, y);
      x += wWidth + space;
    });
    paraStart += para.length + 1;
    y += LH;
    prevOwner = -1;
  }

  /* ---------- 3. originality summary ---------- */
  pdf.addPage();
  const M = 56;
  font(18).text(pdfSafe(o.docName).slice(0, 70), M, 70);
  pdf.setDrawColor(...LINE).setLineWidth(1.5).line(M, 82, W - M, 82);
  font(9, false, RED).text("ORIGINALITY REPORT", M, 102);
  pdf.setLineWidth(0.8).line(M, 112, W - M, 112);
  const shares = r ? categoryShares(r, o.sources, o.skip) : null;
  const cols: [string, string, RGB][] = [
    ["SIMILARITY INDEX", r ? String(r.index) : "–", r ? rgb(band(r.index).color) : MUTE],
    ["INTERNET SOURCES", shares ? String(shares.internet) : "–", INK],
    ["PUBLICATIONS", shares ? String(shares.publications) : "–", INK],
    ["YOUR SOURCES", shares ? String(shares.yours) : "–", INK],
    ["SAVED PAPERS", shares ? String(shares.saved) : "–", INK],
  ];
  const first = 150, colW = (W - 2 * M - first) / (cols.length - 1); // the index gets the widest column
  cols.forEach(([label, value, c], i) => {
    const x = i === 0 ? M : M + first + (i - 1) * colW, big = i === 0 ? 46 : 28;
    font(big, false, c).text(value, x, 168);
    if (value !== "–") font(big * 0.4, false, c).text("%", x + pdf.setFontSize(big).getTextWidth(value) + 2, 168);
    font(7.5, false, INK).text(label, x, 186);
  });
  pdf.setDrawColor(...LINE).setLineWidth(1.5).line(M, 204, W - M, 204);
  font(9, false, RED).text("PRIMARY SOURCES", M, 224);
  y = 234;
  pdf.setLineWidth(0.8).line(M, y, W - M, y);
  if (!r || !r.order.length) { font(11, false, MUTE).text(r ? "No matching sources found." : "The similarity check didn't run: no sources were added.", M, y + 30); y += 50; }
  for (const sid of r?.order ?? []) {
    if (y + 56 > H - 140) { pdf.addPage(); y = 60; }
    const s = o.sources[sid], c = color.get(sid)!, n = String(num.get(sid));
    pdf.setFillColor(...rgb(c)).rect(M + 8, y + 14, 26, 26, "F");
    font(12, false, [255, 255, 255]).text(n, M + 21, y + 32, { align: "center" });
    font(15, false, rgb(c)).text((pdf.splitTextToSize(pdfSafe(sourceLabel(s)), W - 2 * M - 150) as string[])[0], M + 50, y + 27);
    font(9, false, MUTE).text(TYPE_LABEL[s.kind], M + 50, y + 41);
    const pc = Math.round((100 * (r!.counts.get(sid) ?? 0)) / r!.total), pcs = pc < 1 ? "<1" : String(pc);
    font(28, false, INK).text(pcs, W - M - 16, y + 38, { align: "right" });
    font(11, false, INK).text("%", W - M - 14, y + 38);
    y += 56;
    pdf.setDrawColor(...LINE).setLineWidth(0.8).line(M, y, W - M, y);
  }
  y += 40;
  if (y > H - 150) { pdf.addPage(); y = 70; }
  pdf.setDrawColor(...LINE).setLineWidth(0.8).line(M, y - 16, W - M, y - 16);
  const st = o.settings;
  const settings: [string, string][] = [
    ["Exclude quotes", st.quotes ? "On" : "Off"], ["Exclude matches", `< ${st.minWords} words`],
    ["Exclude bibliography", st.bib ? "On" : "Off"], ["Exclude small sources", st.dropPct ? `< ${st.dropPct}%` : "Off"],
  ];
  settings.forEach(([k, v], i) => {
    const x = M + 20 + (i % 2) * ((W - 2 * M) / 2), yy = y + Math.floor(i / 2) * 20;
    font(9.5, false, MUTE).text(k, x, yy);
    font(9.5, false, [150, 150, 150]).text(v, x + 120, yy);
  });
  y += 56;
  font(8.5, false, MUTE);
  for (const l of pdf.splitTextToSize("Similarity is a signal, not proof: quoted or properly cited text can be matched, and common phrases can coincide. "
    + "Lightly edited and reworded passages are shown in the app and are not counted in the index. Your institution's tools search other databases and may give a different result.", W - 2 * M) as string[]) { pdf.text(l, M, y); y += 12; }

  /* ---------- 4. other checks ---------- */
  if (o.grammar || o.ai?.result || o.ai?.note || o.history || o.aiAssisted) {
    pdf.addPage();
    y = 70;
    const head = (t: string) => { y += 10; font(9, false, RED).text(t, M, y); pdf.setDrawColor(...LINE).setLineWidth(0.8).line(M, y + 8, W - M, y + 8); y += 30; };
    const para = (t: string, size = 10.5, c: RGB = INK) => { font(size, false, c); for (const l of pdf.splitTextToSize(pdfSafe(t), W - 2 * M) as string[]) { pdf.text(l, M, y); y += size * 1.45; } y += 6; };
    font(18).text("Other checks", M, y); y += 34;
    if (o.grammar) {
      head("GRAMMAR");
      font(30, false, INK).text(String(o.grammar.score), M, y + 8);
      font(10, false, MUTE).text(`Writing score · ${o.grammar.errors} errors, ${o.grammar.warnings} warnings, ${o.grammar.style} style suggestions`, M + 60, y + 4);
      y += 34;
    }
    if (o.ai?.result || o.ai?.note) {
      head("AI INDICATOR");
      if (o.ai.result) para(`${o.ai.result.score}/100 — ${o.ai.result.label}. An indicator only, never proof.`, 11);
      else para(o.ai.note!, 10.5, MUTE);
      para(AI_CAVEAT, 8.5, MUTE);
    }
    if (o.history || o.aiAssisted) {
      head("HOW THE TEXT WAS WRITTEN");
      if (o.history) para(`Writing history: ${o.history}. Process evidence, not proof of authorship by itself.`);
      if (o.aiAssisted) para(`AI-assisted: ${o.aiAssisted} passage${o.aiAssisted > 1 ? "s were" : " was"} revised with an AI writing assistant in origincheck and accepted by the writer.`);
    }
  }

  // page numbers, as "Page n of N"
  const pages = pdf.getNumberOfPages();
  for (let p = 2; p <= pages; p++) { pdf.setPage(p); font(8, false, MUTE).text(`Page ${p} of ${pages}`, W / 2, H - 22, { align: "center" }); }
  pdf.save(`${baseName(o.docName)}_originality_report.pdf`);
}
