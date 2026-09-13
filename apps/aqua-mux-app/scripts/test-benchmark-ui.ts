import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const origin = process.env.BENCHMARK_TEST_ORIGIN ?? "http://127.0.0.1:3101";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
try {
  const api = await (await page.request.get(`${origin}/api/benchmark`)).json();
  assert.ok(
    api.positions.length > 0,
    "Run the real-data backfill before the UI smoke test",
  );
  await page.goto(`${origin}/benchmark`);
  await page
    .getByRole("heading", { name: "What can one wallet earn?" })
    .waitFor();
  await page
    .getByRole("button", { name: /View positions for/ })
    .first()
    .waitFor();
  const links = await page
    .getByRole("navigation", { name: "Main navigation" })
    .getByRole("link")
    .allTextContents();
  assert.equal(links.indexOf("Benchmark"), links.indexOf("Portfolio") - 1);
  const wallet = api.positions[0].wallet;
  await page
    .getByRole("textbox", { name: "Search wallet address" })
    .fill(wallet.toUpperCase());
  assert.equal(
    await page.getByRole("button", { name: /View positions for/ }).count(),
    1,
  );
  await page.getByRole("button", { name: /View positions for/ }).click();
  await page
    .getByRole("heading", { name: "Audited position histories" })
    .waitFor();
  assert.ok(
    (await page.getByRole("link", { name: "Collection transaction" }).count()) >
      0,
  );
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page
    .getByRole("button", { name: "Collected fees", exact: false })
    .click();
  assert.equal(await page.locator('th[aria-sort="ascending"]').count(), 1);
  await page.getByRole("combobox", { name: "AMM version" }).selectOption("v2");
  await page
    .getByRole("heading", { name: "No wallets match these filters" })
    .waitFor();
  await page.getByRole("button", { name: /Data coverage/ }).click();
  assert.ok(
    (await page
      .getByRole("cell", { name: "SushiSwap v2", exact: false })
      .count()) > 0,
  );
  await page.getByRole("button", { name: "Reset filters" }).click();
  await page.getByRole("button", { name: /Wallet rankings/ }).click();
  await mkdir("../../output/benchmark", { recursive: true });
  await page.screenshot({
    path: "../../output/benchmark/desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "../../output/benchmark/mobile.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  assert.equal(
    overflow,
    false,
    "Page must not horizontally overflow on mobile",
  );
  assert.deepEqual(errors, []);
  console.log("Benchmark browser smoke test passed against live indexed data.");
} finally {
  await browser.close();
}
