import assert from "node:assert/strict";
import test from "node:test";
import {
  allocationTotal,
  customValidation,
  newCustomSettings,
  splitEqually,
  triggerLabel,
} from "./custom-strategy";

test("custom defaults have valid allocations and independent state", () => {
  const first = newCustomSettings();
  assert.equal(customValidation(first), null);
  first.markets[0].weight = 0;
  assert.equal(newCustomSettings().markets[0].weight, 60);
});

test("allocations reject missing markets, zero weights, duplicates, and wrong totals", () => {
  const settings = newCustomSettings();
  assert.match(customValidation({ ...settings, markets: [] })!, /at least one/);
  assert.match(
    customValidation({
      ...settings,
      markets: [{ symbol: "USDC", weight: 0 }],
    })!,
    /greater than 0/,
  );
  assert.match(
    customValidation({
      ...settings,
      markets: [
        { symbol: "USDC", weight: 50 },
        { symbol: "USDC", weight: 50 },
      ],
    })!,
    /only.*once/,
  );
  assert.match(
    customValidation({
      ...settings,
      markets: [{ symbol: "USDC", weight: 80 }],
    })!,
    /100%/,
  );
  assert.ok(
    customValidation({
      ...settings,
      markets: [{ symbol: "USDC", weight: NaN }],
    }),
  );
});

test("equal splits total exactly 100 for one through four markets", () => {
  const markets = ["USDC", "ARB", "wstETH", "GMX"].map((symbol) => ({
    symbol,
    weight: 0,
  })) as ReturnType<typeof newCustomSettings>["markets"];
  for (let count = 1; count <= 4; count++) {
    const settings = {
      ...newCustomSettings(),
      markets: splitEqually(markets.slice(0, count)),
    };
    assert.equal(allocationTotal(settings), 100);
    assert.equal(customValidation(settings), null);
  }
});

test("trigger summary respects enabled signals", () => {
  assert.equal(triggerLabel(newCustomSettings()), "Range exit");
  assert.equal(
    triggerLabel({ ...newCustomSettings(), rangeExit: false }),
    "Scheduled checks only",
  );
  assert.equal(
    triggerLabel({
      ...newCustomSettings(),
      inventoryDrift: true,
      driftPercent: 20,
    }),
    "Range exit · Inventory drift ≥ 20%",
  );
});
