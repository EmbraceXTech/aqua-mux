import { expect, test } from "@playwright/test";
import {
  exactAmount,
  exactPriceInput,
  parsePriceInput,
} from "../lib/managed-client/numeric-input";
import {
  captureManaged,
  base,
  quote,
  openManaged,
  connectDev,
  authenticateFixture,
  createDraft,
  readGroup,
} from "./managed-fixtures";

test("catalog preserves manual builders and has no portfolio handoff", async ({
  page,
}) => {
  await openManaged(page);
  await expect(
    page.getByRole("heading", { name: "Choose how you provide liquidity" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Not available yet" }),
  ).toBeDisabled();
  await expect(page.locator('a[href*="portfolio"]')).toHaveCount(0);
  await captureManaged(page, "catalog-desktop");
  await page.getByRole("button", { name: "Liquidity", exact: true }).click();
  await expect(
    page.getByRole("combobox", { name: "Price range pair" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Swap", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your token mix" }),
  ).toBeVisible();
});

test("registry search displays address identity and route uncertainty", async ({
  page,
}) => {
  await openManaged(page);
  await page
    .getByRole("button", { name: "Configure strategy", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Funding token", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search Funding token" })
    .fill(quote.address);
  const entry = page
    .locator(".managed-token-list button")
    .filter({ hasText: quote.address });
  await expect(entry).toBeVisible({ timeout: 30_000 });
  await expect(entry).toContainText("route not checked");
  await entry.click();
  await expect(
    page.getByRole("button", { name: "Funding token", exact: true }),
  ).toContainText("USDC");
  await expect(
    page.getByRole("button", { name: "Generate fresh proposal" }),
  ).toBeDisabled();
});

test("real durable group recovers, edits exactly, and starts and stops without signing", async ({
  page,
}) => {
  await authenticateFixture(page);
  const draft = await createDraft(page);
  await page.reload();
  await page.getByRole("button", { name: "Strategies", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(draft.id.slice(0, 8)) })
    .click();
  await expect(
    page.getByRole("button", { name: "No executable review" }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Edit proposal", exact: true })
    .click();
  await expect(
    page.getByLabel("Opening price, USDC per WETH pair 1"),
  ).toHaveValue("2500.123456789123456789");
  await page
    .getByRole("button", { name: "Save and invalidate old plan" })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit proposal", exact: true }),
  ).toBeVisible();
  await captureManaged(page, "strategy-draft");
  const after = await readGroup(page, draft.id);
  expect(after.group.config.pairs[0].openingPrice).toEqual(
    draft.config.pairs[0].openingPrice,
  );
  const strategy = page.getByRole("tab", { name: "Strategy", exact: true });
  await strategy.focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Positions", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByText("No registered positions in this group."),
  ).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: "Controls", exact: true }),
  ).toBeFocused();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Run bot", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Run bot", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Stop bot", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop bot", exact: true }),
  ).toBeDisabled();
  await captureManaged(page, "controls-stopped");
  const stopped = await readGroup(page, draft.id);
  expect(stopped.bot.state).toBe("stopped");
  expect(stopped.transactions).toHaveLength(0);
  await page
    .getByRole("button", { name: "Review close positions", exact: true })
    .click();
  await expect(page.locator(".managed-error")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("mobile catalog and proposal fit viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openManaged(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Configure strategy", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("textbox", { name: "Funding budget" }),
  ).toBeVisible();
  await captureManaged(page, "proposal-mobile");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("exact numeric inputs reject rounding and preserve fractional prices", () => {
  expect(() => exactAmount("0.0000001", 6)).toThrow();
  const price = {
    baseToken: base.address,
    quoteToken: quote.address,
    numerator: "1",
    denominator: "300000000000000000000",
  };
  expect(parsePriceInput(exactPriceInput(price))).toEqual({
    numerator: price.numerator,
    denominator: price.denominator,
  });
});

test("development wallet connection is explicit and revocable", async ({
  page,
}) => {
  await connectDev(page);
  await page.getByRole("button", { name: "Disconnect managed wallet" }).click();
  await expect(
    page.getByRole("button", { name: "Use local development wallet" }),
  ).toBeVisible();
  await expect(
    page.getByText("Local development wallet", { exact: true }),
  ).toHaveCount(0);
});
