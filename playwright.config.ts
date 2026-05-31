import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config for first-paint regression tests (avatar visibility, etc.).
 *
 * Defaults assume Vite dev server on :8080 (matches `bun run dev`). Override
 * with PLAYWRIGHT_BASE_URL=https://<preview>.lovable.app to run against the
 * deployed preview without spinning up a local server.
 */
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:8080";
const useLocalServer = !process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ],
  ...(useLocalServer
    ? {
        webServer: {
          command: "bun run dev",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        },
      }
    : {}),
});