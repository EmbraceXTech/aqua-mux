import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData, erc20Abi } from "viem";
import { NATIVE, SWAP_VM, classicRouter, tokens } from "../lib/config";
import { allocate, minimumOutput } from "../lib/managed-compiler/arithmetic";
import { compileLP, describeLPPrice } from "../lib/managed-compiler/lp";
import {
  AquaProgramBuilder,
  SwapVmProgram,
  instructions,
} from "@1inch/swap-vm-sdk";
import {
  buildLifecyclePlan,
  digest,
  reconcileResiduals,
} from "../lib/server/lifecycle";
import {
  aggregationSwapAbi,
  validateRoute,
} from "../lib/server/lifecycle/routes";
import {
  base,
  dependenciesFixture,
  hash,
  lifecycleFixture,
  native,
  now,
  quote,
  routeFixture,
} from "./lifecycle-fixtures";

test("allocation and minimum-output arithmetic conserve arbitrary large integers", () => {
  for (const total of [0n, 1n, 17n, 2n ** 200n])
    assert.equal(
      allocate(total, [3333, 3333, 3334]).reduce((a, b) => a + b),
      total,
    );
  assert.equal(minimumOutput(101n, 50), 100n);
  assert.throws(() => minimumOutput(1n, 9999), /zero/);
});
test("compiler binds conservative price and maker expiry with fresh hashes", () => {
  const request = lifecycleFixture(),
    compiled = compileLP(request.config, hash, now);
  assert.ok(compiled[0].program.startsWith("0x0d05"));
  const changed = structuredClone(request.config);
  assert.equal(changed.family, "lp");
  if (changed.family !== "lp") throw new Error("Expected LP fixture.");
  changed.pairs[0].openingPrice.numerator = "2001";
  assert.throws(() => compileLP(changed, hash, now), /Opening price/);
  assert.notEqual(
    compiled[0].hash,
    compileLP(request.config, `0x${"34".repeat(32)}`, now)[0].hash,
  );
});
test("fund-and-open reuses selected inventory and stores conservative accounting", async () => {
  const plan = await buildLifecyclePlan(
    lifecycleFixture(),
    dependenciesFixture(),
  );
  assert.equal(plan.registrations.length, 1);
  assert.equal(plan.inventoryBefore.length, 2);
  assert.deepEqual(plan.inventoryBefore, plan.conservativeInventoryAfter);
  assert.equal(plan.simulation.callsDigest, digest(plan.calls));
});
test("funding retains disjoint native backing after shortage purchase", async () => {
  const request = lifecycleFixture();
  request.inventory = [{ token: native, amount: "2000000000000000000" }];
  request.funding = {
    token: native,
    amount: "2000000000000000000",
    purchases: [
      {
        token: quote,
        amountIn: "1000000000000000000",
        minimumAmountOut: "2000000000",
      },
    ],
  };
  const plan = await buildLifecyclePlan(request, dependenciesFixture());
  assert.equal(
    plan.calls.reduce((sum, c) => sum + BigInt(c.value), 0n),
    2000000000000000000n,
  );
  assert.equal(
    plan.conservativeInventoryAfter.find(
      (i) => i.token.address === base.address,
    )?.amount,
    "1000000000000000000",
  );
  request.funding.purchases[0].amountIn = "1000000000000000001";
  await assert.rejects(
    buildLifecyclePlan(request, dependenciesFixture()),
    /funding budget/,
  );
});
test("duplicate real balances and purchasing assets already present are rejected", async () => {
  const request = lifecycleFixture();
  request.inventory.push(request.inventory[0]);
  await assert.rejects(
    buildLifecyclePlan(request, dependenciesFixture()),
    /Duplicate real/,
  );
  request.inventory.pop();
  request.inventory.push({ token: native, amount: "1" });
  request.funding = {
    token: native,
    amount: "1",
    purchases: [{ token: quote, amountIn: "1", minimumAmountOut: "1" }],
  };
  await assert.rejects(
    buildLifecyclePlan(request, dependenciesFixture()),
    /shortage/,
  );
});
test("gas reserve, stale snapshots and failed atomic simulations block plans", async () => {
  const request = lifecycleFixture(),
    deps = dependenciesFixture();
  request.gasReserveWei = "10000000000000000000";
  await assert.rejects(buildLifecyclePlan(request, deps), /gas reserve/);
  request.gasReserveWei = "1";
  const snapshot = deps.snapshot;
  deps.snapshot = async (r) => ({
    ...(await snapshot(r)),
    observedAt: now - 30001,
  });
  await assert.rejects(buildLifecyclePlan(request, deps), /stale/);
  deps.snapshot = snapshot;
  const simulate = deps.simulate;
  deps.simulate = async (p) => ({ ...(await simulate(p)), atomic: false });
  await assert.rejects(buildLifecyclePlan(request, deps), /whole-batch/);
});
test("close is route-independent and replacement keeps old hash links", async () => {
  const request = lifecycleFixture();
  request.kind = "close";
  request.previous = [
    { app: SWAP_VM, hash, tokens: [base.address, quote.address].sort() },
  ];
  const deps = dependenciesFixture();
  deps.quote = async () => {
    throw new Error("Route outage");
  };
  const close = await buildLifecyclePlan(request, deps);
  assert.equal(close.calls.length, 1);
  assert.equal(close.registrations.length, 0);
  request.kind = "replace";
  const replacement = await buildLifecyclePlan(request, deps);
  assert.equal(replacement.registrations[0].replaces, hash);
  assert.equal(replacement.retirements[0].hash, hash);
});
test("close conversion deduplicates target and refuses unrelated amounts", async () => {
  const request = lifecycleFixture();
  request.kind = "close-and-convert";
  request.previous = [
    { app: SWAP_VM, hash, tokens: [base.address, quote.address].sort() },
  ];
  request.conversion = { targetToken: base, amounts: request.inventory };
  const plan = await buildLifecyclePlan(request, dependenciesFixture());
  assert.equal(plan.calls.filter((c) => c.label === "Test route").length, 1);
  request.conversion.amounts = [{ token: quote, amount: "2000000001" }];
  await assert.rejects(
    buildLifecyclePlan(request, dependenciesFixture()),
    /exceeds selected/,
  );
});
test("encoded route minimum and receiver override untrusted quote descriptions", () => {
  const request = {
    chainId: 42161,
    maker: lifecycleFixture().config.maker,
    source: native,
    destination: quote,
    amountIn: "100",
    minimumAmountOut: "100",
    slippageBps: 50,
  };
  const route = routeFixture(request);
  assert.equal(
    decodeFunctionData({ abi: aggregationSwapAbi, data: route.call.data })
      .args[1].minReturnAmount,
    100n,
  );
  assert.throws(
    () => validateRoute({ ...request, maker: NATIVE }, route, now),
    /calldata/,
  );
  assert.throws(
    () => validateRoute(request, { ...route, minimumAmountOut: "99" }, now),
    /calldata/,
  );
  assert.throws(
    () => validateRoute(request, { ...route, quotedAt: now - 30001 }, now),
    /stale/,
  );
});
test("residual reconciliation reports excess and shortfall from observed balances", () => {
  const before = [{ token: quote, amount: "10" }];
  const after = [{ token: quote, amount: "13" }];
  assert.equal(reconcileResiduals(before, before, after)[0].residual, "3");
  assert.equal(reconcileResiduals(after, before, before)[0].shortfall, "3");
  assert.throws(() => reconcileResiduals(before, before, []), /unknown/);
});

