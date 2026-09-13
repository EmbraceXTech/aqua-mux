import { test, expect, type Page } from "@playwright/test";

const origin = process.env.STRATEGIES_TEST_URL ?? "http://127.0.0.1:3101";
const usdc = {
  address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
  symbol: "USDC",
  decimals: 6,
  name: "USD Coin",
  selectable: true,
  risk: "standard",
};
async function authenticate(page: Page) {
  await page.addInitScript(() =>
    sessionStorage.setItem(
      "aquamux-managed-session-v1",
      JSON.stringify({
        token: "test-token",
        owner: "0x1111111111111111111111111111111111111111",
        sessionId: "test-session",
        expiresAt: Date.now() + 600000,
        mode: "external",
      }),
    ),
  );
  await page.route("**/api/managed/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path.endsWith("/groups")
      ? { groups: [] }
      : path.endsWith("/recovery")
        ? { attempts: [], unavailable: [] }
        : { proposals: [], reviews: [] };
    return route.fulfill({ json });
  });
  await page.route("**/api/tokens?*", (route) =>
    route.fulfill({
      json: { items: [usdc], total: 1, stale: false, degraded: false },
    }),
  );
}
async function configure(page: Page) {
  await page.goto(`${origin}/strategies`);
  await expect(
    page.getByRole("button", { name: "0x1111...1111", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Configure strategy" }).nth(1).click();
  await page.getByLabel("Shared base inventory", { exact: true }).fill("1.25");
  await page
    .getByRole("button", { name: "Add paired asset", exact: true })
    .click();
  await page.getByRole("button", { name: /USDC USD Coin/ }).click();
}

test("matches the catalog on desktop and mobile, with live navigation", async ({
  page,
}) => {
  await page.goto(`${origin}/strategies`);
  await expect(
    page.getByRole("heading", { name: "Your liquidity. Your strategy." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Configure strategy" }),
  ).toHaveCount(3);
  await expect(
    page.getByRole("link", { name: "Multi-LP", exact: true }),
  ).toHaveAttribute("href", "/lp");
  await expect(page.getByText("Demo wallet", { exact: true })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Configure strategy" })
    .first()
    .click();
  await expect(
    page.getByRole("button", { name: "Review strategy", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Connect and authenticate wallet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My strategies" }).click();
  await expect(
    page.getByRole("heading", { name: "Your first strategy starts here." }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Discover strategies" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Build custom strategy", exact: true })
    .click();
  await expect(
    page.getByRole("combobox", { name: "Range behavior", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("validates inputs and preserves configuration through review and edit", async ({
  page,
}) => {
  await authenticate(page);
  await configure(page);
  await page.getByLabel("Shared base inventory", { exact: true }).fill("0");
  await page
    .getByRole("button", { name: "Review strategy", exact: true })
    .click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "positive funding amount",
  );
  await page.getByLabel("Shared base inventory", { exact: true }).fill("1.25");
  await page
    .getByRole("button", { name: "Review strategy", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review your plan", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Generate fresh proposal" }),
  ).toBeDisabled();
  await page.getByRole("checkbox").check();
  await expect(
    page.getByRole("button", { name: "Generate fresh proposal" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(
    page.getByLabel("Shared base inventory", { exact: true }),
  ).toHaveValue("1.25");
  await page
    .getByRole("button", { name: "Review strategy", exact: true })
    .click();
  await expect(page.getByRole("checkbox")).not.toBeChecked();
});

test("blocks proposal creation when route verification fails", async ({
  page,
}) => {
  await authenticate(page);
  let proposals = 0;
  await page.route("**/api/managed/proposals", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { proposals: [] } });
    proposals++;
    return route.fulfill({ json: {} });
  });
  await page.route("**/api/tokens/validate", (route) =>
    route.fulfill({
      status: 503,
      json: { error: "Token verification unavailable. Try again." },
    }),
  );
  await configure(page);
  await page
    .getByRole("button", { name: "Review strategy", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Generate fresh proposal" }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Token verification unavailable",
  );
  expect(proposals).toBe(0);
  await expect(
    page.getByRole("button", { name: "Generate fresh proposal" }),
  ).toBeEnabled();
});

test("submits exact verified funding intent and displays the actual review", async ({
  page,
}) => {
  await authenticate(page);
  await page.route("**/api/tokens/validate", (route) => {
    const body = route.request().postDataJSON();
    const metadata = (decimals: number) => ({
      status: "verified",
      registryDecimals: decimals,
      onchainDecimals: decimals,
      warnings: [],
    });
    return route.fulfill({
      json: {
        chainId: 42161,
        source: {
          address: body.src,
          symbol: "WETH",
          decimals: 18,
          selectable: true,
        },
        destination: usdc,
        metadata: { source: metadata(18), destination: metadata(6) },
      },
    });
  });
  await page.route("**/api/managed/funding-route", (route) =>
    route.fulfill({
      json: {
        status: "available",
        amountIn: route.request().postDataJSON().amount,
        amountOut: "2000000000",
        checkedAt: Date.now(),
      },
    }),
  );
  let intent: Record<string, unknown> | undefined;
  await page.route("**/api/managed/proposals", (route) => {
    if (route.request().method() === "GET")
      return route.fulfill({ json: { proposals: [] } });
    intent = route.request().postDataJSON().intent;
    return route.fulfill({
      json: {
        review: {
          status: "failed",
          errors: ["Test review declined to open liquidity."],
          coverage: [],
          provider: "test",
          model: "test",
          createdAt: Date.now(),
        },
      },
    });
  });
  await configure(page);
  await page
    .getByRole("button", { name: "Review strategy", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Generate fresh proposal" }).click();
  await expect(
    page.getByRole("heading", { name: "Fresh proposal", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(
    "Test review declined to open liquidity.",
  );
  expect(intent).toMatchObject({
    recipeId: "managed-concentrated-lp",
    chainId: 42161,
    budget: "1250000000000000000",
    gasReserveWei: "2000000000000000",
    intervalMs: 900000,
    holdingPeriodMs: 604800000,
  });
  expect(intent?.permittedAssets).toHaveLength(2);
});

test("keeps the design playground simulated", async ({ page }) => {
  await page.goto(`${origin}/strategies/design`);
  await page
    .getByRole("button", { name: "Configure strategy" })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Review strategy", exact: true })
    .click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create demo strategy" }).click();
  await expect(
    page.getByRole("heading", { name: "Strategy activity", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Your real wallet has not changed",
  );
});
