import { compileDirectCalls, selectDirectPool } from "./direct/calldata";
import { directChainId } from "./direct/deployments";
import {
  canonicalRequest,
  compileTransparentCall,
  positiveAmount,
  selectPool,
} from "./calldata";
import { routerDeployments } from "./deployments";
import type { RoutePolicyRequest, VerifiedRoute } from "./types";

/** The caller must pass the independently compiled, reviewed request, not route.request. */
export function validateCompiledRoute(
  request: RoutePolicyRequest,
  route: VerifiedRoute,
  now = Date.now(),
): void {
  const canonical = canonicalRequest(request);
  const stored = canonicalRequest(route.request);
  if (JSON.stringify(canonical) !== JSON.stringify(stored))
    throw new Error("Route request differs from the canonical plan.");
  const direct = canonical.chainId === directChainId;
  const pool = direct ? selectDirectPool(canonical) : selectPool(canonical);
  if (
    route.policy?.version !== (direct ? 2 : 1) ||
    route.policy.poolId !== pool.id
  )
    throw new Error("Unknown route policy or pool.");
  if (
    ![route.quotedAt, route.expiresAt, now].every(Number.isSafeInteger) ||
    route.quotedAt > now ||
    route.quotedAt < 0 ||
    route.expiresAt <= now ||
    route.expiresAt <= route.quotedAt ||
    route.expiresAt - route.quotedAt > 30_000 ||
    now - route.quotedAt > 30_000
  )
    throw new Error("Verified route is stale.");
  const expected = positiveAmount(route.amountOut);
  const minimum = positiveAmount(route.minimumAmountOut);
  const slippageMinimum =
    (expected * BigInt(10_000 - canonical.slippageBps)) / 10_000n;
  if (
    route.amountIn !== canonical.amountIn ||
    minimum < positiveAmount(canonical.minimumAmountOut) ||
    minimum < slippageMinimum ||
    minimum > expected
  )
    throw new Error(
      "Route amounts differ from the reviewed amount or minimum.",
    );
  if (direct) {
    const calls = compileDirectCalls(canonical, route.minimumAmountOut);
    const expectedCall = calls.find((call) => call.to === pool.address)!;
    const same = (a: typeof expectedCall, b: typeof expectedCall) =>
      a.to.toLowerCase() === b.to.toLowerCase() &&
      a.data.toLowerCase() === b.data.toLowerCase() &&
      a.value === b.value;
    if (
      route.approvalRequired !== false ||
      route.spender !== pool.address ||
      minimum !== expected ||
      !route.calls ||
      route.calls.length !== calls.length ||
      !route.calls.every((call, index) => same(call, calls[index])) ||
      !same(route.call, expectedCall)
    )
      throw new Error(
        "Direct route calls do not exactly enforce the reviewed authority.",
      );
    return;
  }
  if (route.calls || route.approvalRequired !== undefined)
    throw new Error("Unknown router call program.");
  const compiled = compileTransparentCall(canonical, route.minimumAmountOut);
  if (
    route.spender.toLowerCase() !==
      routerDeployments[canonical.chainId].address ||
    route.call.to.toLowerCase() !== compiled.to ||
    route.call.data.toLowerCase() !== compiled.data.toLowerCase() ||
    !/^0x[0-9a-fA-F]+$/.test(route.call.value) ||
    BigInt(route.call.value) !== BigInt(compiled.value)
  )
    throw new Error(
      "Route calldata does not exactly enforce the reviewed authority.",
    );
}
