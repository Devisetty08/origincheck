// Automatic fixes for Paragraph check. Each is a pure function returning the new text and the change it made, so
// every fix can be previewed and undone. None of them writes wording for the user: they only add quotation marks,
// insert or correct citations, or apply a grammar suggestion the user picked.
import { type Issue, applySuggestion } from "../grammar";

export interface Change { s: number; before: string; after: string; label: string }
export interface Fixed { text: string; change: Change }

const edit = (text: string, s: number, e: number, after: string, label: string): Fixed =>
  ({ text: text.slice(0, s) + after + text.slice(e), change: { s, before: text.slice(s, e), after, label } });

/** Undo a change: put back what it replaced. */
export const undo = (text: string, c: Change) => text.slice(0, c.s) + c.before + text.slice(c.s + c.after.length);
export const redo = (text: string, c: Change) => text.slice(0, c.s) + c.after + text.slice(c.s + c.before.length);

/** Wrap the copied words in quotation marks and cite them right after the closing mark. */
export function quoteAndCite(text: string, s: number, e: number, cite: string): Fixed {
  const span = text.slice(s, e), inner = span.replace(/[\s.,;:!?]+$/, "");
  const lead = inner.length - inner.trimStart().length;
  const body = inner.trimStart();
  return edit(text, s, s + inner.length, `${" ".repeat(lead)}“${body}” ${cite}`, "Quote and cite");
}

/** Insert the in-text citation at the end of a sentence, before its full stop (and outside a closing quotation mark). */
export function addCitation(text: string, s: number, e: number, cite: string): Fixed {
  const sent = text.slice(s, e);
  const m = sent.match(/([.!?]+)(["”’)\]]*)\s*$/);
  if (!m) return edit(text, e, e, ` ${cite}`, "Add citation");
  const at = s + m.index!; // before the end punctuation
  if (/["”’]/.test(m[2])) { // ...data.” → ...data” (Cite).
    const end = s + sent.trimEnd().length;
    return edit(text, at, end, `${m[2]} ${cite}${m[1]}`, "Add citation");
  }
  return edit(text, at, at, ` ${cite}`, "Add citation");
}

/** Rewrite one citation into the chosen style. */
export const fixFormat = (text: string, s: number, e: number, expected: string): Fixed => edit(text, s, e, expected, "Fix citation format");

/** Replace a sentence with the user's own rewrite (from the rewrite editor). */
export const replaceSentence = (text: string, s: number, e: number, mine: string): Fixed => edit(text, s, e, mine.trim(), "Rewrite in my own words");

/** Apply one grammar suggestion the user accepted. */
export function grammarFix(text: string, issue: Pick<Issue, "start" | "end">, sug: Issue["suggestions"][number]): Fixed {
  const next = applySuggestion(text, issue, sug);
  // the change spans from the first to the last differing character
  let a = 0;
  while (a < text.length && a < next.length && text[a] === next[a]) a++;
  let z = 0;
  while (z < text.length - a && z < next.length - a && text[text.length - 1 - z] === next[next.length - 1 - z]) z++;
  return { text: next, change: { s: a, before: text.slice(a, text.length - z), after: next.slice(a, next.length - z), label: "Grammar" } };
}
