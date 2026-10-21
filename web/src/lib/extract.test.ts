// Upload safety: unsupported types and oversized files are refused before any parsing.
import { describe, expect, it } from "vitest";
import { MAX_FILE_MB, extract } from "./extract";

describe("extract", () => {
  it("refuses unsupported types and files over the size limit", async () => {
    await expect(extract(new File(["x"], "virus.exe"))).rejects.toThrow(/unsupported file type/);
    const big = new File(["x"], "big.txt");
    Object.defineProperty(big, "size", { value: MAX_FILE_MB * 1e6 + 1 });
    await expect(extract(big)).rejects.toThrow(/larger than/);
  });
  it("reads a small text file", async () => {
    expect((await extract(new File(["Hello\r\nworld"], "a.txt"))).text).toBe("Hello\nworld");
  });
});
