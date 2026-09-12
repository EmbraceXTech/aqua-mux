import { attachActiveRouteObservations } from "./active-route-observations";
import { assertReviewSnapshotFresh } from "./freshness";
import type { StrategyGroup } from "../../managed";
import type { ManagedStore } from "../store";
import {
  walletSnapshot,
  intentSnapshot,
  type WalletSnapshot,
} from "./snapshot";
import { ManagedError } from "./errors";
import { attachKnownExposure } from "./exposure";
import type { ProposalIntent } from "./inputs";

export async function groupReviewSnapshot(
  group: StrategyGroup,
  store: ManagedStore,
): Promise<WalletSnapshot> {
  const intent =
    group.state === "draft"
      ? store.getDocument<{ intent: ProposalIntent }>(
          "group-intent",
          group.id,
          group.owner,
        )?.data.intent
      : undefined;
  const snapshot = intent
    ? await intentSnapshot(intent)
    : await walletSnapshot({
        chainId: group.chainId,
        maker: group.maker,
        assets: group.config.policy.allowedAssets.value,
        maxAgeMs: group.config.policy.maxReferenceAgeMs.value,
        storedTokens: group.config.pairs.flatMap((pair) => [
          pair.baseToken,
          pair.quoteToken,
        ]),
      });
  if (!intent) await attachActiveRouteObservations(snapshot, group);
  await attachKnownExposure(snapshot, store);
  const requiresMarket =
    group.config.policy.allowedActions.value.includes("replace");
  if (
    snapshot.coverage.some(
      (source) =>
        source.status === "unavailable" &&
        (!source.source.startsWith("verified-pair:") || requiresMarket),
    )
  )
    throw new ManagedError(
      "stale_data",
      "Current market observations or maker position backing are unavailable. Review paused.",
    );
  assertReviewSnapshotFresh(
    snapshot,
    group.config.policy.maxReferenceAgeMs.value,
    Date.now(),
  );
  return snapshot;
}
