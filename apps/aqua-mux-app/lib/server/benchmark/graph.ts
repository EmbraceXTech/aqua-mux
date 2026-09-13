import type { Source } from "../../benchmark/model";

export async function graph<T>(
  source: Source,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const key = process.env.THE_GRAPH_API_KEY;
  if (!key) throw new Error("THE_GRAPH_API_KEY is not configured");
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
  if (!response.ok) throw new Error(`Graph gateway HTTP ${response.status}`);
  const result = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  // Do not forward gateway messages or URLs, which may contain credentials.
  if (result.errors?.length || !result.data)
    throw new Error("Subgraph query failed or schema is incompatible");
  return result.data;
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
