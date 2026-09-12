import { test, expect } from "@playwright/test";
const data = Array.from({ length: 31 }, (_, i) => ({
  time: 1785582000 + i * 86400,
  value: 2400 + Math.sin(i / 3) * 180,
  volume: 100 + (i % 7) * 35,
}));
test.beforeEach(async ({ page }) => {
  await page.route("**/api/chart", (route) =>
    route.fulfill({ json: { data, marketPrice: 2450 } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Multi-LP", exact: true }).click();
  await expect(page.locator(".price-line")).toBeVisible();
  await expect(page.locator(".sidebar .range-control")).toBeVisible();
  await expect(page.locator(".composer .range-control")).toHaveCount(0);
  await expect(page.locator(".sidebar .flow-card")).toHaveCount(0);
  await expect(page.locator(".sidebar .details-card")).toHaveCount(0);
});
test("LP pair settings, custom dragging, reciprocal prices, hover and zoom", async ({
  page,
}, testInfo) => {
  const chart = page.locator(".price-range-chart");
  const periods = chart.locator('[aria-label="Chart period"]');
  await expect(periods.getByRole("button")).toHaveText([
    "7d",
    "1m",
    "3m",
    "6m",
    "All",
  ]);
  await page.getByLabel("USDC paired amount").fill("2500");
  await expect(
    page.getByRole("spinbutton", { name: "Opening price", exact: true }),
  ).toHaveValue("2500");
  await page
    .getByRole("spinbutton", { name: "Opening price", exact: true })
    .fill("2600");
  await periods.getByRole("button", { name: "3m", exact: true }).click();
  const max = page.getByRole("slider", { name: "Maximum price handle" });
  const rect = (await max.boundingBox())!;
  await page.mouse.move(rect.x + rect.width * 0.6, rect.y + rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + rect.width * 0.6,
    rect.y + rect.height / 2 + 18,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(page.locator(".range-options .selected")).toHaveText("Custom");
  await expect(page.locator(".range-options button")).toHaveCount(5);
  const custom = await page.locator(".range-options button").nth(2).innerText();
  const maxPct = await max.getAttribute("aria-valuenow");
  await page.getByRole("button", { name: "+/- 10%", exact: true }).click();
  await page.getByRole("button", { name: custom, exact: true }).click();
  await expect(max).toHaveAttribute("aria-valuenow", maxPct!);
  const denomination = chart.locator('[aria-label="Price denomination"]');
  await denomination.getByRole("button", { name: "WETH", exact: true }).click();
  const inverse = Number(
    await page
      .getByRole("spinbutton", { name: "Opening price", exact: true })
      .inputValue(),
  );
  expect(inverse).toBeCloseTo(1 / 2600, 10);
  const path = await chart.locator(".price-line").getAttribute("d");
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  expect(await chart.locator(".price-line").getAttribute("d")).not.toBe(path);
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Auto scale", exact: true }).click();
  await expect(chart.locator(".price-line")).toHaveAttribute("d", path!);
  const pair = page.getByLabel("Price range pair");
  await page.locator(".output-row").nth(1).click({ position: { x: 8, y: 40 } });
  await expect(pair.locator("option:checked")).toHaveText("WETH / WBTC");
  await expect(page.locator(".output-row").nth(1)).toHaveClass(/selected/);
  await pair.selectOption({ label: "WETH / WBTC" });
  await expect(page.locator(".range-options .selected")).toHaveText("+/- 20%");
  await expect(
    periods.getByRole("button", { name: "1m", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Full range", exact: true }).click();
  await periods.getByRole("button", { name: "6m", exact: true }).click();
  await pair.selectOption({ label: "WETH / USDC" });
  await expect(page.locator(".range-options .selected")).toHaveText(custom);
  await expect(
    periods.getByRole("button", { name: "3m", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    denomination.getByRole("button", { name: "WETH", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(max).toHaveAttribute("aria-valuenow", maxPct!);
  expect(
    Number(
      await page
        .getByRole("spinbutton", { name: "Opening price", exact: true })
        .inputValue(),
    ),
  ).toBeCloseTo(inverse, 10);
  await page
    .getByRole("button", { name: "Set to market", exact: true })
    .click();
  expect(
    Number(
      await page
        .getByRole("spinbutton", { name: "Opening price", exact: true })
        .inputValue(),
    ),
  ).toBeCloseTo(1 / 2450, 10);
  await pair.selectOption({ label: "WETH / WBTC" });
  await expect(page.locator(".range-options .selected")).toHaveText(
    "Full range",
  );
  await expect(
    periods.getByRole("button", { name: "6m", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page
    .getByRole("button", { name: "Customize range", exact: true })
    .click();
  await expect(page.locator(".range-options .selected")).toHaveText("Custom");
  await expect(chart.locator(".volume-bar")).toHaveCount(data.length);
  const plot = (await chart.locator(".price-range-plot").boundingBox())!;
  for (const fraction of [0.02, 0.5, 0.98]) {
    await page.mouse.move(plot.x + plot.width * fraction, plot.y + 90);
    await expect(page.getByRole("tooltip")).toContainText("Vol");
    await expect(chart.locator(".price-crosshair")).toBeAttached();
    await expect(chart.locator(".price-crosshair")).toHaveCSS(
      "stroke-dasharray",
      "4px, 4px",
    );
    const tooltip = (await page.getByRole("tooltip").boundingBox())!;
    expect(tooltip.x).toBeGreaterThanOrEqual(plot.x);
    expect(tooltip.x + tooltip.width).toBeLessThanOrEqual(plot.x + plot.width);
  }
  await expect(chart.locator(".price-range-extreme").first()).toContainText(
    "High",
  );
  await expect(chart.locator(".price-range-extreme").last()).toContainText(
    "Low",
  );
  await chart.screenshot({
    path: testInfo.outputPath("chart-desktop.png"),
  });
  await page.mouse.move(0, 0);
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await page.getByRole("button", { name: "Multi-swap", exact: true }).click();
  await expect(chart).toHaveCount(0);
  await expect(page.locator(".allocation-caption")).toContainText("100%");
});
test("missing volume stays unavailable and the mobile chart fits", async ({
  page,
}, testInfo) => {
  await page.route("**/api/chart", (route) =>
    route.fulfill({
      json: { data: data.map(({ time, value }) => ({ time, value })) },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "7d", exact: true }).click();
  await expect(page.locator(".price-range-volume-empty")).toHaveText(
    "Volume unavailable",
  );
  await expect(page.locator(".volume-bar")).toHaveCount(0);
  await page.getByRole("slider", { name: "Maximum price handle" }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(page.locator(".range-options .selected")).toHaveText("Custom");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  await page
    .locator(".range-control")
    .screenshot({ path: testInfo.outputPath("chart-mobile.png") });
});
