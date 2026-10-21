import { defineConfig, devices } from "@playwright/test";

// Runs against the static export (build first with BASE_PATH=/origincheck). AI models are mocked in the tests.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL: "http://localhost:4173/origincheck/", acceptDownloads: true, trace: "retain-on-failure" },
  webServer: { command: "node e2e/serve.mjs", url: "http://localhost:4173/origincheck/", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "desktop-light", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 }, colorScheme: "light" } },
    { name: "mobile-dark", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, colorScheme: "dark", hasTouch: true } },
  ],
});
