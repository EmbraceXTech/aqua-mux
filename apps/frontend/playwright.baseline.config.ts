import { defineConfig } from "@playwright/test";

const port = Number(process.env.AQUAMUX_DEV_PORT ?? 33127);
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error("AQUAMUX_DEV_PORT must be an integer from 1024 to 65535.");
}
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  reporter: "list",
  outputDir: "test-results/baseline",
  use: {
    baseURL,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx next dev --webpack --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120000,
  },
});
