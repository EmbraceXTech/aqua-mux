import { defineConfig } from "@playwright/test"
export default defineConfig({
  testDir: "./tests",
  testMatch: "experience.spec.ts",
  fullyParallel: false,
  use: {
    baseURL: "http://localhost:5199",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    reducedMotion: "reduce",
  },
  reporter: "list",
  outputDir: "/tmp/coolbar-experience-test-results",
  webServer: {
    command: "bun run dev --host 127.0.0.1 --port 5199",
    url: "http://localhost:5199",
    reuseExistingServer: true,
  },
})
