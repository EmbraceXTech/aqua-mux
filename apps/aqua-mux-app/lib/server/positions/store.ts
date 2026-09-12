import type { StrategyGroup, StrategyInstance } from "../../managed";
import type { ManagedStore } from "../store";
import type {
  ChainObservation,
  ObservationRepository,
  PositionRef,
} from "./types";

const namespace = "position-observation-v1";
/** Owner scope is supplied by the authenticated API, not the browser payload. */
export function createObservationRepository(
  store: ManagedStore,
  owner: string,
): ObservationRepository {
  return {
    read(key) {
      const document = store.getDocument<ChainObservation>(
        namespace,
        key,
        owner,
      );
      return document
        ? { revision: document.revision, value: document.data }
        : null;
    },
    write(key, revision, value) {
      // The common store atomically compares the revision and replaces all cursor/history data.
      store.putDocument(namespace, key, owner, value, revision ?? 0);
    },
  };
}

export function toPositionRef(
  group: StrategyGroup,
  strategy: StrategyInstance,
): PositionRef {
  if (
    strategy.owner !== group.owner ||
    strategy.groupId !== group.id ||
    strategy.maker !== group.maker
  )
    throw new Error("Strategy does not belong to group.");
  return {
    id: strategy.id,
    groupId: group.id,
    ownerId: group.owner,
    chainId: group.chainId,
    maker: strategy.maker,
    app: strategy.app,
    strategyHash: strategy.hash,
    tokens: strategy.tokens.map((token) => token.address),
  };
}
