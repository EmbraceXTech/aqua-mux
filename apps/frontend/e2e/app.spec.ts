import { test, expect } from "@playwright/test";
test("basket allocation, token picker, removal and settings", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "One token. Many possibilities." }),
  ).toBeVisible();
  await page.getByLabel("USDC allocation percent").fill("40");
  await expect(page.locator(".allocation-caption")).toContainText("90%");
  await expect(page.locator(".main-action")).toBeDisabled();
  await page.getByRole("button", { name: "Split equally" }).click();
  await expect(page.locator(".allocation-caption")).toContainText("100%");
  await page.getByRole("button", { name: "Add a token" }).click();
  await page.getByLabel("Search tokens").fill("DAI");
  await page.getByRole("dialog").getByRole("button", { name: /DAI/ }).click();
  await expect(page.locator(".output-row")).toHaveCount(4);
  await page.getByLabel("Remove DAI").click();
  await expect(page.locator(".output-row")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Transaction settings", exact: true })
    .click();
  await page.getByRole("button", { name: "1%", exact: true }).first().click();
  await page.getByLabel("Close dialog").click();
  await page
    .getByRole("button", { name: "Transaction settings", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "1%", exact: true }).first(),
  ).toHaveClass(/selected/);
  await page.getByLabel("Close dialog").click();
});
test("all chains load their own verified tokens", async ({ page }) => {
  await page.goto("/");
  await page.locator(".network-button").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /Robinhood Chain/ })
    .click();
  await expect(page.locator(".output-list")).toContainText("USDG");
  await expect(page.locator(".output-list")).toContainText("AAPL");
  await page.getByRole("button", { name: "Multi-LP" }).click();
  await expect(page.locator(".output-list")).toContainText("WETH / AAPL");
  await page.getByLabel("AAPL paired amount").fill("4");
  await page.getByRole("button", { name: "Full range", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Full range", exact: true }),
  ).toHaveClass(/selected/);
  await page.locator(".network-button").click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: /BNB Chain/ })
    .click();
  await expect(page.locator(".token-select")).toContainText("BNB");
  await expect(page.locator(".output-list")).toContainText("WBNB /");
});
test("missing wallet gives an honest error without simulated connection", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".main-action").click();
  await page.getByRole("button", { name: "Connect browser wallet" }).click();
  await expect(page.getByRole("dialog")).toContainText("wallet installed");
  await expect(page.locator(".wallet-button")).toContainText("Connect wallet");
});
test("a configured local development wallet prepares and submits through its server route", async ({
  page,
}) => {
  const account = "0x0000000000000000000000000000000000000001";
  const actions: { action: string; body?: unknown }[] = [];
  await page.route("**/api/managed/recovery", (route) =>
    route.fulfill({ json: { attempts: [], unavailable: [] } }),
  );
  await page.route("**/api/dev-wallet/*", async (route) => {
    const action = new URL(route.request().url()).pathname.split("/").pop()!;
    const body =
      route.request().method() === "POST"
        ? route.request().postDataJSON()
        : undefined;
    actions.push({ action, body });
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { available: true } });
      return;
    }
    if (action === "connect") {
      await route.fulfill({
        json: {
          mode: "local-development",
          label: "Local development wallet",
          account,
          token: "local-session-token",
          expiresAt: Date.now() + 120_000,
          maxFeeWei: "1000000000000000",
          networks: [],
        },
      });
      return;
    }
    if (action === "plan") {
      await route.fulfill({
        json: {
          id: "local-review",
          digest: "11".repeat(32),
          plan: {
            chainId: 42161,
            account,
            mode: "liquidity",
            calls: [
              {
                to: account,
                data: "0x",
                value: "0x0",
                label: "Local fixture registration",
              },
            ],
            strategies: [],
            summary: ["Local wallet transport fixture."],
            createdAt: Date.now(),
            expiresAt: Date.now() + 120_000,
          },
        },
      });
      return;
    }
    if (action === "execute" || action === "status") {
      await route.fulfill({
        json: {
          id: "local-transaction",
          state: "confirmed",
          transactionHash: `0x${"2".repeat(64)}`,
        },
      });
      return;
    }
    await route.fulfill({ status: 404, json: { error: "Unknown action" } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Multi-LP" }).click();
  for (const symbol of ["USDC", "WBTC", "LINK"])
    await page.getByLabel(`${symbol} paired amount`).fill("1");
  await page.locator(".main-action").click();
  await page
    .getByRole("button", { name: "Use local development wallet" })
    .click();
  await page
    .getByRole("button", { name: "Review liquidity positions" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Local fixture registration",
  );
  await page
    .getByRole("button", { name: "Confirm with development wallet" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Transaction confirmed");
  expect(actions).toEqual(
    expect.arrayContaining([
      { action: "status", body: undefined },
      { action: "connect", body: {} },
      {
        action: "plan",
        body: expect.objectContaining({ basket: expect.any(Object) }),
      },
      {
        action: "execute",
        body: {
          id: "local-review",
          digest: "11".repeat(32),
          confirmed: true,
        },
      },
    ]),
  );
});

test("mobile has no overflow, broken token images or browser errors", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".output-row").last().waitFor();
  await expect
    .poll(() =>
      page
        .locator("img:visible")
        .evaluateAll((imgs) =>
          imgs.every(
            (i) =>
              (i as HTMLImageElement).complete &&
              (i as HTMLImageElement).naturalWidth > 0,
          ),
        ),
    )
    .toBeTruthy();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
  await page.getByRole("button", { name: "Multi-LP" }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
});

test("switching from a wrapped-token basket keeps at least two valid LP pairs", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator(".output-token").nth(1).click();
  await page.getByLabel("Search tokens").fill("WETH");
  await page.getByRole("dialog").getByRole("button", { name: /WETH/ }).click();
  await page.getByLabel("Remove LINK").click();
  await page.getByRole("button", { name: "Multi-LP" }).click();
  await expect(page.locator(".output-row")).toHaveCount(2);
  await expect(page.locator(".output-list")).not.toContainText("WETH / WETH");
});

test("wallet review requests one atomic batch and waits for its receipt", async ({
  page,
}) => {
  const account = "0x0000000000000000000000000000000000000001";
  await page.addInitScript(
    ({ account }) => {
      const w = window as unknown as {
        ethereum: {
          request: (a: {
            method: string;
            params: unknown[];
          }) => Promise<unknown>;
        };
        sent: unknown[];
        polls: number;
      };
      w.sent = [];
      w.polls = 0;
      w.ethereum = {
        request: async (a) => {
          if (["eth_requestAccounts", "eth_accounts"].includes(a.method))
            return [account];
          if (a.method === "eth_chainId") return "0xa4b1";
          if (a.method === "personal_sign") return `0x${"1".repeat(130)}`;
          if (a.method === "wallet_getCapabilities")
            return { "0xa4b1": { atomic: { status: "supported" } } };
          if (a.method === "wallet_sendCalls") {
            w.sent.push(a.params[0]);
            return { id: "fixture-batch" };
          }
          if (a.method === "wallet_getCallsStatus") {
            w.polls++;
            return w.polls < 2
              ? { status: 100 }
              : {
                  status: 200,
                  atomic: true,
                  receipts: [
                    { transactionHash: "0x" + "1".repeat(64), status: "0x1" },
                  ],
                };
          }
          throw Error("Unexpected wallet request");
        },
      };
    },
    { account },
  );
  await page.route("**/api/balances?**", (route) =>
    route.fulfill({ json: { balances: {} } }),
  );
  await page.route("**/api/auth/challenge", (route) =>
    route.fulfill({ json: { id: "fixture-challenge", message: "Fixture" } }),
  );
  await page.route("**/api/auth/verify", (route) =>
    route.fulfill({
      json: {
        token: "fixture-session",
        owner: account,
        sessionId: "fixture-session-id",
        expiresAt: Date.now() + 120_000,
      },
    }),
  );
  await page.route("**/api/managed/recovery", (route) =>
    route.fulfill({ json: { attempts: [], unavailable: [] } }),
  );
  await page.route("**/api/plan", (route) =>
    route.fulfill({
      json: {
        chainId: 42161,
        account,
        mode: "liquidity",
        calls: [
          {
            to: account,
            data: "0x",
            value: "0x0",
            label: "Test fixture registration",
          },
        ],
        strategies: [],
        summary: ["Wallet transport fixture."],
        createdAt: Date.now(),
        expiresAt: Date.now() + 120000,
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Multi-LP" }).click();
  for (const symbol of ["USDC", "WBTC", "LINK"])
    await page.getByLabel(`${symbol} paired amount`).fill("1");
  await page.locator(".main-action").click();
  await page.getByRole("button", { name: "Connect browser wallet" }).click();
  await page
    .getByRole("button", { name: "Review liquidity positions" })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Test fixture registration",
  );
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("dialog")).toContainText("Transaction submitted");
  await expect(page.getByRole("dialog")).toContainText(
    "Transaction confirmed",
    { timeout: 8000 },
  );
  await expect(page.getByRole("dialog")).not.toContainText(
    "A submitted batch is not a confirmed transaction.",
  );

  expect(
    await page.evaluate(
      () => (window as unknown as { sent: { atomicRequired: boolean }[] }).sent,
    ),
  ).toEqual([
    expect.objectContaining({ atomicRequired: true, version: "2.0.0" }),
  ]);
});

test("wallet rejection does not expose RPC URLs or raw transaction data", async ({
  page,
}) => {
  const account = "0x0000000000000000000000000000000000000001";
  await page.addInitScript(
    ({ account }) => {
      window.ethereum = {
        request: async ({ method }) => {
          if (["eth_requestAccounts", "eth_accounts"].includes(method))
            return [account];
          if (method === "eth_chainId") return "0xa4b1";
          if (method === "personal_sign") return `0x${"1".repeat(130)}`;
          if (method === "wallet_getCapabilities")
            return { "0xa4b1": { atomic: { status: "supported" } } };
          if (method === "wallet_sendCalls")
            throw new Error(
              "Transaction creation failed.\n\nURL: https://rpc.example/private-credential\nRequest body: 0xRAW_TRANSACTION",
            );
          throw Error("Unexpected request");
        },
      };
    },
    { account },
  );
  await page.route("**/api/balances?**", (route) =>
    route.fulfill({ json: { balances: {} } }),
  );
  await page.route("**/api/auth/challenge", (route) =>
    route.fulfill({ json: { id: "fixture-challenge", message: "Fixture" } }),
  );
  await page.route("**/api/auth/verify", (route) =>
    route.fulfill({
      json: {
        token: "fixture-session",
        owner: account,
        sessionId: "fixture-session-id",
        expiresAt: Date.now() + 120_000,
      },
    }),
  );
  await page.route("**/api/managed/recovery", (route) =>
    route.fulfill({ json: { attempts: [], unavailable: [] } }),
  );
  await page.route("**/api/plan", (route) =>
    route.fulfill({
      json: {
        chainId: 42161,
        account,
        mode: "liquidity",
        calls: [
          {
            to: account,
            data: "0x",
            value: "0x0",
            label: "Fixture registration",
          },
        ],
        strategies: [],
        summary: [],
        createdAt: Date.now(),
        expiresAt: Date.now() + 120000,
      },
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Multi-LP" }).click();
  for (const symbol of ["USDC", "WBTC", "LINK"])
    await page.getByLabel(`${symbol} paired amount`).fill("1");
  await page.locator(".main-action").click();
  await page.getByRole("button", { name: "Connect browser wallet" }).click();
  await page
    .getByRole("button", { name: "Review liquidity positions" })
    .click();
  await page.getByRole("button", { name: "Confirm in wallet" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Transaction creation failed.",
  );
  await expect(page.getByRole("dialog")).not.toContainText(
    "private-credential",
  );
  await expect(page.getByRole("dialog")).not.toContainText("0xRAW_TRANSACTION");
});
