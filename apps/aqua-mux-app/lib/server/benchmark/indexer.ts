import { sources, type Coverage, type Source } from "../../benchmark/model";
import {
  graph,
  protocolQuery,
  candidatesQuery,
  nonnegative,
  type ProtocolResult,
  type Candidate,
} from "./graph";
import { hasRpc, replayPosition } from "./replay";
import { BenchmarkStore } from "./store";

export async function indexBenchmarks(
  options: {
    candidates?: number;
    days?: number;
    sourceIds?: string[];
    skip?: number;
    log?: (message: string) => void;
  } = {},
) {
  const store = new BenchmarkStore();
  if (!store.lock()) {
    store.close();
    throw new Error("A benchmark indexer is already running");
  }
  const limit = options.candidates ?? 5;
  const days = options.days ?? 30;
  if (
    !Number.isInteger(limit) ||
    limit < 0 ||
    limit > 100 ||
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365 ||
    (options.skip !== undefined &&
      (!Number.isInteger(options.skip) ||
        options.skip < 0 ||
        options.skip > 5000)) ||
    options.sourceIds?.some((id) => !sources.some((source) => source.id === id))
  ) {
    store.unlock();
    store.close();
    throw new Error("Invalid indexer limits");
  }
  const selected = sources.filter(
    (source) =>
      !options.sourceIds?.length || options.sourceIds.includes(source.id),
  );
  async function indexSource(source: Source) {
    if (!store.renew()) throw new Error("Benchmark indexing lease was lost");
    const previous = store.read().coverage.find((row) => row.id === source.id)!;
    const row: Coverage = {
      ...source,
      status: "unavailable",
      checkedAt: Date.now(),
      walletStatus: "Wallet accounting not available",
      candidates: previous.candidates,
      verified: previous.verified,
      rejected: previous.rejected,
    };
    try {
      if (source.schema !== "messari") {
        const data = await graph<{ _meta: ProtocolResult["_meta"] }>(
          source,
          "{ _meta { block { number timestamp } hasIndexingErrors } }",
        );
        row.indexedBlock = data._meta.block.number;
        row.indexedAt = data._meta.block.timestamp ?? undefined;
        row.status = data._meta.hasIndexingErrors ? "unavailable" : "ready";
        row.walletStatus =
          "V4 ownership only. Fee accounting is not implemented.";
      } else {
        const data = await graph<ProtocolResult>(source, protocolQuery);
        const protocol = data.dexAmmProtocols[0];
        if (!protocol || data._meta.hasIndexingErrors)
          throw new Error(
            "Subgraph is missing protocol data or has indexing errors",
          );
        row.indexedBlock = data._meta.block.number;
        row.indexedAt = data._meta.block.timestamp ?? undefined;
        row.schemaVersion = protocol.schemaVersion;
        row.methodologyVersion = protocol.methodologyVersion;
        row.poolFeesUSD = nonnegative(protocol.cumulativeSupplySideRevenueUSD);
        row.tvlUSD = nonnegative(protocol.totalValueLockedUSD);
        row.status =
          row.indexedAt && Date.now() / 1000 - row.indexedAt < 86400
            ? "ready"
            : "stale";
        row.walletStatus =
          source.version === "v2"
            ? "Pool revenue only. V2 wallet accounting is not implemented."
            : !hasRpc(source.chain)
              ? "Historical RPC is not configured"
              : row.status === "stale"
                ? "Index is stale. Wallet replay paused."
                : "Principal-adjusted collection sample";
        store.coverage(row);
        if (
          source.version === "v3" &&
          hasRpc(source.chain) &&
          row.status === "ready" &&
          limit
        ) {
          // Keep away from the indexer's head. RPC history and subgraph data use
          // this same pinned block, never a moving latest position snapshot.
          const savedScan =
            options.skip === undefined ? store.scan(source.id) : undefined;
          const scan =
            savedScan?.days === days
              ? savedScan
              : {
                  block: row.indexedBlock - 100,
                  since: Math.floor(Date.now() / 1000) - days * 86400,
                  skip: options.skip ?? 0,
                  days,
                };
          const block = scan.block;
          const { positions } = await graph<{ positions: Candidate[] }>(
            source,
            candidatesQuery,
            { block, since: String(scan.since), first: limit, skip: scan.skip },
          );
          row.candidates += positions.length;
          for (const candidate of positions) {
            if (!store.renew())
              throw new Error("Benchmark indexing lease was lost");
            const attemptId = `${source.id}:${candidate.id}`;
            try {
              const position = await replayPosition(source, candidate, block);
              if (!store.renew())
                throw new Error("Benchmark indexing lease was lost");
              if (!store.attempted(position.id)) row.verified++;
              store.position(position);
              store.attempt(attemptId, "verified");
              options.log?.(
                `${source.id}: verified ${position.wallet} ${position.feesUSD === null ? "unpriced fee tokens" : "$" + position.feesUSD.toFixed(2)}`,
              );
            } catch (error) {
              row.rejected++;
              const reason =
                error instanceof Error ? error.message : "Replay failed";
              store.attempt(attemptId, reason);
              options.log?.(
                `${source.id}: excluded ${candidate.id}: ${reason}`,
              );
            }
            store.coverage(row);
          }
          if (positions.length < limit || scan.skip + positions.length > 5000)
            store.resetScan(source.id);
          else
            store.saveScan(source.id, {
              ...scan,
              skip: scan.skip + positions.length,
            });
        }
      }
    } catch (error) {
      row.status = "unavailable";
      row.error = error instanceof Error ? error.message : "Source unavailable";
      options.log?.(`${source.id}: ${row.error}`);
    }
    store.coverage(row);
  }
  try {
    // Bounded source concurrency keeps gateway usage and RPC pressure predictable.
    let cursor = 0;
    await Promise.all(
      Array.from({ length: 3 }, async () => {
        while (cursor < selected.length) await indexSource(selected[cursor++]);
      }),
    );
    return store.read();
  } finally {
    store.unlock();
    store.close();
  }
}
