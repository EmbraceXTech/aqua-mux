import { canonicalDigest, planDigest, type LifecyclePlan } from "../../managed";
import type { LifecycleRoute, RouteRequest } from "../lifecycle/types";
import type { VerifiedRoute } from "../route-policy/types";
import type { ManagedStore } from "../store";
import { lifecycleBatch } from "./batch";
import { DevWalletError } from "./config";

type StoredRoutes = {
  digest: string;
  routes: { request: RouteRequest; route: LifecycleRoute }[];
};

export function managedSigningBatch(plan: LifecyclePlan, store: ManagedStore) {
  const batch = lifecycleBatch(plan);
  const saved = store.getDocument<StoredRoutes>(
    "plan-routes",
    plan.id,
    plan.owner,
  )?.data;
  if (!saved) return batch;
  if (saved.digest !== planDigest(plan))
    throw new DevWalletError(
      "Verified routes belong to a different managed plan.",
    );
  if (
    saved.routes.length &&
    plan.routesDigest !== canonicalDigest(saved.routes)
  )
    throw new DevWalletError(
      "The managed confirmation does not bind these verified routes.",
    );
  return {
    ...batch,
    assetMetadata: [
      ...(batch.assetMetadata ?? []),
      ...saved.routes.flatMap(({ request }) => [
        request.source,
        request.destination,
      ]),
    ],
    verifiedRoutes: saved.routes.map(({ request, route }) => ({
      request: {
        chainId: request.chainId,
        maker: request.maker,
        source: request.source.address,
        destination: request.destination.address,
        amountIn: request.amountIn,
        minimumAmountOut: request.minimumAmountOut,
        slippageBps: request.slippageBps,
      },
      // Only the managed compiler's owner-scoped record reaches this adapter.
      // The route-policy validator subsequently verifies every field and calldata byte.
      route: route as VerifiedRoute,
    })),
  };
}
