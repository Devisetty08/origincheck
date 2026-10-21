"use client";
import { useState } from "react";
import { Download, Trash2 } from "lucide-react";
import { type SavedDoc, deleteAll, exportAll } from "@/lib/store";
import { download } from "@/lib/exporters";
import { Button, Card, Check, Dialog } from "./ui";

export default function Library({ saved, setSaved, onDeletedAll }: { saved: SavedDoc[]; setSaved: (s: SavedDoc[]) => void; onDeletedAll: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState("");
  return (
    <div className="mx-auto grid grid-cols-[minmax(0,1fr)] max-w-[1180px] gap-4 px-4 pt-7 pb-12">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Saved documents and data</h1>
        <p className="text-mute">Stored only in this browser. New checks can compare against saved documents.</p>
      </div>
      <Card>
        <h2 className="font-semibold">Saved documents ({saved.length})</h2>
        {!saved.length && <p className="mt-1 text-sm text-mute">None yet. After a check, use “Save to my documents”.</p>}
        <ul className="mt-2">
          {saved.map((d) => <li key={d.id} className="grid gap-1.5 border-t border-line py-2.5 first:border-t-0 sm:flex sm:items-center sm:gap-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium" title={d.name}>{d.name}</div>
              <div className="text-[12.5px] text-mute">{d.text.split(/\s+/).length.toLocaleString()} words · saved {new Date(d.savedAt).toLocaleDateString()}</div>
            </div>
            <Check id={`own-${d.id}`} checked={d.own} label="My earlier work" onChange={(own) => setSaved(saved.map((x) => (x.id === d.id ? { ...x, own } : x)))} />
            <Button size="sm" variant="ghost" aria-label={`Delete ${d.name}`} onClick={() => setSaved(saved.filter((x) => x.id !== d.id))}><Trash2 size={15} />Delete</Button>
          </li>)}
        </ul>
        <p className="mt-3 text-[13px] text-mute">Mark previous assignments or published papers as your earlier work. Matches with them are reported separately — many institutions require reused material to be cited or approved.</p>
      </Card>
      <Card>
        <h2 className="font-semibold">Your data</h2>
        <p className="mt-1 text-sm text-mute">Saved documents, draft history, citation details and settings.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={async () => download(`origincheck-data-${new Date().toISOString().slice(0, 10)}.json`, await exportAll(), "application/json")}><Download size={15} />Export to a file</Button>
          <Button variant="danger" onClick={() => setConfirming(true)} id="deleteAll"><Trash2 size={15} />Delete everything</Button>
        </div>
        {msg && <p className="mt-2 text-sm text-low" role="status">{msg}</p>}
      </Card>
      <Dialog open={confirming} onOpenChange={setConfirming} title="Delete all saved data?" description="This removes every saved document, all draft history, citation details and settings from this browser. It can't be undone.">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setConfirming(false)}>Cancel</Button>
          <Button variant="primary" className="bg-high! border-high!" id="confirmDelete" onClick={async () => { await deleteAll(); onDeletedAll(); setConfirming(false); setMsg("All saved data deleted."); }}>Delete everything</Button>
        </div>
      </Dialog>
    </div>
  );
}
