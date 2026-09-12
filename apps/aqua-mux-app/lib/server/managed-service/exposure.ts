import { AQUA } from "../../config";
import type { ManagedStore } from "../store";
import { client } from "../rpc";
import {
  createPositionRpc,
  reconcilePositions,
  toPositionRef,
} from "../positions";
import type { WalletSnapshot } from "./snapshot";

/** Include every known group sharing the maker, without claiming exhaustive discovery. */
export async function attachKnownExposure(
  snapshot: WalletSnapshot,
  store: ManagedStore,
) {
  const groups = store
    .list("group", snapshot.maker)
    .filter(
      (group) =>
        group.chainId === snapshot.chainId &&
        group.maker.toLowerCase() === snapshot.maker.toLowerCase(),
    );
  const strategies = groups.flatMap((group) =>
    store
      .list("strategy", group.owner, group.id)
      .map((strategy) => ({ group, strategy })),
  );
  snapshot.managedStrategies = strategies.map(({ strategy }) => strategy);
  if (strategies.length) {
    const positions = await reconcilePositions(
      createPositionRpc(client(snapshot.chainId)),
      strategies.map(({ group, strategy }) => toPositionRef(group, strategy)),
      AQUA,
    );
    snapshot.positionReconciliation = JSON.parse(
      JSON.stringify(positions, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    );
    snapshot.coverage.push({
      source: "known-maker-position-backing",
      observedAt: Date.now(),
      status: positions.health === "current" ? "complete" : "unavailable",
      detail:
        "Direct chain reconciliation of known strategy hashes for every recorded group sharing this maker.",
    });
  }
  snapshot.coverage.push({
    source: "maker-position-discovery",
    observedAt: Date.now(),
    status: "partial",
    detail:
      "Known application groups are included. Strategies registered outside this application and unindexed fills remain unknown; an empty known list does not establish zero external exposure.",
  });
  return snapshot;
}
