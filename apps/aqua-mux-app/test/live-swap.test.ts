import assert from "node:assert/strict";
import test from "node:test";
import { parseUnits, type Address } from "viem";
import {
  buildSwap,
  finishQuote,
  getToken,
  initialDrafts,
  routeLegs,
  row,
  SWAP_CHAIN,
  tokenUnits,
  type SwapRequest,
} from "../lib/live-swap";

const owner = "0x0000000000000000000000000000000000000001" as Address;
function request(): SwapRequest {
  const draft = initialDrafts()["multi-out"];
  draft.output = [row("USDC", "", "100")];
  draft.input[0].amount = "0.0001";
  return { chainId: SWAP_CHAIN, mode: "multi-out", draft, slippageBps: 50 };
}

test("builds an exact-input 1inch request", () => {
  const { request: parsed, legs } = routeLegs(request());
  assert.equal(legs.length, 1);
  assert.equal(legs[0].amount, String(parseUnits("0.0001", 18)));
  const quote = finishQuote(parsed, legs, [100000n], 123n, 1000);
  assert.equal(quote.amounts.input[0], "0.0001");
  assert.equal(quote.limits.output[0], "0.0995");
});

test("uses only the validated 1inch transaction", () => {
  const { request: parsed, legs } = routeLegs(request());
  const quote = finishQuote(parsed, legs, [100000n], 123n, 1000);
  quote.transactions = [
    {
      to: "0x111111125421ca6dc452d289314280a0f8842a65",
      data: "0x1234",
      value: quote.legs[0].amountIn,
    },
  ];
  assert.deepEqual(buildSwap(quote, 0, 2000), {
    ...quote.transactions[0],
    value: BigInt(quote.legs[0].amountIn),
  });
});

test("supports multi-leg exact-input routes and rejects exact output", () => {
  const multi = request();
  multi.draft.output.push(row("WBTC", "", "50"));
  multi.draft.output[0].weight = "50";
  assert.equal(routeLegs(multi).legs.length, 2);
  const exactOutput = request();
  exactOutput.draft.exact = "output";
  assert.throws(() => routeLegs(exactOutput), /exact-input/);
});

test("rejects invalid amounts and expired or incomplete transactions", () => {
  for (const value of ["0", "-1", "1e3", "NaN", "01", "0.0000001", "1."])
    assert.throws(() => tokenUnits(value, "USDC"));
  assert.equal(tokenUnits("1.000001", "USDC"), 1000001n);
  const { request: parsed, legs } = routeLegs(request());
  const quote = finishQuote(parsed, legs, [100000n], 123n, 1000);
  assert.throws(() => buildSwap(quote, 0, 2000), /no 1inch transaction/);
  quote.transactions = [{ to: owner, data: "0x12", value: "0" }];
  assert.throws(() => buildSwap(quote, 0, 31000), /expired/);
});

test("rejects a quote whose slippage minimum rounds to zero", () => {
  const { request: routed, legs } = routeLegs(request());
  assert.throws(() => finishQuote(routed, legs, [1n], 1n), /rounds to zero/);
  assert.equal(getToken(legs[0].output).symbol, "USDC");
});
