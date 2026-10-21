// Copyleaks adapter and routes against mocked API responses: submit, webhook secret, polling and errors.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

const ENV = { COPYLEAKS_EMAIL: "me@uni.edu", COPYLEAKS_KEY: "ck-secret", PUBLIC_BASE_URL: "https://abc.ngrok.app", COPYLEAKS_SANDBOX: "true" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const TEXT = "This is a document long enough to be scanned by the paid checker in the test suite.";

async function load(env: Record<string, string> = ENV) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return {
    paid: await import("@/app/api/paid/route"),
    hook: await import("@/app/api/paid/webhook/[status]/route"),
  };
}
const post = (body: unknown) => new Request("http://localhost/api/paid", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": String(Math.random()) } });

let calls: { url: string; init?: RequestInit }[];
beforeEach(() => {
  calls = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    if (url.includes("/account/login/api")) return json({ access_token: "tok", ".expires": new Date(Date.now() + 48 * 3600_000).toISOString() });
    return new Response(null, { status: 201 });
  }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("Copyleaks", () => {
  it("is not configured without keys or a public address", async () => {
    const { paid } = await load({ COPYLEAKS_EMAIL: "", COPYLEAKS_KEY: "", PUBLIC_BASE_URL: "" });
    const r = await paid.POST(post({ text: TEXT }));
    expect(r.status).toBe(503);
    expect((await r.json()).error).toMatch(/COPYLEAKS_EMAIL/);
    expect(calls).toHaveLength(0);
  });

  it("submits the document, then accepts only the webhook carrying the scan's secret", async () => {
    const { paid, hook } = await load();
    const r = await paid.POST(post({ text: TEXT }));
    expect(r.status).toBe(200);
    const { scan } = await r.json();

    const submit = calls.find((c) => c.url.includes("/scans/submit/file/"))!;
    expect(submit.url).toBe(`https://api.copyleaks.com/v3/scans/submit/file/${scan}`);
    expect((submit.init!.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(submit.init!.body as string);
    expect(Buffer.from(body.base64, "base64").toString()).toBe(TEXT);
    expect(body.properties).toMatchObject({ sandbox: true, indexing: { copyleaksDb: false }, scanning: { copyleaksDb: { includeMySubmissions: false } } });
    const hookUrl = new URL(body.properties.webhooks.status.replace("{STATUS}", "completed"));
    expect(hookUrl.origin).toBe("https://abc.ngrok.app");

    const poll = () => paid.GET(new Request(`http://localhost/api/paid?scan=${scan}`)).then((x) => x.json());
    expect((await poll()).status).toBe("pending");

    const completed = { status: 0, scannedDocument: { scanId: scan, totalWords: 16 },
      results: { internet: [{ id: "1", title: "Some page", url: "https://example.com/p", matchedWords: 9 }], database: [{ id: 2, title: "A paper", matchedWords: 12 }],
        repositories: [], score: { aggregatedScore: 56.3, identicalWords: 9, minorChangedWords: 2, relatedMeaningWords: 1 } } };
    const send = (t: string) => hook.POST(new Request(`${hookUrl.origin}${hookUrl.pathname}?scan=${scan}&t=${t}`, { method: "POST", body: JSON.stringify(completed) }),
      { params: Promise.resolve({ status: "completed" }) });
    expect((await send("wrong")).status).toBe(404);
    expect((await poll()).status).toBe("pending");
    expect((await send(hookUrl.searchParams.get("t")!)).status).toBe(204);
    const done = await poll();
    expect(done.status).toBe("done");
    expect(done.result).toMatchObject({ score: 56, totalWords: 16, identicalWords: 9 });
    expect(done.result.matches.map((m: { title: string }) => m.title)).toEqual(["A paper", "Some page"]); // most matched words first
  });

  it("logs in once and reuses the token", async () => {
    const { paid } = await load();
    await paid.POST(post({ text: TEXT }));
    await paid.POST(post({ text: TEXT }));
    expect(calls.filter((c) => c.url.includes("/login/")).length).toBe(1);
  });

  it("reports rejected credentials and rate limits without leaking the key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ message: "bad" }, 401)));
    const { paid } = await load();
    const r = await paid.POST(post({ text: TEXT }));
    expect(r.status).toBe(502);
    const msg = (await r.json()).error;
    expect(msg).toMatch(/rejected the email or API key/);
    expect(msg).not.toContain("ck-secret");

    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("/login/") ? json({ access_token: "tok" }) : new Response(null, { status: 429 })));
    const { paid: p2 } = await load();
    expect((await p2.POST(post({ text: TEXT }))).status).toBe(429);
  });

  it("refuses too-short text", async () => {
    const { paid } = await load();
    expect((await paid.POST(post({ text: "too short" }))).status).toBe(400);
  });
});
