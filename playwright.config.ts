import { defineConfig, devices } from "@playwright/test";

import { readSiteConfig } from "./src/lib/paths/site-config";

const config = readSiteConfig();
const port = 4321;
const baseURL = new URL(config.basePath, `http://127.0.0.1:${port}`).href;
const previewCommand = `bun run preview --host 127.0.0.1 --port ${port}`;
const webServerCommand =
  process.env.PLAYWRIGHT_REUSE_ARTIFACT === "1"
    ? previewCommand
    : `bun run build && ${previewCommand}`;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results",
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: webServerCommand,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
