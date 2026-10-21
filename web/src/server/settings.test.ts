// Settings page backend: secrets never come back, only local requests may write, and .env.local keeps unrelated lines.
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { readSettings, saveSettings, writeBlocked } = await import("./settings");

afterEach(() => { vi.unstubAllEnvs(); delete process.env.BRAVE_API_KEY; delete process.env.CONTACT_EMAIL; });
const req = (url: string, origin?: string) => new Request(url, { headers: origin ? { origin } : {} });

describe("settings", () => {
  it("reports secrets as set/not set, never their value", () => {
    vi.stubEnv("BRAVE_API_KEY", "secret-123");
    vi.stubEnv("CONTACT_EMAIL", "me@uni.edu");
    const s = readSettings();
    expect(s.BRAVE_API_KEY).toEqual({ set: true });
    expect(JSON.stringify(s)).not.toContain("secret-123");
    expect(s.CONTACT_EMAIL).toEqual({ set: true, value: "me@uni.edu" });
  });

  it("only allows local, same-origin writes outside production and Vercel", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(writeBlocked(req("http://localhost:3100/api/settings"))).toBeNull();
    expect(writeBlocked(req("http://192.168.1.5:3100/api/settings"))).toMatch(/this computer/);
    expect(writeBlocked(req("http://localhost:3100/api/settings", "https://evil.example"))).toMatch(/Cross-site/);
    vi.stubEnv("NODE_ENV", "production");
    expect(writeBlocked(req("http://localhost:3100/api/settings"))).toMatch(/production/);
    vi.stubEnv("ALLOW_SETTINGS_WRITE", "true");
    expect(writeBlocked(req("http://localhost:3100/api/settings"))).toBeNull();
    vi.stubEnv("VERCEL", "1");
    expect(writeBlocked(req("http://localhost:3100/api/settings"))).toMatch(/Vercel/);
  });

  it("updates .env.local in place, applies values and unsets empty ones", () => {
    const file = join(mkdtempSync(join(tmpdir(), "oc-")), ".env.local");
    writeFileSync(file, "# mine\nOTHER=keep\nBRAVE_API_KEY=old\n");
    saveSettings({ BRAVE_API_KEY: "new-key", CONTACT_EMAIL: "me@uni.edu" }, file);
    expect(readFileSync(file, "utf8")).toBe("# mine\nOTHER=keep\nBRAVE_API_KEY=new-key\nCONTACT_EMAIL=me@uni.edu\n");
    expect(process.env.BRAVE_API_KEY).toBe("new-key");
    saveSettings({ BRAVE_API_KEY: "" }, file);
    expect(readFileSync(file, "utf8")).not.toContain("BRAVE_API_KEY");
    expect(process.env.BRAVE_API_KEY).toBeUndefined();
  });

  it("rejects unknown names and values that could break the file", () => {
    expect(() => saveSettings({ PATH: "x" }, "unused")).toThrow(/Unknown/);
    expect(() => saveSettings({ BRAVE_API_KEY: "a\nEVIL=1" }, "unused")).toThrow(/can't be saved/);
    expect(() => saveSettings({ BRAVE_API_KEY: "$HOME" }, "unused")).toThrow(/can't be saved/);
  });
});
