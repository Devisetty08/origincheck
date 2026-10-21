// "Improve my writing": the route sends only the selected passage, handles refusals and rate limits, and the diff
// helpers rebuild the text from accepted/rejected changes.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { joinParts, toParts } from "@/components/ImproveWriting";
vi.mock("server-only", () => ({}));

const create = vi.fn();
vi.mock("@anthropic-ai/sdk", async (orig) => {
  const real = (await orig<typeof import("@anthropic-ai/sdk")>()).default;
  class Fake { beta = { messages: { create } }; }
  return { default: Object.assign(Fake, {
    APIError: real.APIError, RateLimitError: real.RateLimitError, AuthenticationError: real.AuthenticationError,
    PermissionDeniedError: real.PermissionDeniedError, BadRequestError: real.BadRequestError,
  }) };
});

async function route(env: Record<string, string>) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  return (await import("@/app/api/improve/route")).POST;
}
const post = (body: unknown, ip = String(Math.random())) =>
  new Request("http://x/api/improve", { method: "POST", body: JSON.stringify(body), headers: { "x-forwarded-for": ip } });
const reply = (text: string, stop_reason = "end_turn") => ({ stop_reason, content: [{ type: "text", text }] });
const KEY = { ANTHROPIC_API_KEY: "sk-test", AI_PROVIDER: "anthropic", USAGE_FILE: join(mkdtempSync(join(tmpdir(), "oc-usage-")), "u.json") };

afterEach(() => { vi.unstubAllEnvs(); create.mockReset(); });

describe("/api/improve", () => {
  it("uses the free local model (Ollama, qwen2.5:7b) by default, sending nothing to Anthropic", async () => {
    const calls: { url: string; body: { model: string; messages: { content: string }[] } }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, body: JSON.parse(init.body as string) });
      return new Response(JSON.stringify({ message: { content: "The results were clear." } }), { status: 200 });
    }));
    const POST = await route({ AI_PROVIDER: "", OLLAMA_MODEL: "" });
    const r = await POST(post({ text: "The results, they were very clear.", goal: "shorter" }));
    expect(await r.json()).toMatchObject({ revised: "The results were clear.", provider: "ollama", model: "qwen2.5:7b" });
    expect(calls[0].url).toBe("http://localhost:11434/api/chat");
    expect(calls[0].body.model).toBe("qwen2.5:7b");
    expect(create).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("stops calling Anthropic at the monthly cap", async () => {
    create.mockResolvedValue(reply("Better."));
    const POST = await route({ ...KEY, ANTHROPIC_MONTHLY_REQUEST_CAP: "1" });
    expect((await POST(post({ text: "First passage here.", goal: "clearer" }))).status).toBe(200);
    const r = await POST(post({ text: "Second passage here.", goal: "clearer" }));
    expect(r.status).toBe(429);
    expect((await r.json()).error).toMatch(/cap/);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it("is off without a provider key", async () => {
    const POST = await route({ ANTHROPIC_API_KEY: "", AI_PROVIDER: "anthropic" });
    expect((await POST(post({ text: "Hi.", goal: "clearer" }))).status).toBe(503);
  });

  it("validates the passage and goal", async () => {
    const POST = await route(KEY);
    expect((await POST(post({ text: "", goal: "clearer" }))).status).toBe(400);
    expect((await POST(post({ text: "x".repeat(4001), goal: "clearer" }))).status).toBe(400);
    expect((await POST(post({ text: "Fine.", goal: "humanize" }))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("sends only the passage, on the default model with fallbacks", async () => {
    create.mockResolvedValue(reply("The results were clear."));
    const POST = await route(KEY);
    const r = await POST(post({ text: "The results, they were very clear.", goal: "shorter" }));
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ revised: "The results were clear.", provider: "anthropic", model: "claude-opus-5-5" });
    const req = create.mock.calls[0][0];
    expect(req).toMatchObject({ model: "claude-opus-5-5", fallbacks: "default", betas: ["server-side-fallback-2026-07-01"] });
    expect(req.messages).toHaveLength(1);
    expect(req.messages[0].content).toContain("The results, they were very clear.");
    expect(req.system).not.toMatch(/detect|human-like|humaniz/i);
  });

  it("reports a refusal and a rate limit", async () => {
    const POST = await route(KEY);
    create.mockResolvedValueOnce(reply("", "refusal"));
    expect((await POST(post({ text: "Some text.", goal: "clearer" }))).status).toBe(422);
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    create.mockRejectedValueOnce(Anthropic.APIError.generate(429, {}, "rate limited", new Headers()));
    expect((await POST(post({ text: "Some text.", goal: "clearer" }))).status).toBe(429);
  });
});

describe("diff helpers", () => {
  const a = "The results, they were very clear and obvious.", b = "The results were clear.";
  it("accepting every change gives the revision; rejecting every change gives the original", () => {
    const parts = toParts(a, b);
    expect(joinParts(parts)).toBe(b);
    expect(joinParts(parts.map((x) => ("on" in x ? { ...x, on: false } : x)))).toBe(a);
  });
  it("accepting one change keeps the rest of the original", () => {
    const parts = toParts("one two three", "one 2 three");
    expect(parts.filter((x) => "on" in x)).toHaveLength(1);
    expect(joinParts(parts)).toBe("one 2 three");
  });
});
