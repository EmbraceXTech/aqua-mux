import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, parseUnits, type Address } from "viem";
import {
  buildSwap,
  finishQuote,
  initialDrafts,
  routeLegs,
  row,
  routerAbi,
  SWAP_CHAIN,
  tokenUnits,
  V3_ROUTER,
  WETH,
  type SwapRequest,
} from "../lib/live-swap";

const owner = "0x0000000000000000000000000000000000000001" as Address;
function request(
  mode: SwapRequest["mode"] = "multi-out",
  exact: "input" | "output" = "input",
): SwapRequest {
  const draft = initialDrafts()[mode];
  draft.exact = exact;
  draft.input.forEach((r) => {
    r.amount =
      r.symbol === "ETH" ? "0.0001" : r.symbol === "USDC" ? "0.1" : "0.000001";
  });
  draft.output.forEach((r) => {
    r.amount =
      r.symbol === "ETH" ? "0.0001" : r.symbol === "USDC" ? "0.1" : "0.000001";
  });
  return { chainId: SWAP_CHAIN, mode, draft, slippageBps: 50 };
}
function quote(mode: SwapRequest["mode"], exact: "input" | "output") {
  const { request: r, legs } = routeLegs(request(mode, exact));
  return finishQuote(
    r,
    legs,
    legs.map((l) =>
      tokenUnits(
        exact === "input"
          ? l.output === "ETH"
            ? "0.00001"
            : l.output === "USDC"
              ? "0.1"
              : "0.000001"
          : l.input === "ETH"
            ? "0.00001"
            : l.input === "USDC"
              ? "0.1"
              : "0.000001",
        exact === "input" ? l.output : l.input,
      ),
    ),
    123n,
    1000,
  );
}
for (const mode of ["multi-in", "multi-out"] as const) {
  for (const exact of ["input", "output"] as const) {
    test(`${mode} / exact ${exact} preserves exact amounts and encodes atomic legs`, () => {
      const q = quote(mode, exact);
      const tx = buildSwap(q, owner, 2000);
      assert.equal(tx.to, V3_ROUTER);
      const decoded = decodeFunctionData({ abi: routerAbi, data: tx.data });
      assert.equal(decoded.functionName, "multicall");
      if (decoded.functionName !== "multicall") throw Error("wrong method");
      const calls = decoded.args[0].map((data) =>
        decodeFunctionData({ abi: routerAbi, data }),
      );
      assert.equal(calls.length, 3);
      for (let i = 0; i < 2; i++) {
        const call = calls[i];
        assert.equal(
          call.functionName,
          exact === "input" ? "exactInputSingle" : "exactOutputSingle",
        );
        if (
          call.functionName !== "exactInputSingle" &&
          call.functionName !== "exactOutputSingle"
        )
          throw Error("wrong method");
        assert.equal(call.args[0].fee, 500);
        assert.equal(call.args[0].sqrtPriceLimitX96, 0n);
        assert.equal(call.args[0].deadline, 602n);
        assert.equal(
          call.args[0].recipient.toLowerCase(),
          mode === "multi-in" ? V3_ROUTER : owner,
        );
        if (call.functionName === "exactInputSingle") {
          assert.equal(call.args[0].amountIn, BigInt(q.legs[i].amountIn));
          assert.equal(call.args[0].amountOutMinimum, BigInt(q.legs[i].minOut));
        } else {
          assert.equal(call.args[0].amountOut, BigInt(q.legs[i].amountOut));
          assert.equal(call.args[0].amountInMaximum, BigInt(q.legs[i].maxIn));
        }
      }
      if (mode === "multi-in") {
        assert.equal(tx.value, 0n);
        assert.equal(calls[2].functionName, "unwrapWETH9");
      } else {
        assert.equal(
          tx.value,
          q.legs.reduce((sum, l) => sum + BigInt(l.maxIn), 0n),
        );
        assert.equal(calls[2].functionName, "refundETH");
      }
      q.request.draft[exact].forEach((r, i) =>
        assert.equal(
          tokenUnits(q.amounts[exact][i], r.symbol),
          tokenUnits(r.amount, r.symbol),
        ),
      );
      q.legs.forEach((l) => {
        assert.ok(BigInt(l.maxIn) >= BigInt(l.amountIn));
        assert.ok(BigInt(l.minOut) <= BigInt(l.amountOut));
      });
    });
  }
}
test("single swap and fees use a real fee tier", () => {
  const r = request();
  r.draft.output = [row("USDC", "", "100")];
  r.draft.output[0].fee = "0.3";
  const { legs } = routeLegs(r);
  assert.equal(legs.length, 1);
  assert.equal(legs[0].fee, 3000);
  assert.equal(legs[0].amount, String(parseUnits("0.0001", 18)));
});
test("allocations split a common token, not floating-point dollar estimates", () => {
  const r = request("multi-in", "output");
  r.draft.output[0].amount = "0.000000000000000003";
  const { legs } = routeLegs(r);
  assert.deepEqual(
    legs.map((l) => l.amount),
    ["1", "2"],
  );
});
test("slippage maximum rounds up and minimum rounds down", () => {
  const r = request("multi-out", "output");
  r.draft.output = [row("USDC", "0.000001", "100")];
  const routed = routeLegs(r);
  const q = finishQuote(routed.request, routed.legs, [1n], 1n);
  assert.equal(q.legs[0].maxIn, "2");
  assert.equal(q.legs[0].minOut, "1");
});
test("expired quotes cannot encode a transaction", () =>
  assert.throws(
    () => buildSwap(quote("multi-out", "input"), owner, 31000),
    /expired/,
  ));
