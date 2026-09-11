import { expect, test } from "@playwright/test";
import { hexToString, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

test("legacy builder authenticates before credentialed quote and plan requests", async ({
  page,
}) => {
  const account = privateKeyToAccount(generatePrivateKey());
  await page.exposeFunction(
    "fixtureWalletRequest",
    async ({ method, params }: { method: string; params?: string[] }) => {
      if (method === "eth_requestAccounts" || method === "eth_accounts")
        return [account.address];
      if (method === "eth_chainId") return "0xa4b1";
      if (method === "personal_sign")
        return account.signMessage({ message: hexToString(params![0] as Hex) });
      throw new Error(`Unsupported fixture wallet method: ${method}`);
    },
  );
  await page.addInitScript(() => {
    window.ethereum = {
      request: (args) =>
        (
          window as unknown as {
            fixtureWalletRequest: (args: unknown) => Promise<unknown>;
          }
        ).fixtureWalletRequest(args),
    };
  });
  const requests: { endpoint: string; authenticated: boolean }[] = [];
  for (const endpoint of ["quote", "plan"]) {
    await page.route(`**/api/${endpoint}`, async (route) => {
      const authenticated = Boolean(
        route.request().headers().authorization?.startsWith("Bearer "),
      );
      requests.push({ endpoint, authenticated });
      await route.fulfill({
        status: authenticated ? 503 : 401,
        json: {
          error: authenticated
            ? `Labelled fixture: ${endpoint} unavailable.`
            : "Authentication required.",
        },
      });
    });
  }
  await page.goto("/");
  await page
    .getByRole("button", { name: "Connect wallet", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Connect browser wallet", exact: true })
    .click();
  await expect
    .poll(() =>
      requests.some((item) => item.endpoint === "quote" && item.authenticated),
    )
    .toBe(true);
  await page.getByRole("button", { name: "Strategies", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Choose how you provide liquidity" })).toBeVisible();
  const settledRequests = requests.length;
  await page.waitForTimeout(800);
  expect(requests).toHaveLength(settledRequests);
  await page.getByRole("button", { name: "Liquidity", exact: true }).click();
  for (const symbol of ["USDC", "WBTC", "LINK"])
    await page
      .getByRole("textbox", { name: `${symbol} paired amount`, exact: true })
      .fill("1");
  await page
    .getByRole("button", { name: "Review liquidity positions", exact: true })
    .click();
  await expect
    .poll(() =>
      requests.some((item) => item.endpoint === "plan" && item.authenticated),
    )
    .toBe(true);
  expect(requests.every((item) => item.authenticated)).toBe(true);
});
