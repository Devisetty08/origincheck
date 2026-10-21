// Copyleaks plagiarism scan (API v3). Docs: https://docs.copyleaks.com/reference/actions/scans/submit-file
// Login token lasts 48 h and login is limited to 12 requests per 15 min, so it is cached.
import "server-only";
import { config } from "../config";
import { HttpError } from "../http";
import type { PaidChecker, PaidMatch } from "./types";

const LOGIN = "https://id.copyleaks.com/v3/account/login/api";
const SUBMIT = "https://api.copyleaks.com/v3/scans/submit/file/";

let token: { value: string; until: number; for: string } | null = null;

async function login(signal?: AbortSignal) {
  const who = `${config.copyleaksEmail}|${config.copyleaksKey}`;
  if (token && token.for === who && token.until > Date.now()) return token.value;
  const r = await fetch(LOGIN, {
    method: "POST", headers: { "Content-Type": "application/json", "User-Agent": config.userAgent },
    body: JSON.stringify({ email: config.copyleaksEmail, key: config.copyleaksKey }), signal,
  });
  if (!r.ok) throw new HttpError(r.status, r.status === 401 ? "Copyleaks rejected the email or API key." : `Copyleaks login failed (${r.status}).`);
  const j = (await r.json()) as { access_token: string; ".expires"?: string };
  const exp = j[".expires"] ? Date.parse(j[".expires"]) : Date.now() + 48 * 3600_000;
  token = { value: j.access_token, until: exp - 3600_000, for: who }; // renew an hour early
  return token.value;
}

type Item = { title?: string; introduction?: string; matchedWords?: number; url?: string };
type Completed = {
  scannedDocument?: { totalWords?: number };
  results?: { internet?: Item[]; database?: Item[]; repositories?: Item[];
    score?: { aggregatedScore?: number; identicalWords?: number; minorChangedWords?: number; relatedMeaningWords?: number } };
};

export const copyleaks: PaidChecker = {
  id: "copyleaks",
  label: "Copyleaks",
  missing() {
    if (!config.copyleaksEmail || !config.copyleaksKey) return "needs COPYLEAKS_EMAIL and COPYLEAKS_KEY";
    if (!config.publicBaseUrl) return "needs PUBLIC_BASE_URL (a public address Copyleaks can send results to, e.g. an ngrok tunnel)";
    return null;
  },
  async submit(text, scanId, webhookUrl, signal) {
    const auth = await login(signal);
    const r = await fetch(SUBMIT + scanId, {
      method: "PUT", signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth}`, "User-Agent": config.userAgent },
      body: JSON.stringify({
        base64: Buffer.from(text, "utf8").toString("base64"),
        filename: "document.txt",
        properties: {
          sandbox: config.copyleaksSandbox,
          webhooks: { status: webhookUrl },
          // compare against the web and others' submissions, but don't keep this document in any Copyleaks database
          scanning: { internet: true, copyleaksDb: { includeMySubmissions: false, includeOthersSubmissions: true } },
          indexing: { copyleaksDb: false },
          expiration: 24, // hours Copyleaks keeps the scan
        },
      }),
    });
    if (r.status === 401) token = null;
    if (!r.ok) throw new HttpError(r.status, r.status === 429 ? "Copyleaks is rate-limiting requests; try again in a few minutes."
      : r.status === 401 ? "Copyleaks rejected the login token." : `Copyleaks refused the scan (${r.status}).`);
  },
  parseWebhook(status, body) {
    if (status === "error") {
      const b = body as { error?: { message?: string } };
      return { error: b.error?.message ?? "Copyleaks reported an error for this scan." };
    }
    if (status !== "completed") return null; // creditsChecked / indexed: not used
    const b = body as Completed;
    const s = b.results?.score ?? {};
    const pick = (kind: PaidMatch["kind"], items?: Item[]): PaidMatch[] => (items ?? []).map((x) => ({
      kind, title: x.title || x.url || "Untitled", url: x.url, introduction: x.introduction, matchedWords: x.matchedWords ?? 0,
    }));
    return { result: {
      score: Math.round(s.aggregatedScore ?? 0),
      totalWords: b.scannedDocument?.totalWords ?? 0,
      identicalWords: s.identicalWords ?? 0, minorChangedWords: s.minorChangedWords ?? 0, relatedMeaningWords: s.relatedMeaningWords ?? 0,
      matches: [...pick("internet", b.results?.internet), ...pick("database", b.results?.database), ...pick("repositories", b.results?.repositories)]
        .sort((x, y) => y.matchedWords - x.matchedWords),
    } };
  },
};

export const resetCopyleaksToken = () => { token = null; }; // tests
