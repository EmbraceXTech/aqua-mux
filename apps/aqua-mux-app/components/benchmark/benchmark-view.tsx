"use client";

import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  Info,
  Layers3,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import {
  defaultMarketFilters,
  rankMarketPools,
  sources,
  type BenchmarkData,
  type MarketFilters,
} from "@/lib/benchmark/model";
import s from "./benchmark.module.css";

const empty: BenchmarkData = {
  coverage: [],
  pools: [],
  positions: [],
  updatedAt: null,
};
const pageSize = 12;
const money = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: value >= 1_000_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 1_000_000 ? 2 : 0,
  }).format(value);
const percent = (value: number | null, digits = 1) =>
  value === null || !Number.isFinite(value)
    ? "Not available"
    : new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits: digits,
      }).format(value);
const short = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
const chains: Record<string, string> = {
  ethereum: "Ethereum",
  arbitrum: "Arbitrum",
  base: "Base",
  bsc: "BNB Chain",
  optimism: "Optimism",
  polygon: "Polygon",
  avalanche: "Avalanche",
  gnosis: "Gnosis",
  celo: "Celo",
};
const explorers: Record<string, string> = {
  ethereum: "https://etherscan.io/address/",
  arbitrum: "https://arbiscan.io/address/",
  base: "https://basescan.org/address/",
  bsc: "https://bscscan.com/address/",
  optimism: "https://optimistic.etherscan.io/address/",
  polygon: "https://polygonscan.com/address/",
  avalanche: "https://snowtrace.io/address/",
  gnosis: "https://gnosisscan.io/address/",
  celo: "https://celoscan.io/address/",
};

