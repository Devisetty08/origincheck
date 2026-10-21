// Main readable text of a web page (Mozilla Readability on a server-side DOM).
import "server-only";
import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";

export function readable(html: string, url: string) {
  const { document } = parseHTML(html);
  const title = document.querySelector("title")?.textContent?.trim() || undefined;
  try {
    const art = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
    const text = (art?.textContent ?? "").replace(/[ \t]+\n/g, "\n").replace(/\n\s*\n+/g, "\n\n").trim();
    if (text.split(/\s+/).length >= 30) return { title: art?.title?.trim() || title, text, byline: art?.byline ?? undefined };
  } catch { /* fall back to the body text */ }
  document.querySelectorAll("script,style,noscript,nav,header,footer,aside,form").forEach((e: Element) => e.remove());
  const text = (document.body?.textContent ?? "").replace(/\s*\n\s*/g, "\n").replace(/[ \t]+/g, " ").trim();
  void url;
  return { title, text, byline: undefined };
}
