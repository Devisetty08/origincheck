// Pending and finished paid scans. Each scan has a random secret that must come back on the webhook URL.
// ponytail: in-memory, so submit, webhook and polling must reach the same server process (local + tunnel, or one
// long-running instance). On Vercel's multi-instance functions, move this to a shared store (e.g. Upstash Redis).
import "server-only";
import { randomBytes } from "node:crypto";
import type { PaidResult } from "./types";

export interface Scan { secret: string; status: "pending" | "done" | "error"; result?: PaidResult; error?: string; created: number }

const TTL = 3600_000, MAX = 200;
const scans = new Map<string, Scan>();

export function createScan() {
  const now = Date.now();
  for (const [id, s] of scans) if (now - s.created > TTL) scans.delete(id);
  while (scans.size >= MAX) scans.delete(scans.keys().next().value!);
  const id = `oc-${randomBytes(12).toString("hex")}`;
  const scan: Scan = { secret: randomBytes(16).toString("hex"), status: "pending", created: now };
  scans.set(id, scan);
  return { id, scan };
}

export const getScan = (id: string) => scans.get(id);
export const dropScan = (id: string) => scans.delete(id);
