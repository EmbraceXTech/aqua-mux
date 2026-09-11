import type { StrategyGroup } from "../../managed";
import type { ManagedStore } from "../store";
import { walletSnapshot, type WalletSnapshot } from "./snapshot";
import { ManagedError } from "./errors";
import { attachKnownExposure } from "./exposure";

export async function groupReviewSnapshot(
  group: StrategyGroup,
  store: ManagedStore,
): Promise<WalletSnapshot> {
  const snapshot = await walletSnapshot({
    chainId: group.chainId,
    maker: group.maker,
    assets: group.config.policy.allowedAssets.value,
    maxAgeMs: group.config.policy.maxReferenceAgeMs.value,
    storedTokens: group.config.pairs.flatMap((pair) => [
      pair.baseToken,
      pair.quoteToken,
    ]),
  });
  await attachKnownExposure(snapshot, store);
  if (snapshot.coverage.some((source) => source.status === "unavailable"))
    throw new ManagedError(
      "stale_data",
      "Current maker position backing is unavailable. Review paused.",
    );
  return snapshot;
}
