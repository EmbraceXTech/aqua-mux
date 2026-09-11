import assert from "node:assert/strict";
import { test } from "node:test";
import type { Address } from "viem";
import { tokens } from "../../config";
import { basketSchema } from "../../model";
import { compileTransparentCall, selectPool } from "../route-policy/calldata";
import type { RoutePolicyRequest, VerifiedRoute } from "../route-policy/types";
import type { client } from "../rpc";
import { ManagedStore } from "../store";
import { DevBasketService } from "./baskets";
import { buildDevBasketPlan } from "./compile";

const account = "0x0000000000000000000000000000000000000001";
const assets = tokens(42161);
const source = assets.find((token) => token.symbol === "WETH")!;
const usdc = {
  address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as const,
  decimals: 6,
  symbol: "USDC",
  name: "Fixture USD Coin",
  logo: "",
  source: "verified fixture registry",
};
const usdt = {
  address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9" as const,
  decimals: 6,
  symbol: "USDT",
  name: "Fixture Tether",
  logo: "",
  source: "verified fixture registry",
};
const input = {
  chainId: 42161,
  mode: "swap",
  source: source.address,
  amount: "1",
  slippageBps: 100,
  feeBps: 30,
  range: basketSchema.shape.range.safeParse("full").success ? "full" : 0,
  legs: [
    { address: usdc.address, bps: 5000, amount: "1" },
    { address: usdt.address, bps: 5000, amount: "1" },
  ],
};
const rpc = () =>
  ({
    getChainId: async () => 42161,
    readContract: async () => 10n ** 21n,
  }) as unknown as ReturnType<typeof client>;
function quote(request: RoutePolicyRequest): VerifiedRoute {
  return {
    request: { ...request },
    call: compileTransparentCall(request, "99000000"),
    spender: "0x111111125421ca6dc452d289314280a0f8842a65",
    amountIn: request.amountIn,
    amountOut: "100000000",
    minimumAmountOut: "99000000",
    quotedAt: Date.now(),
    expiresAt: Date.now() + 30_000,
    policy: { version: 1, poolId: selectPool(request).id },
  };
}
const resolve = async () => ({
  basket: basketSchema.parse(input),
  tokens: [...assets, usdc, usdt],
  resolveToken: (chainId: number, address: string) => {
    assert.equal(chainId, 42161);
    const found = [...assets, usdc, usdt].find(
      (token) => token.address === address.toLowerCase(),
    );
    assert.ok(found);
    return found;
  },
});

test("basket preparation binds displayed minimums and exact per-leg source allocations", async () => {
  const store = new ManagedStore(":memory:");
  const requests: RoutePolicyRequest[] = [];
  const compiler = (input: unknown, maker: Address) =>
    buildDevBasketPlan(input, maker, {
      resolve,
      rpc,
      quote: async (request) => {
        requests.push(structuredClone(request));
        return quote(request);
      },
    });
  const service = new DevBasketService(
    store,
    compiler,
    undefined,
    undefined,
    () => 1000000000000000n,
  );
  try {
    const review = await service.prepare(
      { owner: account, sessionId: "fixture-session" },
      input,
    );
    assert.deepEqual(
      requests.map((request) => request.amountIn),
      ["500000000000000000", "500000000000000000"],
    );
    assert.deepEqual(
      requests.map((request) => request.destination),
      [usdc.address, usdt.address],
    );
    assert.ok(review.plan.summary.includes("Pay 1 WETH."));
    assert.ok(review.plan.summary.includes("Receive at least 99 USDC."));
    assert.ok(review.plan.summary.includes("Receive at least 99 USDT."));
    assert.equal(review.plan.calls.length, 2);
  } finally {
    store.close();
  }
});

test("provider metadata cannot substitute spend, destination or encoded minimum during preparation", async () => {
  for (const mutate of [
    (route: VerifiedRoute) => {
      const changed = { ...route.request, amountIn: "9000000000000000000" };
      route.request = changed;
      route.amountIn = changed.amountIn;
      route.call = compileTransparentCall(changed, route.minimumAmountOut);
    },
    (route: VerifiedRoute) => {
      route.call = compileTransparentCall(route.request, "1");
    },
    (route: VerifiedRoute) => {
      route.request.destination = usdt.address;
      route.call = compileTransparentCall(
        route.request,
        route.minimumAmountOut,
      );
    },
    (route: VerifiedRoute) => {
      route.call.data = "0x12aa3cafdeadbeef";
    },
  ]) {
    const store = new ManagedStore(":memory:");
    const service = new DevBasketService(
      store,
      (input, maker) =>
        buildDevBasketPlan(input, maker, {
          resolve,
          rpc,
          quote: async (request) => {
            const route = quote(request);
            mutate(route);
            return route;
          },
        }),
      undefined,
      undefined,
      () => 1000000000000000n,
    );
    try {
      await assert.rejects(() =>
        service.prepare(
          { owner: account, sessionId: "fixture-session" },
          input,
        ),
      );
      assert.equal(store.listDocuments("dev-wallet-review", account).length, 0);
    } finally {
      store.close();
    }
  }
  await assert.rejects(
    () =>
      buildDevBasketPlan(input, account, {
        resolve,
        rpc,
        quote: async (request) => {
          request.amountIn = "9000000000000000000";
          return quote(request);
        },
      }),
    /request differs/,
  );
});
