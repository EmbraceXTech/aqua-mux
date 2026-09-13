import { test, expect } from "@playwright/test";

// All wallet and managed API data in this test is synthetic. No wallet is connected.
test("recovers a saved strategy and requires confirmation before stopping reviews", async ({
  page,
}) => {
  const owner = "0x1111111111111111111111111111111111111111";
  const baseToken = {
    address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    decimals: 18,
    symbol: "WETH",
  };
  const quoteToken = {
    address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    decimals: 6,
    symbol: "USDC",
  };
  const rule = (value: unknown) => ({ value, enforcedBy: "execution-broker" });
  const group = {
    id: "test-group",
    chainId: 42161,
    state: "active",
    inventory: [],
    config: {
      family: "lp",
      version: 1,
      recipeVersion: 1,
      recipeId: "wide-range-lp",
      chainId: 42161,
      maker: owner,
      pairs: [
        {
          baseToken,
          quoteToken,
          baseAmount: "1000000000000000000",
          quoteAmount: "2000000000",
          feeBps: 30,
          range: { kind: "full" },
          openingPrice: {
            baseToken: baseToken.address,
            quoteToken: quoteToken.address,
            numerator: "2000",
            denominator: "1",
          },
        },
      ],
      policy: {
        expiresAt: rule(Date.now() + 86400000),
        spendBudgets: rule([]),
        gasBudgetWei: rule("2000000000000000"),
        maxReferenceAgeMs: rule(60000),
        triggers: rule({
          rangeExit: true,
          inventoryDriftBps: 1000,
          upwardOnly: false,
        }),
        allowedActions: rule(["fund-and-open", "close"]),
        maxActions: rule(10),
        cooldownMs: rule(900000),
        maxSlippageBps: rule(50),
        allowedAssets: rule([baseToken.address, quoteToken.address]),
        allowedRoutes: rule([]),
      },
    },
  };
  let state = "running";
  const actions: string[] = [];
  await page.addInitScript(
    ({ owner }) =>
      sessionStorage.setItem(
        "aquamux-managed-session-v1",
        JSON.stringify({
          token: "test",
          owner,
          sessionId: "test",
          expiresAt: Date.now() + 600000,
          mode: "external",
        }),
      ),
    { owner },
  );
  await page.route("**/api/managed/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/bot")) {
      const action = route.request().postDataJSON().action;
      actions.push(action);
      if (action === "stop") state = "stopped";
      return route.fulfill({ json: {} });
    }
    const json = path.endsWith("/groups")
      ? { groups: [group] }
      : path.endsWith("/groups/test-group")
        ? {
            group,
            bot: {
              state,
              mode: "manual",
              runGeneration: 1,
              intervalMs: 900000,
            },
            reviews: [],
            transactions: [],
            movements: [],
            strategies: [],
          }
        : path.endsWith("/recovery")
          ? { attempts: [], unavailable: [] }
          : { proposals: [] };
    return route.fulfill({ json });
  });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(
    `${process.env.STRATEGIES_TEST_URL ?? "http://127.0.0.1:3101"}/strategies`,
  );
  await expect(
    page.getByRole("button", { name: "My strategies 1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "My strategies 1" }).click();
  await page
    .getByRole("button", { name: "Open strategy", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Strategy activity", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "No executable review", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Stop management", exact: true })
    .click();
  expect(actions).toEqual([]);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(actions).toEqual([]);
  await page
    .getByRole("button", { name: "Stop management", exact: true })
    .click();
  await page.getByRole("button", { name: "Confirm stop", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop management", exact: true }),
  ).toBeDisabled();
  expect(actions).toEqual(["stop"]);
  await expect(
    page.getByRole("button", { name: "Resume reviews", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});
