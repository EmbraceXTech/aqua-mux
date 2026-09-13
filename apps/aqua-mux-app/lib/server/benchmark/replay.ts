import {
  decodeEventLog,
  encodeEventTopics,
  formatUnits,
  parseAbi,
  toHex,
  type Hex,
} from "viem";
import type { Source, VerifiedPosition } from "../../benchmark/model";
import { settlePosition, type PositionEvent } from "./accounting";
import { graph, nonnegative, type Candidate } from "./graph";

const abi = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "event IncreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "event DecreaseLiquidity(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1)",
  "event Collect(uint256 indexed tokenId, address recipient, uint256 amount0, uint256 amount1)",
]);
const rpcNames: Record<string, string> = {
  ethereum: "ETHEREUM_RPC_URL",
  arbitrum: "ARBITRUM_RPC_URL",
  base: "BASE_RPC_URL",
  bsc: "BNB_RPC_URL",
  optimism: "OPTIMISM_RPC_URL",
  polygon: "POLYGON_RPC_URL",
  avalanche: "AVALANCHE_RPC_URL",
  gnosis: "GNOSIS_RPC_URL",
  celo: "CELO_RPC_URL",
};
export function hasRpc(chain: string) {
  return Boolean(process.env[rpcNames[chain]]);
}
let nextRpcAt = 0;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
type Log = {
  address: Hex;
  topics: [Hex, ...Hex[]];
  data: Hex;
  blockNumber: Hex;
  transactionIndex: Hex;
  logIndex: Hex;
  transactionHash: Hex;
  removed?: boolean;
};
export async function replayPosition(
  source: Source,
  candidate: Candidate,
  throughBlock: number,
): Promise<VerifiedPosition> {
  const url = process.env[rpcNames[source.chain]];
  if (!url) throw new Error("Historical RPC is not configured for this chain");
  const end = Math.max(
    Number(candidate.blockNumberClosed ?? 0),
    Number(candidate.snapshots[0]?.blockNumber ?? 0),
  );
  const maxBlocks = Number(process.env.BENCHMARK_MAX_POSITION_BLOCKS ?? 1000);
  const chunkSize = Number(process.env.BENCHMARK_RPC_LOG_BLOCKS ?? 10);
  if (
    !Number.isSafeInteger(end) ||
    end > throughBlock ||
    end < Number(candidate.blockNumberOpened)
  )
    throw new Error("Invalid historical cutoff block");
  if (
    !Number.isSafeInteger(maxBlocks) ||
    maxBlocks < 1 ||
    maxBlocks > 10_000_000
  )
    throw new Error("Invalid position block budget");
  if (end - Number(candidate.blockNumberOpened) > maxBlocks)
    throw new Error(
      "Deferred: position history exceeds this run's block budget",
    );
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 50_000)
    throw new Error("Invalid RPC log chunk size");
  let budget = Math.min(1000, 2 * Math.ceil(maxBlocks / chunkSize) + 20);
  async function rpc<T>(method: string, params: unknown[]): Promise<T> {
    if (--budget < 0) throw new Error("Per-position RPC budget exhausted");
    const slot = Math.max(Date.now(), nextRpcAt);
    nextRpcAt = slot + 350;
    await pause(slot - Date.now());
    let response: Response | undefined;
    for (let attempt = 0; attempt < 4; attempt++) {
      response = await fetch(url!, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(25_000),
      });
      if (response.status !== 429) break;
      await response.body?.cancel();
      await pause(2000 * 2 ** attempt);
    }
    if (!response) throw new Error("Historical RPC did not respond");
    if (!response.ok)
      throw new Error(`Historical RPC ${method} HTTP ${response.status}`);
    const body = (await response.json()) as {
      result: T;
      error?: { code: number };
    };
    if (body.error || body.result == null)
      throw new Error(
        `Historical RPC ${method} failed (${body.error?.code ?? "missing result"})`,
      );
    return body.result;
  }
  const chainIds: Record<string, number> = {
    ethereum: 1,
    arbitrum: 42161,
    base: 8453,
    bsc: 56,
    optimism: 10,
    polygon: 137,
    avalanche: 43114,
    gnosis: 100,
    celo: 42220,
  };
  if (
    Number(BigInt(await rpc<Hex>("eth_chainId", []))) !== chainIds[source.chain]
  )
    throw new Error("RPC chain does not match subgraph deployment");
  const anchor = await rpc<{ hash: Hex }>("eth_getBlockByNumber", [
    toHex(end),
    false,
  ]);
  const mint = await rpc<{ logs: Log[] }>("eth_getTransactionReceipt", [
    candidate.hashOpened,
  ]);
  // Messari's Position ID ends in concatI32(tokenId). Verify against the mint
  // receipt rather than trusting the signed 32-bit ID as the NFT token ID.
  const suffix = candidate.id.slice(-8).toLowerCase();
  const minted = mint.logs.flatMap((log) => {
    try {
      const event = decodeEventLog({ abi, data: log.data, topics: log.topics });
      if (
        event.eventName !== "Transfer" ||
        event.args.from !== "0x0000000000000000000000000000000000000000"
      )
        return [];
      const bytes = Buffer.alloc(4);
      bytes.writeUInt32LE(Number(event.args.tokenId & 0xffffffffn));
      return bytes.toString("hex") === suffix
        ? [{ manager: log.address, tokenId: event.args.tokenId }]
        : [];
    } catch {
      return [];
    }
  });
  if (minted.length !== 1)
    throw new Error("Cannot uniquely resolve the position NFT");
  const { manager, tokenId } = minted[0];
  const start = Number(candidate.blockNumberOpened);
  if (!Number.isSafeInteger(start) || start > throughBlock)
    throw new Error("Invalid position block");
  async function logs(
    topics: unknown[],
    from: number,
    to: number,
  ): Promise<Log[]> {
    const result: Log[] = [];
    for (let cursor = from; cursor <= to; cursor += chunkSize) {
      result.push(
        ...(await rpc<Log[]>("eth_getLogs", [
          {
            address: manager,
            topics,
            fromBlock: toHex(cursor),
            toBlock: toHex(Math.min(to, cursor + chunkSize - 1)),
          },
        ])),
      );
    }
    return result;
  }
  const topic = (name: "IncreaseLiquidity" | "DecreaseLiquidity" | "Collect") =>
    encodeEventTopics({ abi, eventName: name })[0];
  const positionLogs = await logs(
    [
      [
        topic("IncreaseLiquidity"),
        topic("DecreaseLiquidity"),
        topic("Collect"),
      ],
      toHex(tokenId, { size: 32 }),
    ],
    start,
    end,
  );
  const transfers = await logs(
    encodeEventTopics({ abi, eventName: "Transfer", args: { tokenId } }),
    start,
    end,
  );
  const events: PositionEvent[] = [];
  const seen = new Set<string>();
  for (const log of [...positionLogs, ...transfers]) {
    const key = `${log.transactionHash}:${log.logIndex}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (log.removed) throw new Error("Reorg encountered during replay");
    const event = decodeEventLog({ abi, data: log.data, topics: log.topics });
    const base = {
      block: Number(BigInt(log.blockNumber)),
      transactionIndex: Number(BigInt(log.transactionIndex)),
      logIndex: Number(BigInt(log.logIndex)),
      transaction: log.transactionHash,
    };
    if (event.args.tokenId !== tokenId)
      throw new Error("RPC returned a different NFT");
    if (event.eventName === "Transfer")
      events.push({
        ...base,
        kind: "transfer",
        from: event.args.from,
        to: event.args.to,
      });
    else if (event.eventName === "Collect")
      events.push({
        ...base,
        kind: "collect",
        amount0: event.args.amount0,
        amount1: event.args.amount1,
      });
    else
      events.push({
        ...base,
        kind: event.eventName === "IncreaseLiquidity" ? "increase" : "decrease",
        amount0: event.args.amount0,
        amount1: event.args.amount1,
        liquidity: event.args.liquidity,
      });
  }
  const settled = settlePosition(events, false);
  const block = settled.lastCollection.block;
  const prices = await graph<{
    tokens: {
      id: string;
      decimals: number;
      lastPriceUSD: string | null;
      lastPriceBlockNumber: string | null;
    }[];
  }>(
    source,
    `query Prices($block: Int!, $ids: [Bytes!]!) { tokens(block:{number:$block},where:{id_in:$ids}) { id decimals lastPriceUSD lastPriceBlockNumber } }`,
    { block, ids: candidate.pool.inputTokens.map((t) => t.id) },
  );
  if (candidate.pool.inputTokens.length !== 2)
    throw new Error("Expected a two-token AMM");
  const amounts = [settled.fees0, settled.fees1];
  let feesUSD = 0;
  let priced = true;
  for (const [index, token] of candidate.pool.inputTokens.entries()) {
    const price = prices.tokens.find(
      (t) => t.id.toLowerCase() === token.id.toLowerCase(),
    );
    if (amounts[index] === 0n) continue;
    if (!price?.lastPriceUSD || Number(price.lastPriceUSD) === 0) {
      priced = false;
      continue;
    }
    if (price.decimals !== token.decimals)
      throw new Error("Token decimal mismatch");
    const usd = nonnegative(price.lastPriceUSD);
    feesUSD += Number(formatUnits(amounts[index], token.decimals)) * usd;
  }
  if (!Number.isFinite(feesUSD) || feesUSD < 0)
    throw new Error("Invalid fee valuation");
  const closedBlock = await rpc<{ timestamp: Hex }>("eth_getBlockByNumber", [
    toHex(block),
    false,
  ]);
  const after = await rpc<{ hash: Hex }>("eth_getBlockByNumber", [
    toHex(end),
    false,
  ]);
  if (after.hash !== anchor.hash)
    throw new Error("Chain reorganized during position replay");
  return {
    id: `${source.id}:${manager.toLowerCase()}:${tokenId}`,
    sourceId: source.id,
    wallet: settled.wallet,
    manager,
    tokenId: tokenId.toString(),
    pool: candidate.pool.id,
    pair: candidate.pool.inputTokens.map((t) => t.symbol).join(" / "),
    feesToken0: formatUnits(
      settled.fees0,
      candidate.pool.inputTokens[0].decimals,
    ),
    feesToken1: formatUnits(
      settled.fees1,
      candidate.pool.inputTokens[1].decimals,
    ),
    feesUSD: priced && feesUSD > 0 ? feesUSD : null,
    openedAt: Number(candidate.timestampOpened),
    closedAt: Number(BigInt(closedBlock.timestamp)),
    valuationBlock: block,
    auditedThroughBlock: end,
    closed: settled.closed,
    depositUSD: nonnegative(candidate.cumulativeDepositUSD),
    transaction: settled.lastCollection.transaction,
  };
}
