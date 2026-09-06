import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/desk",
  fullyParallel: true,
  workers: 2,
  timeout: 30000,
  expect: { timeout: 10000 },
  reporter: "list",
  outputDir: "test-results/desk",
  use: {
    ...devices["Desktop Chrome"],
    channel: "chrome",
    baseURL: "http://127.0.0.1:5186",
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "bunx vite --config vite.desk.config.ts --host 127.0.0.1 --port 5186 --strictPort",
    url: "http://127.0.0.1:5186/desk.html",
    reuseExistingServer: !process.env.CI,
  },
})