test("bounded price encoding preserves quote-per-base semantics after token sorting", () => {
  const request = lifecycleFixture();
  if (request.config.family !== "lp") throw new Error("Expected LP fixture.");
  const pair = request.config.pairs[0];
  pair.range = {
    kind: "bounded",
    lower: { ...pair.openingPrice, numerator: "1600" },
    upper: { ...pair.openingPrice, numerator: "2400" },
  };
  pair.openingPrice = describeLPPrice(pair);
  const forward = compileLP(request.config, hash, now)[0];
  request.config.pairs[0] = {
    ...pair,
    baseToken: pair.quoteToken,
    quoteToken: pair.baseToken,
    baseAmount: pair.quoteAmount,
    quoteAmount: pair.baseAmount,
    openingPrice: {
      baseToken: quote.address,
      quoteToken: base.address,
      numerator: "1",
      denominator: "2000",
    },
    range: {
      kind: "bounded",
      lower: {
        baseToken: quote.address,
        quoteToken: base.address,
        numerator: "1",
        denominator: "2400",
      },
      upper: {
        baseToken: quote.address,
        quoteToken: base.address,
        numerator: "1",
        denominator: "1600",
      },
    },
  };
  request.config.pairs[0].openingPrice = describeLPPrice(
    request.config.pairs[0],
  );
  assert.deepEqual(
    compileLP(request.config, hash, now)[0].encodedBounds,
    forward.encodedBounds,
  );
});

