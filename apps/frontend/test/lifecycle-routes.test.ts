import assert from "node:assert/strict";
import test from "node:test";
import { encodeFunctionData } from "viem";
import { SWAP_VM } from "../lib/config";
import { planDigest } from "../lib/managed/digest";
import {
  buildLifecyclePlanWithRoutes,
  digest,
  type LifecycleDependencies,
  type RouteRequest,
} from "../lib/server/lifecycle";
import {
  routePolicyRequest,
  validateRoute,
} from "../lib/server/lifecycle/routes";
import {
  compileTransparentCall,
  selectPool,
  transparentRouterAbi,
} from "../lib/server/route-policy/calldata";
import type { VerifiedRoute } from "../lib/server/route-policy/types";
import {
  base,
  quote,
  native,
  now,
  hash,
  lifecycleFixture,
  dependenciesFixture,
} from "./lifecycle-fixtures";

function transparentRoute(input: RouteRequest): VerifiedRoute {
  const request = routePolicyRequest(input),
    minimum =
      input.minimumAmountOut === "1" ? "1000000" : input.minimumAmountOut;
  return {
    request,
    call: compileTransparentCall(request, minimum),
    spender: compileTransparentCall(request, minimum).to,
    amountIn: request.amountIn,
    amountOut: minimum,
    minimumAmountOut: minimum,
    quotedAt: now,
    expiresAt: now + 30000,
    policy: { version: 1, poolId: selectPool(request).id },
  };
}
function fundedRequest() {
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
  return request;
}
function transparentDependencies(): LifecycleDependencies {
  return {
    ...dependenciesFixture(),
    quote: async (request) => transparentRoute(request),
    validateRoute,
  };
}

test("transparent funding binds exact independent route metadata into the canonical plan digest", async () => {
  const deps = transparentDependencies();
  let checks = 0;
  deps.verifyRouteProvenance = async (request, route) => {
    validateRoute(request, route, now);
    checks++;
  };
  const bundle = await buildLifecyclePlanWithRoutes(fundedRequest(), deps);
  assert.equal(bundle.routes.length, 1);
  assert.equal(bundle.plan.routesDigest, digest(bundle.routes));
  assert.equal(checks, 2);
  assert.equal(bundle.plan.minimumReceipts[0].amount, "2000000000");
  assert.ok(
    bundle.plan.calls.some((c) => c.data === bundle.routes[0].route.call.data),
  );
  const changed = { ...bundle.plan, routesDigest: hash };
  assert.notEqual(planDigest(changed), planDigest(bundle.plan));
});

test("default lifecycle route path refuses opaque aggregation without invoking simulation", async () => {
  const deps = dependenciesFixture();
  delete deps.validateRoute;
  deps.simulate = async () => {
    throw new Error("Simulation must not run");
  };
  await assert.rejects(
    buildLifecyclePlanWithRoutes(fundedRequest(), deps),
    /opaque aggregation/,
  );
});

test("tampered route input amount, receiver, minimum and pool are rejected before execution", async () => {
  const mutations: ((route: VerifiedRoute) => void)[] = [
    (r) => {
      r.amountIn = "2";
    },
    (r) => {
      r.call = compileTransparentCall(
        { ...r.request, maker: "0x0000000000000000000000000000000000000002" },
        r.minimumAmountOut,
      );
    },
    (r) => {
      r.call = compileTransparentCall(r.request, "1");
    },
    (r) => {
      r.policy.poolId = "unreviewed-pool";
    },
    (r) => {
      r.request.minimumAmountOut = "1";
    },
    (r) => {
      r.call.data = encodeFunctionData({
        abi: transparentRouterAbi,
        functionName: "ethUnoswapTo",
        args: [BigInt(r.request.maker), BigInt(r.minimumAmountOut), 1n],
      });
    },
  ];
  for (const mutate of mutations) {
    const deps = transparentDependencies();
    deps.quote = async (request) => {
      const route = transparentRoute(request);
      mutate(route);
      return route;
    };
    await assert.rejects(
      buildLifecyclePlanWithRoutes(fundedRequest(), deps),
      /Route|route|pool/,
    );
  }
});

test("route provenance is checked again after whole-batch simulation", async () => {
  const deps = transparentDependencies();
  let count = 0;
  deps.verifyRouteProvenance = async () => {
    if (++count === 2) throw new Error("Pool code changed");
  };
  await assert.rejects(
    buildLifecyclePlanWithRoutes(fundedRequest(), deps),
    /Pool code changed/,
  );
});

