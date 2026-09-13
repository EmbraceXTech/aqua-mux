import registry from "./sources.json";

export type Source = {
  id: string;
  dex: string;
  version: string;
  chain: string;
  subgraphId: string;
  schema: string;
};
export const sources: Source[] = registry;
export type Coverage = Source & {
  status: "ready" | "stale" | "unavailable";
  checkedAt: number;
  indexedBlock?: number;
  indexedAt?: number;
  schemaVersion?: string;
  methodologyVersion?: string;
  poolFeesUSD?: number;
  tvlUSD?: number;
  walletStatus: string;
  candidates: number;
  verified: number;
  rejected: number;
  error?: string;
};
export type VerifiedPosition = {
  id: string;
  sourceId: string;
  wallet: string;
  tokenId: string;
  manager: string;
  pool: string;
  pair: string;
  feesToken0: string;
  feesToken1: string;
  feesUSD: number | null;
  openedAt: number;
  closedAt: number;
  valuationBlock: number;
  auditedThroughBlock: number;
  closed?: boolean;
  depositUSD: number;
  transaction: string;
};
export type BenchmarkData = {
  coverage: Coverage[];
  positions: VerifiedPosition[];
  updatedAt: number | null;
};
export type WalletRow = {
  wallet: string;
  feesUSD: number;
  depositUSD: number;
  unpricedPositions: number;
  positions: VerifiedPosition[];
  chains: string[];
  dexes: string[];
};
export type Filters = {
  chain: string;
  dex: string;
  version: string;
  search: string;
  minFees: number;
  closedDays: number;
  sort: "fees" | "positions" | "deposits";
  direction: "asc" | "desc";
};
export const defaultFilters: Filters = {
  chain: "all",
  dex: "all",
  version: "all",
  search: "",
  minFees: 0,
  closedDays: 0,
  sort: "fees",
  direction: "desc",
};

// Filter contributions BEFORE aggregating a wallet across deployments.
export function rankWallets(
  data: BenchmarkData,
  filters: Filters,
  now = Date.now() / 1000,
): WalletRow[] {
  const bySource = new Map(sources.map((source) => [source.id, source]));
  const wallets = new Map<string, WalletRow>();
  const seen = new Set<string>();
  for (const position of data.positions) {
    const source = bySource.get(position.sourceId);
    if (!source || seen.has(position.id)) continue;
    seen.add(position.id);
    if (filters.chain !== "all" && source.chain !== filters.chain) continue;
    if (filters.dex !== "all" && source.dex !== filters.dex) continue;
    if (filters.version !== "all" && source.version !== filters.version)
      continue;
    if (
      filters.closedDays &&
      position.closedAt < now - filters.closedDays * 86400
    )
      continue;
    const wallet = position.wallet.toLowerCase();
    if (!wallet.includes(filters.search.trim().toLowerCase())) continue;
    const row = wallets.get(wallet) ?? {
      wallet,
      feesUSD: 0,
      depositUSD: 0,
      unpricedPositions: 0,
      positions: [],
      chains: [],
      dexes: [],
    };
    row.feesUSD += position.feesUSD ?? 0;
    if (position.feesUSD === null) row.unpricedPositions++;
    row.depositUSD += position.depositUSD;
    row.positions.push(position);
    if (!row.chains.includes(source.chain)) row.chains.push(source.chain);
    if (!row.dexes.includes(source.dex)) row.dexes.push(source.dex);
    wallets.set(wallet, row);
  }
  const value = (row: WalletRow) =>
    filters.sort === "positions"
      ? row.positions.length
      : filters.sort === "deposits"
        ? row.depositUSD
        : row.feesUSD;
  return [...wallets.values()]
    .filter((row) => row.feesUSD >= filters.minFees)
    .sort(
      (a, b) =>
        (filters.sort === "fees"
          ? Number(a.unpricedPositions === a.positions.length) -
            Number(b.unpricedPositions === b.positions.length)
          : 0) ||
        (value(a) - value(b)) * (filters.direction === "asc" ? 1 : -1) ||
        a.wallet.localeCompare(b.wallet),
    );
}
