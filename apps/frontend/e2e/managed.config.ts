import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: [
    "managed.spec.ts",
    "managed-races.spec.ts",
    "managed-proposal.spec.ts",
  ],
  workers: 1,
  outputDir: "/tmp/aquamux-managed-e2e-results",
  timeout: 60_000,
  use: {
    baseURL: process.env.MANAGED_E2E_URL ?? "http://127.0.0.1:33127",
    headless: true,
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
