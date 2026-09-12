import assert from "node:assert/strict";
import { test } from "node:test";
import { NATIVE } from "../../config";
import { compileTransparentCall, selectPool } from "../route-policy/calldata";
import type { RoutePolicyRequest, VerifiedRoute } from "../route-policy/types";
import type { DevBatchPlan } from "./batch";
import { validateDevPlan } from "./policy";

const maker = "0x0000000000000000000000000000000000000001";
const weth = {
  address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1" as const,
  decimals: 18,
  symbol: "WETH",
};
const usdc = {
  address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as const,
  decimals: 6,
  symbol: "USDC",
};
function fixture() {
  const request: RoutePolicyRequest = {
    chainId: 42161,
    maker,
    source: weth.address,
    destination: usdc.address,
    amountIn: "1000000000000000",
    minimumAmountOut: "1",
    slippageBps: 100,
  };
  const route: VerifiedRoute = {
    request: { ...request },
    call: compileTransparentCall(request, "990000"),
    spender: "0x111111125421ca6dc452d289314280a0f8842a65",
    amountIn: request.amountIn,
    amountOut: "1000000",
    minimumAmountOut: "990000",
    quotedAt: Date.now(),
    expiresAt: Date.now() + 30_000,
    policy: { version: 1, poolId: selectPool(request).id },
  };
  const plan: DevBatchPlan = {
    account: maker,
    chainId: 42161,
    mode: "swap",
    calls: [route.call],
    createdAt: Date.now(),
    expiresAt: route.expiresAt,
    summary: ["Receive at least 0.99 USDC."],
    strategies: [],
    assetMetadata: [weth, usdc],
    minimumReceipts: [{ token: usdc, amount: "990000" }],
    verifiedRoutes: [{ request, route }],
  };
  return { plan, request, route };
}

test("transparent route calldata and displayed receipts bind to independent reviewed intent", () => {
  const { plan } = fixture();
  validateDevPlan(plan, maker);
  const changes: ((plan: DevBatchPlan) => void)[] = [
    (plan) => {
      plan.verifiedRoutes = [];
    },
    (plan) => {
      plan.calls = [...plan.calls, plan.calls[0]];
    },
    (plan) => {
      plan.calls[0].data = "0xdeadbeef";
    },
    (plan) => {
      plan.calls[0].value = "0x1";
    },
    (plan) => {
      plan.minimumReceipts![0].amount = "999999";
    },
    (plan) => {
      plan.minimumReceipts![0].token.decimals = 18;
    },
    (plan) => {
      plan.minimumReceipts![0].token = weth;
    },
    (plan) => {
      plan.verifiedRoutes![0].route.request.amountIn = "9000000000000000";
    },
    (plan) => {
      plan.verifiedRoutes![0].route.minimumAmountOut = "1";
    },
    (plan) => {
      plan.verifiedRoutes![0].route.request.maker =
        "0x0000000000000000000000000000000000000002";
    },
    (plan) => {
      plan.verifiedRoutes![0].request.destination = NATIVE;
    },
    (plan) => {
      plan.verifiedRoutes![0].route.policy.poolId = "unverified-pool";
    },
    (plan) => {
      plan.expiresAt += 1;
    },
  ];
  for (const change of changes) {
    const changed = structuredClone(fixture().plan);
    change(changed);
    assert.throws(() => validateDevPlan(changed, maker));
  }
});

test("a substituted valid route still cannot spend a different independently requested amount", () => {
  const { plan, route } = fixture();
  const malicious = { ...route.request, amountIn: "9000000000000000" };
  const call = compileTransparentCall(malicious, route.minimumAmountOut);
  plan.calls[0] = call;
  plan.verifiedRoutes![0].route = {
    ...route,
    request: malicious,
    call,
    amountIn: malicious.amountIn,
  };
  assert.throws(() => validateDevPlan(plan, maker), /request differs/);
});

test("multiple routes to one destination require one exact aggregate receipt", () => {
  const { plan } = fixture();
  plan.calls.push(structuredClone(plan.calls[0]));
  plan.verifiedRoutes!.push(structuredClone(plan.verifiedRoutes![0]));
  plan.minimumReceipts![0].amount = "1980000";
  validateDevPlan(plan, maker);
  const wrongTotal = structuredClone(plan);
  wrongTotal.minimumReceipts![0].amount = "990000";
  assert.throws(() => validateDevPlan(wrongTotal, maker), /output minimums/);
  const duplicated = structuredClone(plan);
  duplicated.minimumReceipts = [
    { token: usdc, amount: "990000" },
    { token: usdc, amount: "990000" },
  ];
  assert.throws(() => validateDevPlan(duplicated, maker), /minimum receipts/);
});

test("case variants cannot duplicate one receipt while omitting another destination", () => {
  const { plan, request } = fixture();
  const destination = {
    address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" as const,
    decimals: 6,
    symbol: "USDT0",
  };
  const otherRequest = { ...request, destination: destination.address };
  const otherRoute = {
    ...structuredClone(plan.verifiedRoutes![0].route),
    request: otherRequest,
    call: compileTransparentCall(otherRequest, "990000"),
    policy: { version: 1 as const, poolId: selectPool(otherRequest).id },
  };
  plan.assetMetadata!.push(destination);
  plan.calls.push(otherRoute.call);
  plan.verifiedRoutes!.push({ request: otherRequest, route: otherRoute });
  plan.minimumReceipts!.push({ token: destination, amount: "990000" });
  validateDevPlan(plan, maker);
  plan.minimumReceipts![1].token = {
    ...usdc,
    address: `0x${usdc.address.slice(2).toUpperCase()}`,
  };
  assert.throws(() => validateDevPlan(plan, maker), /minimum receipts/);
});
