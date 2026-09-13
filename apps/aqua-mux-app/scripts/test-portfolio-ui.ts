// Run against the local development server: npx tsx scripts/test-portfolio-ui.ts
// Uses an isolated browser and synthetic API fixtures, never a real wallet.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

const origin = process.env.PORTFOLIO_TEST_URL ?? "http://127.0.0.1:3101";
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors: string[] = [];
page.on("pageerror", (error) => errors.push(error.message));
const owner = "0x0000000000000000000000000000000000000001";
const native = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
let balanceRequests = 0;
let failEthereum = false;
try {
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = {};
    if (url.pathname === "/api/balances") {
      balanceRequests++;
      if (failEthereum && url.searchParams.get("chainId") === "1") {
        await route.fulfill({
          status: 503,
          json: { error: "Fixture network unavailable" },
        });
        return;
      }
      body = {
        balances: {
          [native]:
            url.searchParams.get("chainId") === "42161"
              ? "2.123456789"
              : url.searchParams.get("chainId") === "1"
                ? "1.5"
                : "0",
        },
      };
    } else if (url.pathname === "/api/managed/groups") {
      body = { groups: [{ id: "fixture-lp", config: { family: "lp" } }] };
    } else if (url.pathname === "/api/managed/groups/fixture-lp") {
      body = {
        group: {
          id: "fixture-lp",
          chainId: 42161,
          state: "active",
          config: { family: "lp", pairs: [] },
        },
        strategies: [
          {
            id: "fixture-position",
            state: "active",
            registrationBlock: "123",
            tokens: [
              { address: native, symbol: "ETH" },
              {
                address: "0x0000000000000000000000000000000000000002",
                symbol: "USDC",
              },
            ],
          },
        ],
      };
    } else body = { available: false };
    await route.fulfill({ json: body });
  });
  await page.goto(`${origin}/portfolio`);
  await expect(
    page.getByRole("heading", { name: "Portfolio", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export portfolio" }),
  ).toBeDisabled();
  assert.equal(
    balanceRequests,
    0,
    "Disconnected page must not request balances",
  );
  await page.evaluate(
    ({ owner }) =>
      sessionStorage.setItem(
        "aquamux-managed-session-v1",
        JSON.stringify({
          owner,
          token: "synthetic-test-token",
          sessionId: "synthetic-session",
          expiresAt: Date.now() + 600_000,
          mode: "external",
        }),
      ),
    { owner },
  );
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Assets 2", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Export portfolio" }),
  ).toBeEnabled();
  await page
    .getByRole("combobox", { name: "Filter network" })
    .selectOption("42161");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("textbox", { name: "Search assets" })
    .fill("not-a-token");
  await expect(page.getByText("No assets match your filters.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(2);
  const details = page.getByRole("button", {
    name: "View Ether details on Arbitrum",
  });
  await details.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("dialog").getByText("2.123456789", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(details).toBeFocused();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export portfolio" }).click();
  const download = await downloadEvent;
  const stream = await download.createReadStream();
  let csv = "";
  for await (const chunk of stream!) csv += chunk.toString();
  assert.ok(
    csv.includes('"2.123456789"'),
    "Export keeps full balance precision",
  );
  assert.ok(csv.includes('"LP position"'), "Export includes LP records");
  await page.getByRole("tab", { name: "Liquidity positions 1" }).click();
  await expect(
    page.getByRole("cell", { name: "Active", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Activity", exact: true }).click();
  await expect(
    page.getByRole("link", { name: "Arbitrum", exact: true }),
  ).toHaveAttribute("href", `https://arbiscan.io/address/${owner}`);
  await page
    .getByRole("tab", { name: "Activity", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Assets 2", exact: true }),
  ).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    `Mobile page should not overflow horizontally: ${await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter(
          (node) => node.getBoundingClientRect().right > window.innerWidth,
        )
        .map((node) => `${node.tagName}.${node.className}`)
        .slice(0, 15),
    )}`,
  );
  failEthereum = true;
  await page.getByRole("button", { name: "Refresh", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "Balances could not be loaded on Ethereum",
    { timeout: 20_000 },
  );
  failEthereum = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Export portfolio" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("tab", { name: "Assets 0", exact: true }),
  ).toBeVisible();
  assert.deepEqual(errors, [], "No browser runtime errors");
  console.log(
    "Portfolio UI passed: disconnected state, balances, filters, modal, CSV, LP records, activity links, keyboard tabs, mobile layout, retry, disconnect.",
  );
} finally {
  await context.close();
  await browser.close();
}
