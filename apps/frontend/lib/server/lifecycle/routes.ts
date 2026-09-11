import { quoteVerifiedRoute } from "../route-policy/quote";
import { validateCompiledRoute } from "../route-policy/validate";
import { verifyRouteProvenance } from "../route-policy/provenance";
import type { RoutePolicyRequest, VerifiedRoute } from "../route-policy/types";
import type { LifecycleRoute, RouteRequest } from "./types";

/** Derive authority from the independently prepared lifecycle request. */
export function routePolicyRequest(request: RouteRequest): RoutePolicyRequest {
  return {
    chainId: request.chainId,
    maker: request.maker,
    source: request.source.address,
    destination: request.destination.address,
    amountIn: request.amountIn,
    minimumAmountOut: request.minimumAmountOut,
    slippageBps: request.slippageBps,
  };
}

function verifiedRoute(route: LifecycleRoute): VerifiedRoute {
  if (!route.request || !route.policy || !route.amountIn)
    throw new Error(
      "A verified transparent route is required; opaque aggregation is unavailable.",
    );
  return route as VerifiedRoute;
}

export function validateRoute(
  request: RouteRequest,
  route: LifecycleRoute,
  now = Date.now(),
): void {
  validateCompiledRoute(routePolicyRequest(request), verifiedRoute(route), now);
}

export async function verifyLifecycleRouteProvenance(
  request: RouteRequest,
  route: LifecycleRoute,
): Promise<void> {
  validateRoute(request, route);
  await verifyRouteProvenance(verifiedRoute(route));
}

export async function quoteLifecycleRoute(
  request: RouteRequest,
): Promise<VerifiedRoute> {
  return quoteVerifiedRoute(routePolicyRequest(request));
}
