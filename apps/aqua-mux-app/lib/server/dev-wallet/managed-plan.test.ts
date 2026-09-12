import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalDigest, planDigest } from "../../managed";
import { buildLifecyclePlan } from "../lifecycle";
import { compileTransparentCall, selectPool } from "../route-policy/calldata";
import { ManagedStore } from "../store";
import {
  dependenciesFixture,
  lifecycleFixture,
} from "../../../test/lifecycle-fixtures";
import { managedSigningBatch } from "./managed-plan";

test("managed signer consumes only route records bound into the confirmed canonical plan", async () => {
  const plan = await buildLifecyclePlan(
    lifecycleFixture(),
    dependenciesFixture(),
  );
  const source = {
    address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1" as const,
    decimals: 18,
    symbol: "WETH",
  };
  const destination = {
    address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as const,
    decimals: 6,
    symbol: "USDC",
  };
  const request = {
    chainId: plan.chainId,
    maker: plan.maker,
    source: source.address,
    destination: destination.address,
    amountIn: "1000000000000000",
    minimumAmountOut: "1",
    slippageBps: 100,
  };
  const route = {
    request,
    call: compileTransparentCall(request, "990000"),
    spender: "0x111111125421ca6dc452d289314280a0f8842a65" as const,
    amountIn: request.amountIn,
    amountOut: "1000000",
    minimumAmountOut: "990000",
    quotedAt: Date.now(),
    expiresAt: Date.now() + 30_000,
    policy: { version: 1 as const, poolId: selectPool(request).id },
  };
  const records = [{ request: { ...request, source, destination }, route }];
  plan.calls.push(route.call);
  plan.minimumReceipts = [
    { token: destination, amount: route.minimumAmountOut },
  ];
  plan.routesDigest = canonicalDigest(records);
  const store = new ManagedStore(":memory:");
  try {
    store.putDocument("plan-routes", plan.id, plan.owner, {
      digest: planDigest(plan),
      routes: records,
    });
    const adapted = managedSigningBatch(plan, store);
    assert.equal(adapted.gasReserveWei, plan.gasReserveWei);
    assert.equal(
      adapted.verifiedRoutes?.[0].request.amountIn,
      request.amountIn,
    );
    assert.equal(adapted.verifiedRoutes?.[0].request.source, source.address);
    assert.equal(adapted.minimumReceipts?.[0].amount, "990000");
    const changed = structuredClone(records);
    changed[0].request.amountIn = "9000000000000000";
    store.putDocument("plan-routes", plan.id, plan.owner, {
      digest: planDigest(plan),
      routes: changed,
    });
    assert.throws(() => managedSigningBatch(plan, store), /does not bind/);
    store.putDocument("plan-routes", plan.id, plan.owner, {
      digest: `0x${"00".repeat(32)}`,
      routes: records,
    });
    assert.throws(
      () => managedSigningBatch(plan, store),
      /different managed plan/,
    );
  } finally {
    store.close();
  }
});
