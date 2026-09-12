import { classicRouter } from "../../config";
import type { VerifiedRoute } from "./types";
import { directChainId, directPools } from "./direct/deployments";
export function routePolicyTargets(chainId: number) {
  return chainId === directChainId
    ? directPools.map((pool) => pool.address)
    : [classicRouter(chainId)];
}
export function verifiedRouteCalls(
  route: Pick<VerifiedRoute, "call" | "calls">,
) {
  return route.calls ?? [route.call];
}