test("ETH output unwraps only after all route legs, to the owner", () => {
  const q = quote("multi-in", "input");
  const batch = decodeFunctionData({
    abi: routerAbi,
    data: buildSwap(q, owner, 2000).data,
  });
  if (batch.functionName !== "multicall") throw Error("wrong method");
  const first = decodeFunctionData({ abi: routerAbi, data: batch.args[0][0] });
  if (first.functionName !== "exactInputSingle") throw Error("wrong method");
  assert.equal(first.args[0].tokenOut.toLowerCase(), WETH);
  const last = decodeFunctionData({
    abi: routerAbi,
    data: batch.args[0].at(-1)!,
  });
  assert.equal(last.functionName, "unwrapWETH9");
  if (last.functionName !== "unwrapWETH9") throw Error("wrong method");
  assert.equal(last.args[1], owner);
  assert.equal(
    last.args[0],
    q.legs.reduce((s, l) => s + BigInt(l.minOut), 0n),
  );
});
test("reject invalid amounts without silently rounding token precision", () => {
  for (const value of ["0", "-1", "1e3", "NaN", "01", "0.0000001", "1."])
    assert.throws(() => tokenUnits(value, "USDC"));
  assert.equal(tokenUnits("1.000001", "USDC"), 1000001n);
});
test("reject duplicates, invalid allocation, arbitrary fees, and wrong mode shape", () => {
  const duplicate = request();
  duplicate.draft.output[0].symbol = "ETH";
  assert.throws(() => routeLegs(duplicate), /different token/);
  const weights = request();
  weights.draft.output[0].weight = "49";
  assert.throws(() => routeLegs(weights), /total 100/);
  weights.draft.output[0].weight = "50.001";
  assert.throws(() => routeLegs(weights), /two decimal/);
  const fee = request();
  Object.assign(fee.draft.output[0], { fee: "0.2" });
  assert.throws(() => routeLegs(fee));
  const shape = request();
  shape.draft.input.push(row("ARB", "1"));
  assert.throws(() => routeLegs(shape), /one input/);
});
test("reject wrong chain and unsupported slippage", () => {
  for (const change of [
    { chainId: 1 },
    { slippageBps: 0 },
    { slippageBps: 501 },
    { slippageBps: 1.1 },
  ])
    assert.throws(() => routeLegs({ ...request(), ...change }));
});
test("reject dust splits and zero minimum output", () => {
  const r = request();
  r.draft.input[0].amount = "0.000000000000000001";
  assert.throws(() => routeLegs(r), /too small/);
  const routed = routeLegs(request());
  assert.throws(
    () => finishQuote(routed.request, routed.legs, [1n, 1n], 1n),
    /rounds to zero/,
  );
});
