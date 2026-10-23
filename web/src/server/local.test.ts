import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { isLocalRequest } from "./local";

const at = (url: string, from?: string) => new Request(url, { headers: from ? { "x-forwarded-for": from } : {} });

describe("is this request from the computer running origincheck?", () => {
  it("yes, when opened at localhost from this machine", () => {
    expect(isLocalRequest(at("http://localhost:3100/api/x", "::1"))).toBe(true);
    expect(isLocalRequest(at("http://127.0.0.1:3100/api/x", "127.0.0.1"))).toBe(true);
    expect(isLocalRequest(at("http://localhost:3100/api/x", "::ffff:127.0.0.1"))).toBe(true);
    expect(isLocalRequest(at("http://localhost:3100/api/x"))).toBe(true);
  });
  it("no, from a phone or another computer on the Wi-Fi", () => {
    expect(isLocalRequest(at("http://192.168.0.133:3100/api/x", "192.168.0.57"))).toBe(false);
    expect(isLocalRequest(at("http://192.168.0.133:3100/api/x", "127.0.0.1"))).toBe(false); // the computer's network address
    expect(isLocalRequest(at("http://localhost:3100/api/x", "192.168.0.57"))).toBe(false); // a localhost address, but from elsewhere
  });
});
