import { defineConfig, devices } from "@playwright/test";

// Runs against the production server (`npm run build` first). AI models and external APIs are mocked in the tests.
export default defineConfig({
  testDir: "e2e",
  timeout: 90_000,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list", // CI keeps an HTML report for failures
  use: { baseURL: "http://localhost:4173/", acceptDownloads: true, trace: "retain-on-failure" },
  webServer: { command: "npx next start -p 4173", url: "http://localhost:4173/", reuseExistingServer: !process.env.CI },
  projects: [
    { name: "desktop-light", use: { ...devices["Desktop Chrome"], viewport: { width: 1360, height: 900 }, colorScheme: "light" } },
    { name: "mobile-dark", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 }, colorScheme: "dark", hasTouch: true } },
  ],
});
