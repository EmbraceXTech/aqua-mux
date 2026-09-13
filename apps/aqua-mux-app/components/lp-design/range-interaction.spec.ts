import { test, expect, type Page } from "@playwright/test";

const url = process.env.LP_DESIGN_URL ?? "http://127.0.0.1:3100/lp/design";
const values = async (page: Page) => ({
  low: Number(await page.getByLabel("Min price", { exact: true }).inputValue()),
  high: Number(
    await page.getByLabel("Max price", { exact: true }).inputValue(),
  ),
});

async function drag(page: Page, name: string, deltaY: number) {
  const handle = page.getByRole("slider", { name });
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2,
    box.y + box.height / 2 + deltaY,
    { steps: 10 },
  );
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.mouse.up();
}

test("dragging, presets, inputs, pair state, and review stay synchronized", async ({
  page,
}) => {
  await page.goto(url);
  const initial = await values(page);
  await drag(page, "Maximum LP price", -25);
  let next = await values(page);
  expect(next.high).toBeGreaterThan(initial.high);
  expect(next.low).toBe(initial.low);
  await drag(page, "Minimum LP price", 20);
  next = await values(page);
  expect(next.low).toBeLessThan(initial.low);
  await expect(
    page.getByRole("button", { name: "Custom", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "± 10%", exact: true }).click();
  expect(await values(page)).toEqual({ low: 0.97605, high: 1.19295 });
  const band = page.getByRole("button", { name: "Move selected price range" });
  const box = (await band.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 15, {
    steps: 5,
  });
  await page.mouse.up();
  next = await values(page);
  expect(next.low).toBeGreaterThan(0.97605);
  expect(next.high - next.low).toBeCloseTo(1.19295 - 0.97605, 8);

  await page
    .locator("#lp-range-editor button")
    .filter({ hasText: "ARB" })
    .click();
  expect(await values(page)).toEqual({ low: 0.00036, high: 0.00048 });
  await page.getByRole("slider", { name: "Minimum LP price" }).focus();
  await page.keyboard.press("ArrowUp");
  expect((await values(page)).low).toBe(0.00036001);
  await page
    .locator("#lp-range-editor button")
    .filter({ hasText: "USDC" })
    .click();
  expect(await values(page)).toEqual(next);

  await page.getByLabel("Min price", { exact: true }).fill("1");
  await expect(
    page.getByRole("slider", { name: "Minimum LP price" }),
  ).toHaveAttribute("aria-valuenow", "1");
  await page.getByLabel("Max price", { exact: true }).fill("0.5");
  await expect(page.locator("#range-validation")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review liquidity positions" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "± 5%", exact: true }).click();
  await expect(page.locator("#range-validation")).toBeHidden();
  await page.getByRole("button", { name: "Full range", exact: true }).click();
  await expect(page.getByRole("slider")).toHaveCount(0);
  await page.getByRole("button", { name: "Use a custom range" }).click();
  expect(await values(page)).toEqual({ low: 1.030275, high: 1.138725 });
  await page
    .getByRole("button", { name: "Review liquidity positions" })
    .click();
  await expect(page.getByRole("dialog")).toContainText("1.030275 to 1.138725");
});

test("drag clamps boundaries and Escape cancels an in-progress change", async ({
  page,
}) => {
  await page.goto(url);
  await drag(page, "Minimum LP price", -200);
  let next = await values(page);
  expect(next.low).toBeLessThan(next.high);
  await page.getByRole("button", { name: "± 20%", exact: true }).click();
  next = await values(page);
  const handle = page.getByRole("slider", { name: "Maximum LP price" });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 - 20);
  await page.keyboard.press("Escape");
  await page.mouse.up();
  expect(await values(page)).toEqual(next);
});

test("touch dragging works without scrolling the page", async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();
  await page.goto(url);
  const handle = page.getByRole("slider", { name: "Maximum LP price" });
  await handle.scrollIntoViewIfNeeded();
  const before = await values(page);
  const scrollY = await page.evaluate(() => window.scrollY);
  const box = (await handle.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x, y: y - 25 }],
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  expect((await values(page)).high).toBeGreaterThan(before.high);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
  await context.close();
});
