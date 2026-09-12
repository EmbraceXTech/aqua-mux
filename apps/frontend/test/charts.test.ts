import { test } from "node:test";
import assert from "node:assert/strict";
import { chartPeriods, chartQuerySchema, basketSchema } from "../lib/model";
import { pairChartKey } from "../lib/price-range";
import { priceHistory } from "../lib/server/charts";
const base = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
const paired = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
test("chart keys normalize case but isolate direction and chain", () => {
  assert.equal(
    pairChartKey(42161, base, paired),
    pairChartKey(42161, base.toUpperCase(), paired.toUpperCase()),
  );
  assert.notEqual(
    pairChartKey(42161, base, paired),
    pairChartKey(42161, paired, base),
  );
  assert.notEqual(
    pairChartKey(42161, base, paired),
    pairChartKey(1, base, paired),
  );
});
test("chart queries accept each displayed period and reject obsolete periods", () => {
  for (const period of chartPeriods)
    assert.equal(
      chartQuerySchema.parse({
        chainId: 42161,
        token0: base,
        token1: paired,
        period,
      }).period,
      period,
    );
  assert.equal(
    chartQuerySchema.safeParse({
      chainId: 42161,
      token0: base,
      token1: paired,
      period: "1Y",
    }).success,
    false,
  );
});
test("each LP leg retains its own validated range", () => {
  const result = basketSchema.parse({
    chainId: 42161,
    source: base,
    mode: "liquidity",
    amount: "1",
    slippageBps: 50,
    feeBps: 5,
    range: "full",
    legs: [
      {
        address: paired,
        bps: 5000,
        amount: "100",
        range: { minPct: -10, maxPct: 25 },
      },
      {
        address: "0x0000000000000000000000000000000000000001",
        bps: 5000,
        amount: "1",
        range: "full",
      },
    ],
  });
  assert.deepEqual(
    result.legs.map((leg) => leg.range),
    [{ minPct: -10, maxPct: 25 }, "full"],
  );
});
test("candle requests use matching date windows and preserve unknown versus zero volume", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.ONEINCH_API_KEY;
  process.env.ONEINCH_API_KEY = "fixture";
  const windows = [7, 30, 90, 180, undefined];
  let index = 0;
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    assert.ok(url.pathname.includes(`/chart/tradingview/${base}/${paired}/`));
    const to = Number(url.searchParams.get("toTimestamp"));
    const from = Number(url.searchParams.get("fromTimestamp"));
    const days = windows[index++];
    assert.equal(from, days ? to - days * 86400 : 1);
    return Response.json({
      data: [
        { timestamp: to - 5, close: 12, volume0: 0 },
        { timestamp: to - 10, close: 10, volume0: 42 },
        { timestamp: to - 1, close: 13 },
        { timestamp: to + 1, close: 14, volume0: 1 },
        { timestamp: to - 2, close: 0, volume0: 10 },
      ],
    });
  };
  try {
    for (const period of chartPeriods) {
      const points = await priceHistory(42161, base, paired, period);
      assert.deepEqual(
        points.map((p) => p.value),
        [10, 12, 13],
      );
      assert.deepEqual(
        points.map((p) => p.volume),
        [42, 0, undefined],
      );
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.ONEINCH_API_KEY;
    else process.env.ONEINCH_API_KEY = originalKey;
  }
});
