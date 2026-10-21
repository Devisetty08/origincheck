// Translation of search phrases: short phrases only, the key stays on the server, and failures are reported.
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

async function route(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import("@/app/api/translate/route")).POST;
}
const post = (body: unknown) => new Request("http://localhost/api/translate", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": String(Math.random()) } });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("/api/translate", () => {
  it("is off without a LibreTranslate server", async () => {
    const POST = await route({ LIBRETRANSLATE_URL: "" });
    expect((await POST(post({ q: ["hola"] }))).status).toBe(503);
  });
  it("refuses long text, so whole documents can't be sent", async () => {
    const POST = await route({ LIBRETRANSLATE_URL: "https://lt.example" });
    expect((await POST(post({ q: ["word ".repeat(17)] }))).status).toBe(400);
    expect((await POST(post({ q: Array(21).fill("hola") }))).status).toBe(400);
  });
  it("translates phrases with the key in the body, not the URL", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify({ translatedText: ["we chose a managed platform", "the tool connects to the database"] }), { status: 200 });
    }));
    const POST = await route({ LIBRETRANSLATE_URL: "https://lt.example/", LIBRETRANSLATE_API_KEY: "lt-secret" });
    const r = await POST(post({ q: ["elegimos una plataforma gestionada", "la herramienta se conecta a la base de datos"] }));
    expect(await r.json()).toEqual({ translated: ["we chose a managed platform", "the tool connects to the database"] });
    expect(calls[0].url).toBe("https://lt.example/translate");
    expect(calls[0].body).toMatchObject({ source: "auto", target: "en", api_key: "lt-secret" });
  });
  it("passes a rate limit through as 429", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Too many requests" }), { status: 429 })));
    const POST = await route({ LIBRETRANSLATE_URL: "https://lt.example" });
    expect((await POST(post({ q: ["hola mundo"] }))).status).toBe(429);
  });
});
