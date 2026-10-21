import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  // a throwaway usage file per run, so tests never touch (or fill up) the real monthly caps in web/.data
  test: { include: ["src/**/*.test.ts"], environment: "node", env: { USAGE_FILE: join(tmpdir(), `oc-usage-test-${Date.now()}.json`) } },
});
