import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeFunctionData, parseAbi } from "viem";
import { splitAmount, units, validateBasket, evenWeights } from "../lib/model";
import { tokens, NATIVE, AQUA, SWAP_VM } from "../lib/config";
import { makeStrategy } from "../lib/strategy";
const list = tokens(42161),
  usdc = list.find((t) => t.symbol === "USDC")!,
  wbtc = list.find((t) => t.symbol === "WBTC")!;
const basket = {
  chainId: 42161,
  source: NATIVE,
  mode: "swap",
  amount: "1",
  slippageBps: 50,
  feeBps: 5,
  range: { minPct: -20, maxPct: 20 },
  legs: [
    { address: usdc.address, bps: 5000, amount: "1" },
    { address: wbtc.address, bps: 5000, amount: "1" },
  ],
};
test("split preserves every wei and assigns remainder to the final leg", () => {
  for (const total of [7n, 1000000000000000001n, 10n ** 38n]) {
    const parts = splitAmount(total, [3333, 3333, 3334]);
    assert.equal(
      parts.reduce((a, b) => a + b, 0n),
      total,
    );
    assert.ok(parts.every((p) => p > 0n));
  }
});
test("invalid sums, fractional weights and dust are rejected", () => {
  assert.throws(() => splitAmount(100n, [5000, 4999]));
  assert.throws(() => splitAmount(100n, [4999.5, 5000.5]));
  assert.throws(() => splitAmount(1n, [5000, 5000]));
});
test("token amounts reject silent rounding, exponent notation, negative and zero", () => {
  for (const bad of ["1.0000001", "1e3", "-1", "0", "Infinity"])
    assert.throws(() => units(bad, 6));
  assert.equal(units("1.000001", 6), 1000001n);
});
test("basket rejects duplicate outputs, wrong-chain addresses and input overlap", () => {
  assert.equal(validateBasket(basket).legs.length, 2);
  assert.throws(() =>
    validateBasket({ ...basket, legs: [basket.legs[0], basket.legs[0]] }),
  );
  assert.throws(() => validateBasket({ ...basket, source: usdc.address }));
  assert.throws(() => validateBasket({ ...basket, chainId: 4663 }));
});
test("equal allocations always total exactly 100%", () => {
  for (let n = 2; n <= 6; n++)
    assert.equal(
      evenWeights(n).reduce((a, b) => a + b, 0),
      10000,
    );
});
test("SDK ship calls register the wallet as maker, sorted tokens and full shared base", () => {
  const maker = "0x0000000000000000000000000000000000000001";
  const a = makeStrategy(
    maker,
    usdc.address,
    wbtc.address,
    1000000n,
    1000n,
    5,
    { minPct: -20, maxPct: 20 },
    1n,
  );
  const b = makeStrategy(
    maker,
    usdc.address,
    wbtc.address,
    1000000n,
    1000n,
    5,
    { minPct: -20, maxPct: 20 },
    2n,
  );
  assert.notEqual(a.hash, b.hash);
  assert.equal(a.call.to, AQUA);
  assert.equal(a.order.maker.toLowerCase(), maker);
  const decoded = decodeFunctionData({
    abi: parseAbi([
      "function ship(address app,bytes strategy,address[] tokens,uint256[] amounts) returns(bytes32)",
    ]),
    data: a.call.data,
  });
  assert.equal(decoded.args[0].toLowerCase(), SWAP_VM);
  assert.deepEqual(
    decoded.args[2].map((x) => x.toLowerCase()),
    a.tokens,
  );
  assert.equal(decoded.args[3][a.tokens.indexOf(usdc.address)], 1000000n);
});
