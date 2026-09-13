import type { Source } from "../../benchmark/model";

export type GraphFailure = "no_allocations" | "retryable" | "schema";
export class GraphQueryError extends Error {
  constructor(readonly failure: GraphFailure) {
    super(
      failure === "no_allocations"
        ? "No active indexer allocations for this deployment"
        : failure === "retryable"
          ? "Graph gateway or indexer request failed after retries"
          : "Subgraph schema is incompatible with the market query",
    );
  }
}
const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
const graphFailure = (message: string): GraphFailure => {
  const value = message.toLowerCase();
  if (value.includes("no allocations") || value.includes("subgraph not found"))
    return "no_allocations";
  if (
    /bad indexers|timeout|timed out|rate limit|too many requests|internal|unavailable|temporar/.test(
      value,
    )
  )
    return "retryable";
  return "schema";
};

export async function graph<T>(
  source: Source,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const key = process.env.THE_GRAPH_API_KEY;
  if (!key) throw new Error("THE_GRAPH_API_KEY is not configured");
  let lastFailure: GraphFailure = "retryable";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(
        `https://gateway.thegraph.com/api/${key}/subgraphs/id/${source.subgraphId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(30_000),
          cache: "no-store",
        },
      );
      if (!response.ok) {
        lastFailure =
          response.status === 429 || response.status >= 500
            ? "retryable"
            : "schema";
      } else {
        const result = (await response.json()) as {
          data?: T;
          errors?: { message: string }[];
        };
        if (result.data && !result.errors?.length) return result.data;
        lastFailure = graphFailure(
          result.errors?.map((error) => error.message).join(" ") ?? "",
        );
      }
    } catch {
      lastFailure = "retryable";
    }
    if (lastFailure !== "retryable") break;
    if (attempt < 2) await wait(250 * 2 ** attempt);
  }
  // Do not forward gateway messages or URLs, which may contain credentials.
  throw new GraphQueryError(lastFailure);
}
export const protocolQuery = `{
  _meta { block { number timestamp } hasIndexingErrors }
  dexAmmProtocols(first: 1) { name network schemaVersion methodologyVersion cumulativeSupplySideRevenueUSD totalValueLockedUSD }
}`;
export type ProtocolResult = {
  _meta: {
    block: { number: number; timestamp: number | null };
    hasIndexingErrors: boolean;
  };
  dexAmmProtocols: {
    name: string;
    network: string;
    schemaVersion: string;
    methodologyVersion: string;
    cumulativeSupplySideRevenueUSD: string;
    totalValueLockedUSD: string;
  }[];
};
export type Candidate = {
  id: string;
  hashOpened: string;
  blockNumberOpened: string;
  blockNumberClosed: string | null;
  snapshots: { blockNumber: string }[];
  timestampOpened: string;
  cumulativeDepositUSD: string;
  pool: {
    id: string;
    name: string;
    inputTokens: { id: string; symbol: string; decimals: number }[];
  };
};
export const poolsQuery = `query Pools($block: Int!, $first: Int!) {
  liquidityPools(block: {number: $block}, first: $first, orderBy: totalValueLockedUSD, orderDirection: desc) {
    id name totalValueLockedUSD cumulativeVolumeUSD cumulativeSupplySideRevenueUSD
    inputTokens { id symbol }
    fees { feePercentage feeType }
    dailySnapshots(first: 7, orderBy: timestamp, orderDirection: desc) {
      timestamp totalValueLockedUSD dailyVolumeUSD dailySupplySideRevenueUSD
    }
  }
}`;
export type GraphPool = {
  id: string;
  name: string | null;
  totalValueLockedUSD: string;
  cumulativeVolumeUSD: string;
  cumulativeSupplySideRevenueUSD: string;
  inputTokens: { id: string; symbol: string }[];
  fees: { feePercentage: string | null; feeType: string }[];
  dailySnapshots: {
    timestamp: string;
    totalValueLockedUSD: string;
    dailyVolumeUSD: string;
    dailySupplySideRevenueUSD: string;
  }[];
};
export const candidatesQuery = `query Candidates($block: Int!, $since: BigInt!, $first: Int!, $skip: Int!) {
  positions(block: {number: $block}, first: $first, skip: $skip, orderBy: cumulativeWithdrawUSD, orderDirection: desc,
    where: {timestampOpened_gte: $since, cumulativeWithdrawUSD_gt: "0"}) {
    id hashOpened blockNumberOpened blockNumberClosed timestampOpened cumulativeDepositUSD
    snapshots(first:1, orderBy:blockNumber, orderDirection:desc) { blockNumber }
    pool { id name inputTokens { id symbol decimals } }
  }
}`;
export function nonnegative(value: string): number {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0)
    throw new Error("Invalid financial value");
  return number;
}
