import { AQUA } from "../../config";
import type { StrategyGroup } from "../../managed";
import type { ManagedStore } from "../store";
import { client } from "../rpc";
import {
  createPositionRpc,
  reconcilePositions,
  toPositionRef,
} from "../positions";
import { walletSnapshot, type WalletSnapshot } from "./snapshot";
import { ManagedError } from "./errors";

export async function groupReviewSnapshot(
  group: StrategyGroup,
  store: ManagedStore,
): Promise<WalletSnapshot> {
  const snapshot = await walletSnapshot({
    chainId: group.chainId,
    maker: group.maker,
    assets: group.config.policy.allowedAssets.value,
    maxAgeMs: group.config.policy.maxReferenceAgeMs.value,
  });
  const strategies = store.list("strategy", group.owner, group.id);
  snapshot.managedStrategies = strategies;
  if (strategies.length) {
    const reconciliation = await reconcilePositions(
      createPositionRpc(client(group.chainId)),
      strategies.map((s) => toPositionRef(group, s)),
      AQUA,
    );
    if (reconciliation.health !== "current")
      throw new ManagedError(
        "stale_data",
        "Current managed position backing is unavailable. Review paused.",
      );
    snapshot.positionReconciliation = JSON.parse(
      JSON.stringify(reconciliation, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
  }
  snapshot.coverage.push({
    source: "managed-position-exposure",
    observedAt: Date.now(),
    status: "partial",
    detail:
      "Current known managed strategies only. Unregistered external exposure and resolver discovery remain unknown.",
  });
  return snapshot;
}
