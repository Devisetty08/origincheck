// Language detection on the device (franc, trigram statistics over ~80 major languages). Nothing is sent anywhere.
import { franc } from "franc-min";

const names = typeof Intl !== "undefined" && "DisplayNames" in Intl ? new Intl.DisplayNames(["en"], { type: "language" }) : null;

/** ISO 639-3 code ("eng", "kor"…) and English name of the main language; "und" when the text is too short or unclear. */
export function detectLanguage(text: string): { code: string; name: string } {
  const code = franc(text.slice(0, 6000), { minLength: 20 });
  if (code === "und") return { code, name: "Unknown" };
  let name = code;
  try { name = names?.of(code) ?? code; } catch { /* unknown to Intl */ }
  return { code, name };
}