test("concentrated preview rejects raw reserve price and accepts encoded virtual spot", () => {
  const request = lifecycleFixture();
  if (request.config.family !== "lp") throw new Error("Expected LP fixture.");
  const pair = request.config.pairs[0];
  pair.range = {
    kind: "bounded",
    lower: { ...pair.openingPrice, numerator: "1000" },
    upper: { ...pair.openingPrice, numerator: "3000" },
  };
  assert.throws(() => compileLP(request.config, hash, now), /virtual reserves/);
  pair.openingPrice = describeLPPrice(pair);
  assert.ok(
    Number(pair.openingPrice.numerator) /
      Number(pair.openingPrice.denominator) <
      1800,
  );
  assert.equal(compileLP(request.config, hash, now).length, 1);
});

test("snapshot freshness deadline survives a slow whole-batch simulation", async () => {
  const request = lifecycleFixture(),
    deps = dependenciesFixture();
  let clock = now;
  deps.now = () => clock;
  const simulate = deps.simulate;
  deps.simulate = async (plan) => {
    clock += 31000;
    return { ...(await simulate(plan)), simulatedAt: clock };
  };
  await assert.rejects(buildLifecyclePlan(request, deps), /whole-batch/);
});

test("compiler preserves distinct per-pair fees and inward square-root bounds", () => {
  const request = lifecycleFixture();
  if (request.config.family !== "lp") throw new Error("Expected LP fixture.");
  const pair = request.config.pairs[0];
  pair.range = {
    kind: "bounded",
    lower: { ...pair.openingPrice, numerator: "1001" },
    upper: { ...pair.openingPrice, numerator: "2999" },
  };
  for (const fee of [5, 37]) {
    pair.feeBps = fee;
    pair.openingPrice = describeLPPrice(pair);
    const compiled: ReturnType<typeof compileLP>[number] = compileLP(
      request.config,
      hash,
      now,
    )[0];
    const program: ReturnType<AquaProgramBuilder["getInstructions"]> =
      AquaProgramBuilder.decode(
        new SwapVmProgram(compiled.program),
      ).getInstructions();
    assert.equal(
      program
        .find((i) => i.opcode === instructions.fee.flatFeeAmountInXD)
        ?.args.toJSON()?.fee,
      String(fee * 100000),
    );
    const range = compiled.encodedBounds!;
    assert.ok(BigInt(range.sqrtPriceMin) ** 2n >= 1001n * 10n ** 24n);
    assert.ok(BigInt(range.sqrtPriceMax) ** 2n <= 2999n * 10n ** 24n);
  }
});

test("repeated ERC20 purchases replenish consumed allowances for equal and unequal spends", async () => {
  for (const second of ["500000000000000000", "400000000000000000"]) {
    const request = lifecycleFixture();
    if (request.config.family !== "lp") throw new Error("Expected LP fixture.");
    const btc = tokens(42161).find((t) => t.symbol === "WBTC")!;
    const btcToken = {
      address: btc.address,
      decimals: btc.decimals,
      symbol: btc.symbol,
    };
    request.config.policy.allowedAssets.value.push(btc.address);
    request.config.pairs.push({
      ...request.config.pairs[0],
      quoteToken: btcToken,
      quoteAmount: "2500000",
      openingPrice: {
        baseToken: base.address,
        quoteToken: btc.address,
        numerator: "1",
        denominator: "40",
      },
    });
    request.inventory = [{ token: base, amount: "2000000000000000000" }];
    request.funding = {
      token: base,
      amount: "2000000000000000000",
      purchases: [
        {
          token: quote,
          amountIn: "500000000000000000",
          minimumAmountOut: "2000000000",
        },
        { token: btcToken, amountIn: second, minimumAmountOut: "2500000" },
      ],
    };
    const plan = await buildLifecyclePlan(request, dependenciesFixture());
    const approvals = plan.calls
      .filter((c) => c.to === base.address && c.data.startsWith("0x095ea7b3"))
      .map((c) => decodeFunctionData({ abi: erc20Abi, data: c.data }))
      .filter(
        (c) =>
          c.functionName === "approve" &&
          c.args[0].toLowerCase() === classicRouter(42161),
      );
    assert.deepEqual(
      approvals.map((c) => c.args[1]),
      [500000000000000000n, BigInt(second)],
    );
  }
});
