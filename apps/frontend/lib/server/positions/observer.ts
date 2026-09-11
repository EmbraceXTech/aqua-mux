import { canonicalJson } from "../../managed";
import { decodePositionLog } from "./decode";
import type {
  ChainObservation,
  ChainObservationConfig,
  ObservationRepository,
  PositionRpc,
} from "./types";

export const MAX_OBSERVATION_EVENTS = 10_000;
export const MAX_OBSERVATION_BYTES = 4 * 1024 * 1024;
class HistoryLimitError extends Error {}

export function observationKey(config: ChainObservationConfig) {
  return `${config.chainId}:${config.aqua.toLowerCase()}:${config.swapVm.toLowerCase()}`;
}
function initial(config: ChainObservationConfig): ChainObservation {
  return {
    schemaVersion: 1,
    config,
    indexedThrough: null,
    targetBlock: null,
    health: "unknown",
    checkedAt: new Date().toISOString(),
    error: null,
    events: [],
  };
}

/** One bounded backfill chunk per call. The caller supplies a known chain start block. */
export async function observeChain(
  rpc: PositionRpc,
  repository: ObservationRepository,
  config: ChainObservationConfig,
): Promise<ChainObservation> {
  if (
    !/^\d+$/.test(config.startBlock) ||
    !Number.isSafeInteger(config.confirmations) ||
    config.confirmations < 1 ||
    !Number.isSafeInteger(config.chunkSize) ||
    config.chunkSize < 1 ||
    config.chunkSize > 10_000
  ) {
    throw new Error(
      "Invalid observer start block, confirmations or chunk size.",
    );
  }
  const key = observationKey(config);
  const stored = repository.read(key);
  if (stored && canonicalJson(stored.value.config) !== canonicalJson(config))
    throw new Error("Observer configuration changed; explicit reset required.");
  let state = stored ? structuredClone(stored.value) : initial(config);
  state.checkedAt = new Date().toISOString();
  try {
    if ((await rpc.chainId()) !== config.chainId)
      throw new Error("Wrong RPC chain.");
    const head = await rpc.head();
    const target = head - BigInt(config.confirmations);
    state.targetBlock = target >= 0n ? target.toString() : null;
    if (state.indexedThrough) {
      const previous = state.indexedThrough;
      if (
        BigInt(previous.number) > target ||
        (await rpc.block(BigInt(previous.number))).hash !== previous.hash
      ) {
        // Deep reorgs are uncommon. Replay from the declared start instead of retaining unproven history.
        state = {
          ...initial(config),
          targetBlock: state.targetBlock,
          error: "chain_changed",
        };
      }
    }
    const from = state.indexedThrough
      ? BigInt(state.indexedThrough.number) + 1n
      : BigInt(config.startBlock);
    if (target < from) {
      state.health = state.indexedThrough ? "current" : "unknown";
    } else {
      const to =
        from + BigInt(config.chunkSize) - 1n < target
          ? from + BigInt(config.chunkSize) - 1n
          : target;
      const anchor = await rpc.block(to);
      const logs = await rpc.logs([config.aqua, config.swapVm], from, to);
      if (logs.length > MAX_OBSERVATION_EVENTS) throw new HistoryLimitError();
      const unique = new Map(state.events.map((event) => [event.id, event]));
      const hashes = new Map<string, string>([[to.toString(), anchor.hash]]);
      for (const log of logs) {
        if (
          log.blockNumber === null ||
          log.blockNumber < from ||
          log.blockNumber > to
        )
          throw new Error("RPC returned an out of range log.");
        const event = decodePositionLog(log, config);
        if (!event) continue;
        if (!hashes.has(event.blockNumber))
          hashes.set(
            event.blockNumber,
            (await rpc.block(BigInt(event.blockNumber))).hash,
          );
        if (hashes.get(event.blockNumber) !== event.blockHash)
          throw new Error("Log block changed.");
        unique.set(event.id, event);
        if (unique.size > MAX_OBSERVATION_EVENTS) throw new HistoryLimitError();
      }
      if ((await rpc.block(to)).hash !== anchor.hash)
        throw new Error("Chain changed while indexing.");
      if (
        state.indexedThrough &&
        (await rpc.block(BigInt(state.indexedThrough.number))).hash !==
          state.indexedThrough.hash
      ) {
        throw new Error("Retained history changed while indexing.");
      }
      const events = [...unique.values()];
      if (
        Buffer.byteLength(JSON.stringify(events), "utf8") >
        MAX_OBSERVATION_BYTES
      )
        throw new HistoryLimitError();
      state.events = events.sort((a, b) =>
        BigInt(a.blockNumber) < BigInt(b.blockNumber)
          ? -1
          : BigInt(a.blockNumber) > BigInt(b.blockNumber)
            ? 1
            : a.transactionIndex - b.transactionIndex ||
              a.logIndex - b.logIndex,
      );
      state.indexedThrough = { number: to.toString(), hash: anchor.hash };
      state.health = to === target ? "current" : "backfilling";
      state.error = null;
    }
  } catch (error) {
    state.health =
      error instanceof HistoryLimitError ? "limited" : "unavailable";
    state.error =
      error instanceof HistoryLimitError ? "history_limit" : "rpc_unavailable";
  }
  repository.write(key, stored?.revision ?? null, state);
  return state;
}
