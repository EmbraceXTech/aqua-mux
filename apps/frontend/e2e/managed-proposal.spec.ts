import { expect, test, type Page } from "@playwright/test";
import type { RegistryToken, TokenPairValidation } from "../lib/token-registry";
import { authenticateFixture, base, quote } from "./managed-fixtures";

// Transport fixtures reproduce registry drift and the real API's single-flight
// admission rule. Authentication is real; no model or wallet transaction runs.
const tokens: RegistryToken[] = [
  quote,
  base,
  {
    address: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
    symbol: "WBTC",
    decimals: 8,
  },
].map((token) => ({
  ...token,
  chainId: 42161,
  name: token.symbol,
  tags: [],
  providers: [],
  registryStatus: "listed",
  routeStatus: "not_checked",
  risk: "unknown",
  selectable: true,
})) as RegistryToken[];

async function proposalFixture(
  page: Page,
  freshDecimals = 6,
  labelDrift = false,
) {
  await authenticateFixture(page);
  await page.route("**/api/tokens?**", (route) =>
    route.fulfill({
      json: {
        items: tokens,
        total: tokens.length,
        chainId: 42161,
        source: "labelled browser fixture",
        fetchedAt: new Date().toISOString(),
        stale: false,
        degraded: false,
        rejected: 0,
      },
    }),
  );
  let active = 0;
  let peak = 0;
  const proposals: { intent: { budget: string } }[] = [];
  await page.route("**/api/tokens/validate", async (route) => {
    const input = route.request().postDataJSON();
    active += 1;
    peak = Math.max(peak, active);
    if (active > 1) {
      active -= 1;
      await route.fulfill({
        status: 429,
        json: { error: "A token validation is already in progress." },
      });
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
    const source = { ...tokens[0], decimals: freshDecimals };
    const destination = tokens.find((token) => token.address === input.dst)!;
    const metadata = (decimals: number) => ({
      status: labelDrift ? ("mismatch" as const) : ("verified" as const),
      checkedAt: new Date().toISOString(),
      registryDecimals: decimals,
      onchainDecimals: decimals,
      ...(labelDrift ? { onchainSymbol: "CONTRACT" } : {}),
      warnings: labelDrift
        ? ["Registry symbol differs from the token contract."]
        : [],
    });
    const result: TokenPairValidation = {
      chainId: 42161,
      source,
      destination,
      metadata: {
        source: metadata(source.decimals),
        destination: metadata(destination.decimals),
      },
      route: {
        status: "unavailable",
        reason: "no_route",
        checkedAt: new Date().toISOString(),
        amountIn: input.amount,
      },
    };
    active -= 1;
    await route.fulfill({ json: result });
  });
  await page.route("**/api/managed/proposals", async (route) => {
    proposals.push(route.request().postDataJSON());
    await route.fulfill({
      status: 503,
      json: { error: "Labelled fixture: review provider unavailable." },
    });
  });
  await page
    .getByRole("button", { name: "Configure strategy", exact: true })
    .first()
    .click();
  async function select(label: string, address: string) {
    await page.getByRole("button", { name: label, exact: true }).click();
    await page
      .locator(".managed-token-list button")
      .filter({ hasText: address })
      .click();
  }
  await select("Funding token", quote.address);
  await page
    .getByRole("textbox", { name: "Funding budget", exact: true })
    .fill("1.25");
  await select("Add permitted paired asset", base.address);
  return { select, proposals, peak: () => peak };
}

test("labelled single-flight fixture validates two assets sequentially before proposal", async ({
  page,
}) => {
  const fixture = await proposalFixture(page);
  await fixture.select("Add permitted paired asset", tokens[2].address);
  await page.getByRole("button", { name: "Generate fresh proposal" }).click();
  await expect(page.locator(".managed-error")).toContainText(
    "Labelled fixture: review provider unavailable.",
  );
  expect(fixture.peak()).toBe(1);
  expect(fixture.proposals).toHaveLength(1);
  expect(fixture.proposals[0].intent.budget).toBe("1250000");
});

test("contract label drift with matching decimals still reaches proposal review", async ({
  page,
}) => {
  const fixture = await proposalFixture(page, 6, true);
  await page.getByRole("button", { name: "Generate fresh proposal" }).click();
  await expect(page.locator(".managed-error")).toContainText(
    "Labelled fixture: review provider unavailable.",
  );
  expect(fixture.proposals).toHaveLength(1);
  expect(fixture.proposals[0].intent.budget).toBe("1250000");
});

test("labelled registry drift fixture blocks budget parsed with stale funding decimals", async ({
  page,
}) => {
  const fixture = await proposalFixture(page, 18);
  await page.getByRole("button", { name: "Generate fresh proposal" }).click();
  await expect(page.locator(".managed-error")).toContainText(
    "Funding token decimals changed",
  );
  expect(fixture.proposals).toHaveLength(0);
});