function Trend({ value }: { value: number | null }) {
  if (value === null) return <span className={s.muted}>Not available</span>;
  const up = value >= 0;
  return (
    <span className={up ? s.positive : s.negative}>
      {up ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
      {percent(Math.abs(value))}
    </span>
  );
}

export function BenchmarkView() {
  const [filters, setFilters] = useState<MarketFilters>(defaultMarketFilters);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<"markets" | "coverage">("markets");
  const query = useQuery({
    queryKey: ["benchmark"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/benchmark", { signal });
      if (!response.ok) throw new Error("Could not load market data.");
      return (await response.json()) as BenchmarkData;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const data = query.data ?? empty;
  const rows = rankMarketPools(data, filters);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / pageSize) - 1),
  );
  const shown = rows.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const activeCoverage = data.coverage.filter(
    (source) =>
      (filters.chain === "all" || source.chain === filters.chain) &&
      (filters.dex === "all" || source.dex === filters.dex) &&
      (filters.version === "all" || source.version === filters.version),
  );
  const ready = data.coverage.filter((source) => source.status === "ready");
  const totalTvl = rows.reduce((sum, row) => sum + row.tvlUSD, 0);
  const totalRevenue = rows.reduce(
    (sum, row) => sum + row.supplySideRevenueUSD,
    0,
  );
  const updatedAt = data.updatedAt;
  const stale = !updatedAt || query.dataUpdatedAt - updatedAt > 86_400_000;
  const update = <K extends keyof MarketFilters>(
    key: K,
    value: MarketFilters[K],
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
    setExpanded(null);
  };
  const sort = (key: MarketFilters["sort"]) =>
    setFilters((current) => ({
      ...current,
      sort: key,
      direction:
        current.sort === key && current.direction === "desc" ? "asc" : "desc",
    }));
  const sortIcon = (key: MarketFilters["sort"]) =>
    filters.sort === key ? (
      filters.direction === "desc" ? (
        <ArrowDown size={13} />
      ) : (
        <ArrowUp size={13} />
      )
    ) : (
      <ChevronDown size={13} />
    );

  return (
    <MainLayout activePage="benchmark">
      <div className={s.root}>
        <div className={s.heading}>
          <div>
            <div className={s.eyebrow}>CROSS-CHAIN MARKET INTELLIGENCE</div>
            <h1>Find liquid markets for your strategy.</h1>
            <p>
              Compare live AMM market conditions across standardized Graph data
              sources.
            </p>
          </div>
          <button
            className={s.refresh}
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              size={15}
              className={query.isFetching ? s.spinning : ""}
            />
            {query.isFetching ? "Refreshing" : "Refresh data"}
          </button>
        </div>

        <div className={s.notice}>
          <ShieldCheck size={19} />
          <div>
            <strong>Pool-level market data, not wallet earnings.</strong>
            <p>
              TVL, volume, and supply-side revenue describe an entire pool. They
              help compare market conditions, but do not predict Aqua strategy
              returns, fees, or profit.
            </p>
          </div>
          <a href="#methodology">
            Methodology <ArrowUpRight size={13} />
          </a>
        </div>

        {query.isError && (
          <div className={s.error} role="alert">
            {query.error.message}
          </div>
        )}
        {!query.isPending && stale && (
          <div className={s.error} role="status">
            {updatedAt
              ? "The stored market scan is over 24 hours old. Refresh reloads the latest stored scan."
              : "No market scan has been published yet. Source availability is shown below."}
          </div>
        )}

        <section className={s.stats} aria-label="Market summary">
          <div className={s.featuredStat}>
            <span>
              <Layers3 size={15} /> Indexed market TVL
            </span>
            <strong>{query.isPending ? "…" : money(totalTvl)}</strong>
            <small>Across the filtered market set</small>
          </div>
          <div>
            <span>
              <TrendingUp size={15} /> Pool LP revenue
            </span>
            <strong>{query.isPending ? "…" : money(totalRevenue)}</strong>
            <small>All-time aggregate supply-side revenue</small>
          </div>
          <div>
            <span>
              <Database size={15} /> Market pools
            </span>
            <strong>
              {query.isPending ? "…" : rows.length.toLocaleString()}
            </strong>
            <small>Indexed pools matching these filters</small>
          </div>
          <div>
            <span>
              <ShieldCheck size={15} /> Source coverage
            </span>
            <strong>
              {query.isPending ? "…" : `${ready.length} / ${sources.length}`}
            </strong>
            <small>Healthy standardized deployments</small>
          </div>
        </section>

        <section className={s.panel} aria-label="Market scanner">
          <div className={s.panelHeading}>
            <div className={s.tabs}>
              <button
                aria-pressed={tab === "markets"}
                className={tab === "markets" ? s.activeTab : ""}
                onClick={() => setTab("markets")}
              >
                Market scanner <span>{rows.length}</span>
              </button>
              <button
                aria-pressed={tab === "coverage"}
                className={tab === "coverage" ? s.activeTab : ""}
                onClick={() => setTab("coverage")}
              >
                Source coverage <span>{sources.length}</span>
              </button>
            </div>
            <span className={s.snapshot}>
              <i className={stale ? s.staleDot : s.dot} />
              {updatedAt
                ? `Scan ${new Date(updatedAt).toLocaleString()}`
                : "Awaiting scan"}
            </span>
          </div>

          <div className={s.filters}>
            <label>
              Chain
              <select
                value={filters.chain}
                onChange={(event) => update("chain", event.target.value)}
              >
                <option value="all">All chains</option>
                {Object.entries(chains).map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              DEX
              <select
                value={filters.dex}
                onChange={(event) => update("dex", event.target.value)}
              >
                <option value="all">All DEXes</option>
                {["Uniswap", "SushiSwap", "PancakeSwap"].map((dex) => (
                  <option key={dex}>{dex}</option>
                ))}
              </select>
            </label>
            <label>
              AMM version
              <select
                value={filters.version}
                onChange={(event) => update("version", event.target.value)}
              >
                <option value="all">All versions</option>
                {["v2", "v3", "v4"].map((version) => (
                  <option key={version}>{version}</option>
                ))}
              </select>
            </label>
            <label>
              Minimum TVL
              <input
                type="number"
                min="0"
                step="any"
                placeholder="USD 0"
                value={filters.minTvl || ""}
                onChange={(event) =>
                  update("minTvl", Math.max(0, Number(event.target.value) || 0))
                }
              />
            </label>
            <button
              className={s.reset}
              onClick={() => {
                setFilters(defaultMarketFilters);
                setPage(0);
                setExpanded(null);
              }}
            >
              Reset filters
            </button>
          </div>

          {tab === "markets" ? (
            <>
              <div className={s.tableToolbar}>
                <label className={s.search}>
                  <Search size={16} />
                  <input
                    aria-label="Search markets"
                    placeholder="Search pair, DEX, or pool address"
                    value={filters.search}
                    onChange={(event) => update("search", event.target.value)}
                  />
                </label>
                <span>
                  {rows.length} indexed pools{" "}
                  <span className={s.separator}>/</span> Ordered by pool metrics
                </span>
              </div>
              <div className={s.tableScroll}>
                <table className={s.table}>
                  <caption className={s.srOnly}>
                    Cross-chain AMM market scanner
                  </caption>
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th>DEX / chain</th>
                      <th>
                        <button onClick={() => sort("tvl")}>
                          TVL {sortIcon("tvl")}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => sort("volume")}>
                          All-time volume {sortIcon("volume")}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => sort("revenue")}>
                          Pool LP revenue {sortIcon("revenue")}
                        </button>
                      </th>
                      <th>
                        <button onClick={() => sort("efficiency")}>
                          Volume / TVL {sortIcon("efficiency")}
                        </button>
                      </th>
                      <th>
                        <span className={s.srOnly}>Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.isPending
                      ? Array.from({ length: 6 }, (_, index) => (
                          <tr key={index}>
                            <td colSpan={7}>
                              <div className={s.skeleton} />
                            </td>
                          </tr>
                        ))
                      : shown.map((pool) => (
                          <Fragment key={pool.id}>
                            <tr
                              className={
                                expanded === pool.id ? s.selectedRow : ""
                              }
                            >
                              <td>
                                <strong>{pool.pair}</strong>
                                <small>
                                  <code title={pool.pool}>
                                    {short(pool.pool)}
                                  </code>
                                  {pool.feePercentage !== null
                                    ? ` · ${percent(pool.feePercentage / 100)} fee tier`
                                    : ""}
                                </small>
                              </td>
                              <td>
                                <strong>
                                  {pool.source.dex} {pool.source.version}
                                </strong>
                                <small>{chains[pool.source.chain]}</small>
                              </td>
                              <td className={s.numeric}>
                                {money(pool.tvlUSD)}
                                <small>
                                  <Trend value={pool.tvlChange} /> over indexed
                                  window
                                </small>
                              </td>
                              <td className={s.numeric}>
                                {money(pool.volumeUSD)}
                                <small>
                                  <Trend value={pool.volumeChange} /> daily
                                  activity trend
                                </small>
                              </td>
                              <td className={s.numeric}>
                                {money(pool.supplySideRevenueUSD)}
                                <small>All-time pool aggregate</small>
                              </td>
                              <td className={s.numeric}>
                                {percent(pool.volumeToTvl)}
                                <small>Not a yield measure</small>
                              </td>
                              <td>
                                <button
                                  className={s.expand}
                                  aria-label={`View market details for ${pool.pair}`}
                                  aria-expanded={expanded === pool.id}
                                  onClick={() =>
                                    setExpanded(
                                      expanded === pool.id ? null : pool.id,
                                    )
                                  }
                                >
                                  <ChevronDown size={16} />
                                </button>
                              </td>
                            </tr>
                            {expanded === pool.id && (
                              <tr>
                                <td colSpan={7} className={s.detailCell}>
                                  <div className={s.details}>
                                    <div>
                                      <h3>{pool.pair}</h3>
                                      <p>
                                        External market context for Aqua
                                        strategy review. This pool is not an
                                        Aqua position and its revenue is not
                                        allocated to a wallet.
                                      </p>
                                      <a
                                        href={`${explorers[pool.source.chain]}${pool.pool}`}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        Open pool contract{" "}
                                        <ArrowUpRight size={13} />
                                      </a>
                                    </div>
                                    <div className={s.snapshotGrid}>
                                      <span>
                                        <small>Latest indexed update</small>
                                        <strong>
                                          {pool.updatedAt
                                            ? new Date(
                                                pool.updatedAt * 1000,
                                              ).toLocaleString()
                                            : "Not available"}
                                        </strong>
                                      </span>
                                      <span>
                                        <small>Latest daily LP revenue</small>
                                        <strong>
                                          {pool.snapshots[0]
                                            ? money(
                                                pool.snapshots[0]
                                                  .supplySideRevenueUSD,
                                              )
                                            : "Not available"}
                                        </strong>
                                      </span>
                                      <span>
                                        <small>Latest daily volume</small>
                                        <strong>
                                          {pool.snapshots[0]
                                            ? money(pool.snapshots[0].volumeUSD)
                                            : "Not available"}
                                        </strong>
                                      </span>
                                      <span>
                                        <small>Revenue / TVL</small>
                                        <strong>
                                          {percent(pool.dailyRevenueToTvl)}
                                        </strong>
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                  </tbody>
                </table>
              </div>
              {!query.isPending && !rows.length && (
                <div className={s.empty}>
                  <Search size={26} />
                  <h3>
                    {data.pools.length
                      ? "No markets match these filters"
                      : "No indexed markets yet"}
                  </h3>
                  <p>
                    {data.pools.length
                      ? "Try a broader chain, DEX, or TVL filter."
                      : "Run the market indexer with a live Graph API key to publish pool data."}
                  </p>
                </div>
              )}
              <div className={s.pagination}>
                <span>
                  {rows.length
                    ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, rows.length)} of ${rows.length} markets`
                    : "0 markets"}
                </span>
                <div>
                  <button
                    aria-label="Previous page"
                    disabled={currentPage === 0}
                    onClick={() => setPage(currentPage - 1)}
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span>
                    Page {currentPage + 1} of{" "}
                    {Math.max(1, Math.ceil(rows.length / pageSize))}
                  </span>
                  <button
                    aria-label="Next page"
                    disabled={(currentPage + 1) * pageSize >= rows.length}
                    onClick={() => setPage(currentPage + 1)}
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className={s.coverage}>
              <p className={s.coverageNote}>
                Each deployment uses the shared DEX AMM schema. Availability and
                freshness are shown per source so incomplete markets are never
                presented as zero liquidity or zero revenue.
              </p>
              <div className={s.tableScroll}>
                <table className={s.table}>
                  <thead>
                    <tr>
                      <th>Deployment</th>
                      <th>Index status</th>
                      <th>Protocol TVL</th>
                      <th>Pool LP revenue</th>
                      <th>Market scanner</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeCoverage.map((source) => (
                      <tr key={source.id}>
                        <td>
                          <strong>
                            {source.dex} {source.version}
                          </strong>
                          <small>
                            {chains[source.chain]} ·{" "}
                            {source.schemaVersion
                              ? `Schema ${source.schemaVersion}`
                              : "Schema pending verification"}
                          </small>
                        </td>
                        <td>
                          <span
                            className={`${s.status} ${source.status === "ready" ? s.ready : source.status === "stale" || source.status === "degraded" ? s.stale : s.unavailable}`}
                          >
                            {source.status === "ready"
                              ? "Indexed"
                              : source.status === "stale"
                                ? "Stale"
                                : source.status === "degraded"
                                  ? "Retrying"
                                  : "Unavailable"}
                          </span>
                          <small>
                            {source.indexedAt
                              ? new Date(
                                  source.indexedAt * 1000,
                                ).toLocaleString()
                              : "Not available"}
                          </small>
                        </td>
                        <td className={s.numeric}>
                          {source.tvlUSD === undefined
                            ? "Not available"
                            : money(source.tvlUSD)}
                        </td>
                        <td className={s.numeric}>
                          {source.poolFeesUSD === undefined
                            ? "Not available"
                            : money(source.poolFeesUSD)}
                        </td>
                        <td>
                          <span>
                            {source.status === "ready"
                              ? "Pool scan available"
                              : source.status === "degraded"
                                ? "Last scan retained; retry pending"
                                : "Awaiting a healthy source"}
                          </span>
                          <small>
                            {source.error ?? "Standardized fields only"}
                          </small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        <section className={s.methodology} id="methodology">
          <div>
            <Info size={19} />
            <h2>Read this market data correctly</h2>
          </div>
          <div className={s.methodGrid}>
            <article>
              <h3>Comparable market context</h3>
              <p>
                The same standardized DEX AMM query reads pool liquidity,
                volume, and supply-side revenue across supported deployments. It
                is a market scanner, not a wallet leaderboard.
              </p>
            </article>
            <article>
              <h3>No implied strategy return</h3>
              <p>
                Pool revenue belongs to all liquidity providers. Range activity,
                inventory changes, prices, strategy fees, gas, and timing
                determine an Aqua strategy&apos;s own outcome.
              </p>
            </article>
            <article>
              <h3>Freshness is part of the result</h3>
              <p>
                Every source reports its indexed block and status. Missing,
                stale, or incompatible data remains unavailable. The page never
                turns unavailable data into zero.
              </p>
            </article>
          </div>
          <div className={s.methodLinks}>
            <a
              href="https://thegraph.com/docs/en/subgraphs/existing-subgraphs/standard-subgraphs/"
              target="_blank"
              rel="noreferrer"
            >
              The Graph standardized schemas <ArrowUpRight size={13} />
            </a>
            <span>Read-only · No wallet connection required</span>
          </div>
        </section>
      </div>
    </MainLayout>
  );
}
