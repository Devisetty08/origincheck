// Settings page backend: reports which server settings are set and, on a local machine, saves them to .env.local.
// Secret values are write-only: the browser is told "set" or "not set", never the value.
import "server-only";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ENV_VARS } from "@/lib/envVars";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** null when this request may save settings, otherwise the reason it can't. */
export function writeBlocked(req: Request): string | null {
  if (process.env.VERCEL) return "On Vercel, set these under Project → Settings → Environment Variables, then redeploy.";
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SETTINGS_WRITE !== "true")
    return "This server runs in production mode. Edit web/.env.local and restart, or start it with ALLOW_SETTINGS_WRITE=true to edit here.";
  const host = new URL(req.url).hostname;
  if (!LOCAL_HOSTS.has(host)) return "Settings can only be changed from this computer (open the app at http://localhost).";
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(req.url).host) return "Cross-site request refused.";
  return null;
}

export function readSettings() {
  return Object.fromEntries(ENV_VARS.map((v) => {
    const value = process.env[v.key]?.trim() || "";
    return [v.key, v.secret ? { set: !!value } : { set: !!value, value }];
  }));
}

/** Validates, writes .env.local (keeping unrelated lines) and applies to the running process. Empty value = unset. */
export function saveSettings(values: Record<string, unknown>, file = join(/* turbopackIgnore: true */ process.cwd(), ".env.local")) {
  const known = new Set(ENV_VARS.map((v) => v.key));
  const updates: [string, string][] = [];
  for (const [k, raw] of Object.entries(values)) {
    if (!known.has(k)) throw new Error(`Unknown setting ${k}.`);
    if (typeof raw !== "string") throw new Error(`${k} must be text.`);
    const v = raw.trim();
    if (v.length > 500 || /[\r\n"\\$`]/.test(v)) throw new Error(`${k} contains characters that can't be saved (quotes, backslash, $ or line breaks).`);
    updates.push([k, v]);
  }
  const lines = existsSync(file) ? readFileSync(file, "utf8").replace(/\s+$/, "").split(/\r?\n/) : ["# Written by origincheck's Settings page. Never commit this file."];
  for (const [k, v] of updates) {
    const i = lines.findIndex((l) => l.replace(/^\s*export\s+/, "").startsWith(`${k}=`));
    const line = v ? `${k}=${/[\s#']/.test(v) ? `"${v}"` : v}` : null;
    if (i >= 0) { if (line) lines[i] = line; else lines.splice(i, 1); } else if (line) lines.push(line);
    if (v) process.env[k] = v; else delete process.env[k];
  }
  writeFileSync(file, lines.join("\n").replace(/\n*$/, "\n"));
}
