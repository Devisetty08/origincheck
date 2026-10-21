"use client";
// Optional external checkers. These sites have no public API, so origincheck never automates them:
// it copies your text to the clipboard and opens the site; you paste it there yourself.
import { useState } from "react";
import { ClipboardCopy, ExternalLink } from "lucide-react";
import { Button } from "./ui";

const SITES = [
  { id: "duplichecker", name: "Duplichecker", url: "https://www.duplichecker.com/", note: "English; free checks have a word limit." },
  { id: "copykiller", name: "CopyKiller", url: "https://www.copykiller.com/", note: "Korean-focused; the stronger option for Korean text." },
] as const;

export default function ExternalCheck({ text, korean }: { text: string; korean: boolean }) {
  const [msg, setMsg] = useState("");
  const open = async (site: (typeof SITES)[number]) => {
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch { /* clipboard blocked */ }
    window.open(site.url, "_blank", "noopener,noreferrer");
    setMsg(copied
      ? `Your text is on the clipboard. Paste it into ${site.name} yourself (Ctrl+V). origincheck doesn't send it there.`
      : `Couldn't copy automatically — select your text and copy it, then paste it into ${site.name}.`);
  };
  return (
    <details className="no-print rounded-xl border border-line bg-panel px-4 py-3" id="externalCheck">
      <summary className="cursor-pointer text-sm font-semibold">Check externally (optional)</summary>
      <p className="mt-2 text-[13px] text-mute">Other checkers search databases origincheck can&apos;t. Nothing is sent automatically: each button copies your text and opens the site in a new tab.
        {korean && <> <b className="text-ink">Your text contains Korean — CopyKiller is the stronger option for Korean.</b></>}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {SITES.map((s) => <Button key={s.id} size="sm" onClick={() => open(s)} title={s.note} data-site={s.id}>
          <ClipboardCopy size={14} />Copy text &amp; open {s.name}<ExternalLink size={13} /></Button>)}
      </div>
      {msg && <p className="mt-2 text-[13px]" role="status">{msg}</p>}
    </details>
  );
}