test("transparent close conversion preserves exact selected inventory and target deduplication", async () => {
  const request = lifecycleFixture();
  request.kind = "close-and-convert";
  request.previous = [
    { hash, app: SWAP_VM, tokens: [base.address, quote.address].sort() },
  ];
  request.conversion = { targetToken: base, amounts: request.inventory };
  const { plan, routes } = await buildLifecyclePlanWithRoutes(
    request,
    transparentDependencies(),
  );
  assert.equal(routes.length, 1);
  assert.equal(routes[0].request.source.address, quote.address);
  assert.equal(routes[0].request.amountIn, "2000000000");
  assert.equal(
    plan.conservativeInventoryAfter.find(
      (i) => i.token.address === quote.address,
    )?.amount,
    "0",
  );
  assert.equal(plan.routesDigest, digest(routes));
});

test("close conversion wraps selected native residual directly into wrapped-native target", async () => {
  const request = lifecycleFixture();
  request.kind = "close-and-convert";
  request.previous = [
    { hash, app: SWAP_VM, tokens: [base.address, quote.address].sort() },
  ];
  request.inventory = [{ token: native, amount: "1000000000000000" }];
  request.conversion = { targetToken: base, amounts: request.inventory };
  const { plan, routes } = await buildLifecyclePlanWithRoutes(
    request,
    transparentDependencies(),
  );
  assert.equal(routes.length, 0);
  assert.ok(
    plan.calls.some(
      (c) =>
        c.to === base.address &&
        c.data === "0xd0e30db0" &&
        BigInt(c.value) === 1000000000000000n,
    ),
  );
  assert.equal(
    plan.conservativeInventoryAfter.find(
      (i) => i.token.address === base.address,
    )?.amount,
    "1000000000000000",
  );
});

test("quote callbacks cannot raise the authorized funding amount", async () => {
  const request = fundedRequest();
  const original = structuredClone(request);
  const deps = transparentDependencies();
  deps.quote = async (input) => {
    input.amountIn = "2000000000000000000";
    return transparentRoute(input);
  };
  await assert.rejects(
    buildLifecyclePlanWithRoutes(request, deps),
    /[Rr]oute|amount/,
  );
  assert.deepEqual(request, original);
});

test("nested quote inputs and minimum authority remain independent of callbacks", async () => {
  const mutations: ((input: RouteRequest) => void)[] = [
    (input) => {
      input.destination.address = base.address;
    },
    (input) => {
      input.maker = "0x0000000000000000000000000000000000000002";
    },
    (input) => {
      input.minimumAmountOut = "1";
    },
  ];
  for (const mutate of mutations) {
    const request = fundedRequest();
    const original = structuredClone(request);
    const deps = transparentDependencies();
    deps.quote = async (input) => {
      mutate(input);
      return transparentRoute(input);
    };
    await assert.rejects(buildLifecyclePlanWithRoutes(request, deps));
    assert.deepEqual(request, original);
  }
});

test("snapshot, validation, provenance and simulation callbacks cannot mutate the canonical plan", async () => {
  const request = fundedRequest();
  const original = structuredClone(request);
  const baseline = await buildLifecyclePlanWithRoutes(
    request,
    transparentDependencies(),
  );
  const deps = transparentDependencies();
  const snapshot = deps.snapshot;
  const simulate = deps.simulate;
  let returnedRoute: VerifiedRoute;
  deps.snapshot = async (input) => {
    const result = await snapshot(input);
    input.funding!.amount = "1";
    input.inventory[0].amount = "1";
    input.config.policy.allowedRoutes.value = [];
    return result;
  };
  deps.quote = async (input) => {
    returnedRoute = transparentRoute(input);
    return returnedRoute;
  };
  deps.validateRoute = (input, route, time) => {
    validateRoute(input, route, time);
    input.source.address = base.address;
    route.call.value = "0xffff";
  };
  deps.verifyRouteProvenance = async (input, route) => {
    input.destination.address = base.address;
    route.policy!.poolId = "mutated";
  };
  deps.simulate = async (plan) => {
    const result = await simulate(plan);
    plan.calls[0].value = "0xffff";
    plan.inventoryBefore[0].amount = "1";
    returnedRoute.policy.poolId = "retained-reference-mutation";
    return result;
  };
  const actual = await buildLifecyclePlanWithRoutes(request, deps);
  assert.deepEqual(actual, baseline);
  assert.deepEqual(request, original);
});
