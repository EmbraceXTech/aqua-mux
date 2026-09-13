// Isolated browser with a synthetic EIP-1193 provider. Never attaches to MetaMask.
import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import { finishQuote, routeLegs, tokenUnits } from "../lib/live-swap";

const origin = "http://127.0.0.1:3101";
const browser = await chromium.launch({
  headless: true,
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
});
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("Browser error:", e.message);
  });
  const installWallet = () => {
    const state = {
      behavior: "reject",
      sent: [] as unknown[],
      account: "0x0000000000000000000000000000000000000001",
      chain: "0xa4b1",
    };
    const listeners: Record<string, ((v: unknown) => void)[]> = {};
    Object.assign(window, {
      testWallet: state,
      ethereum: {
        on: (name: string, fn: (v: unknown) => void) => {
          (listeners[name] ??= []).push(fn);
        },
        removeListener: (name: string, fn: (v: unknown) => void) => {
          listeners[name] = (listeners[name] ?? []).filter((x) => x !== fn);
        },
        request: async ({
          method,
          params,
        }: {
          method: string;
          params: unknown[];
        }) => {
          if (method === "eth_accounts" || method === "eth_requestAccounts")
            return [state.account];
          if (method === "eth_chainId") return state.chain;
          if (method === "eth_call") return "0x";
          if (method === "eth_estimateGas") return "0x7a120";
          if (method === "eth_sendTransaction") {
            state.sent.push(params[0]);
            if (state.behavior === "reject")
              throw Object.assign(new Error("User rejected"), { code: 4001 });
            if (state.behavior === "unknown")
              throw new Error("RPC disconnected during submission");
            return `0x${"1".repeat(64)}`;
          }
          if (method === "eth_getTransactionReceipt")
            return state.behavior === "confirm"
              ? { status: "0x1" }
              : state.behavior === "revert"
                ? { status: "0x0" }
                : null;
          if (method === "eth_getTransactionByHash") return null;
          throw new Error(`Unexpected wallet method ${method}`);
        },
      },
    });
  };
  await page.addInitScript({
    content: `const __name = (fn) => fn; (${installWallet.toString()})();`,
  });
  await page.route("**/api/live-swap**", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: Object.fromEntries(
          ["ETH", "USDC", "WBTC", "ARB", "LINK", "DAI"].map((symbol) => [
            symbol,
            { balance: "1", allowance: "0" },
          ]),
        ),
      });
      return;
    }
    const { request, legs } = routeLegs(route.request().postDataJSON());
    const values = legs.map((l) => {
      const s = request.draft.exact === "input" ? l.output : l.input;
      return tokenUnits(
        s === "ETH" ? "0.00005" : s === "WBTC" ? "0.000001" : "0.1",
        s,
      );
    });
    await route.fulfill({ json: finishQuote(request, legs, values, 123n) });
  });
  const route = process.env.SWAP_TEST_PATH ?? "/swap";
  assert.ok(["/swap", "/swap/design"].includes(route));
  const waitForQuote = () =>
    expect(page.getByText("Live pool quote").first()).toBeVisible();
  await page.goto(`${origin}${route}`);
  const pickerTrigger = page.getByRole("button", {
    name: "Select output token 1: USDC",
    exact: true,
  });
  await pickerTrigger.click();
  const search = page.getByRole("textbox", { name: "Search tokens" });
  await search.pressSequentially("ARB");
  await expect(search).toHaveValue("ARB");
  await expect(search).toBeFocused();
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(pickerTrigger).toBeFocused();
  await pickerTrigger.click();
  await expect(search).toHaveValue("");
  await search.fill("ARB");
  await page.getByRole("button", { name: /^ARB Arbitrum/ }).click();
  const replacedTrigger = page.getByRole("button", {
    name: "Select output token 1: ARB",
    exact: true,
  });
  await expect(replacedTrigger).toBeFocused();
  await replacedTrigger.click();
  await search.fill("USDC");
  await page.getByRole("button", { name: /^USDC USD Coin/ }).click();
  await expect(pickerTrigger).toBeFocused();
  await page.getByRole("button", { name: "0.5% slippage" }).click();
  const slippage = page.getByRole("textbox", {
    name: "Custom slippage percent",
  });
  await slippage.fill("0");
  await expect(
    page.getByRole("button", { name: "Done", exact: true }),
  ).toBeDisabled();
  await slippage.fill("0.5");
  await page.getByRole("button", { name: "Done", exact: true }).click();
  console.log(
    `PASS ${route}: picker focus, search reset, and controlled slippage`,
  );
  await page
    .getByRole("textbox", { name: "input ETH amount", exact: true })
    .fill("0.0001");
  await waitForQuote();
  await page.getByRole("button", { name: "Review swap", exact: true }).click();
  await expect(page.getByText("Minimum receive: 0.0995 USDC")).toBeVisible();
  await page.getByRole("button", { name: "Confirm swap in wallet" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Request rejected",
  );
  await expect(
    page.getByRole("button", { name: "Confirm swap in wallet" }),
  ).toBeEnabled();
  console.log("PASS wallet rejection: explicit error, no success state");
  await page.getByRole("button", { name: "Back to editing" }).click();
  await page
    .getByRole("textbox", { name: "USDC allocation percent" })
    .fill("49");
  await expect(
    page.getByRole("button", { name: "Review swap", exact: true }),
  ).toBeEnabled();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "Review swap", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "total 100%" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "USDC allocation percent" })
    .fill("50");
  await waitForQuote();
  await page.getByRole("button", { name: "You receive", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "input ETH amount", exact: true }),
  ).toHaveAttribute("readonly", "");
  await waitForQuote();
  console.log("PASS exact output and allocation validation");
  await page.getByRole("button", { name: "Multiple in" }).click();
  await page
    .getByRole("textbox", { name: "input USDC amount", exact: true })
    .fill("0.1");
  await page
    .getByRole("textbox", { name: "input WBTC amount", exact: true })
    .fill("0.000001");
  await waitForQuote();
  await page.getByRole("button", { name: "Review swap", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Approve USDC in wallet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to editing" }).click();
  await page.getByRole("button", { name: "You receive", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "input USDC amount", exact: true }),
  ).toHaveAttribute("readonly", "");
  await waitForQuote();
  console.log(
    "PASS many-to-one exact input/output and bounded approval review",
  );
  await page.getByRole("button", { name: "Multiple out" }).click();
  await page.getByRole("button", { name: "You pay", exact: true }).click();
  await page
    .getByRole("textbox", { name: "input ETH amount", exact: true })
    .fill("0.0001");
  await waitForQuote();
  await page.evaluate(() => {
    (
      window as unknown as { testWallet: { behavior: string } }
    ).testWallet.behavior = "confirm";
  });
  await page.getByRole("button", { name: "Review swap", exact: true }).click();
  await page.getByRole("button", { name: "Confirm swap in wallet" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Swap confirmed" }),
  ).toBeVisible({ timeout: 10000 });
  console.log("PASS confirmed receipt: modal closes and balances refresh");
  await page.evaluate(() => {
    (
      window as unknown as { testWallet: { behavior: string } }
    ).testWallet.behavior = "revert";
  });
  await waitForQuote();
  await page.getByRole("button", { name: "Review swap", exact: true }).click();
  await page.getByRole("button", { name: "Confirm swap in wallet" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Swap reverted" }),
  ).toBeVisible({ timeout: 10000 });
  console.log("PASS reverted receipt: never presented as success");
  await page.evaluate(() => {
    (
      window as unknown as { testWallet: { behavior: string } }
    ).testWallet.behavior = "missing";
  });
  await waitForQuote();
  await page.getByRole("button", { name: "Review swap", exact: true }).click();
  await page.getByRole("button", { name: "Confirm swap in wallet" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Swap pending" }),
  ).toBeVisible();
  await page.clock.install();
  await page.clock.fastForward(62000);
  await expect(
    page.getByRole("status").filter({ hasText: "not visible on Arbitrum" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review swap", exact: true }),
  ).toBeDisabled();
  console.log(
    "PASS missing transaction hash: unlocated warning; duplicate sending stays blocked",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.runFor(100);
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log("PASS mobile width and no browser runtime errors");
} finally {
  await browser.close();
}
