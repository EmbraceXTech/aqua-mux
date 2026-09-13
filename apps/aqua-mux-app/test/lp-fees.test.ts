import assert from "node:assert/strict";
import { test } from "node:test";
import { basketSchema } from "../lib/model";

const basket = {
  chainId: 42161,
  mode: "liquidity",
  source: "0x0000000000000000000000000000000000000001",
  amount: "1",
  slippageBps: 50,
  feeBps: 5,
  range: "full",
  legs: [
    {
      address: "0x0000000000000000000000000000000000000002",
      amount: "100",
      bps: 5000,
      feeBps: 1,
    },
    {
      address: "0x0000000000000000000000000000000000000003",
      amount: "200",
      bps: 5000,
      feeBps: 100,
    },
  ],
};
test("LP basket preserves independent fee tiers and ranges", () => {
  const parsed = basketSchema.parse({
    ...basket,
    legs: basket.legs.map((leg, i) => ({
      ...leg,
      range: i ? "full" : { minPct: -10, maxPct: 20 },
    })),
  });
  assert.deepEqual(
    parsed.legs.map((leg) => leg.feeBps),
    [1, 100],
  );
  assert.deepEqual(parsed.legs[0].range, { minPct: -10, maxPct: 20 });
  assert.equal(parsed.legs[1].range, "full");
});
test("legacy LP baskets may inherit the global fee", () => {
  const parsed = basketSchema.parse({
    ...basket,
    legs: basket.legs.map((leg) => ({ ...leg, feeBps: undefined })),
  });
  assert.deepEqual(
    parsed.legs.map((leg) => leg.feeBps ?? parsed.feeBps),
    [5, 5],
  );
});
test("LP fee tiers must be integer basis points within contract limits", () => {
  for (const feeBps of [0, -1, 101, 1.5]) {
    assert.equal(
      basketSchema.safeParse({
        ...basket,
        legs: [{ ...basket.legs[0], feeBps }, basket.legs[1]],
      }).success,
      false,
    );
  }
});
