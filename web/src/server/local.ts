// Is this request from the computer running origincheck, rather than a phone or another computer on the network?
// Features that use the owner's own keys and accounts (Settings, Zotero import, the free-model gateway) only work
// from the computer itself.
//
// Note: this stops other devices' browsers, which can't change these headers. Someone sending hand-made requests
// could still pretend, so on a computer shared with people you don't trust, don't add personal keys at all.
import "server-only";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;

export function isLocalRequest(req: Request): boolean {
  if (!LOCAL_HOSTS.has(new URL(req.url).hostname)) return false; // opened at the computer's network address
  // Next.js records the connecting address here when the request didn't already carry one
  const from = req.headers.get("x-forwarded-for")?.split(",")[0].trim();
  return !from || LOOPBACK.test(from);
}

export const LOCAL_ONLY = "only works on the computer running origincheck (open it there at http://localhost:3100)";
