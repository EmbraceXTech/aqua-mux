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
  Wallet,
} from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import {
  defaultFilters,
  rankWallets,
  sources,
  type BenchmarkData,
  type Filters,
} from "@/lib/benchmark/model";
import s from "./benchmark.module.css";

const money = (value: number | null) =>
  value === null
    ? "Unpriced"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 2,
      }).format(value);
const compact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value);
const short = (address: string) =>
  `${address.slice(0, 6)}…${address.slice(-4)}`;
const chainNames: Record<string, string> = {
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
  ethereum: "https://etherscan.io",
  arbitrum: "https://arbiscan.io",
  base: "https://basescan.org",
  bsc: "https://bscscan.com",
  optimism: "https://optimistic.etherscan.io",
  polygon: "https://polygonscan.com",
  avalanche: "https://snowtrace.io",
  gnosis: "https://gnosisscan.io",
  celo: "https://celoscan.io",
};
const empty: BenchmarkData = { coverage: [], positions: [], updatedAt: null };
const pageSize = 10;

export function BenchmarkView() {
  const [filters, setFilters] = useState<Filters>(defaultFilters);
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<"wallets" | "coverage">("wallets");
  const query = useQuery({
    queryKey: ["benchmark"],
    queryFn: async ({ signal }) => {
      const response = await fetch("/api/benchmark", { signal });
      if (!response.ok)
        throw new Error("Could not load benchmark history. Try again.");
      return (await response.json()) as BenchmarkData;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
  });
  const data = query.data ?? empty;
  const now = query.dataUpdatedAt;
  const rows = rankWallets(data, filters, now / 1000);
  const totalFees = rows.reduce((total, row) => total + row.feesUSD, 0);
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(rows.length / pageSize) - 1),
  );
  const shown = rows.slice(
    currentPage * pageSize,
    (currentPage + 1) * pageSize,
  );
  const filteredCoverage = data.coverage.filter(
    (source) =>
      (filters.chain === "all" || source.chain === filters.chain) &&
      (filters.dex === "all" || source.dex === filters.dex) &&
      (filters.version === "all" || source.version === filters.version),
  );
  const fresh = data.coverage.filter(
    (source) =>
      source.status === "ready" &&
      source.indexedAt &&
      now / 1000 - source.indexedAt < 86400,
  );
  const databaseOld = !data.updatedAt || now - data.updatedAt > 86400000;
  function update<K extends keyof Filters>(key: K, value: Filters[K]) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(0);
    setExpanded(null);
  }
  function sort(key: Filters["sort"]) {
    setFilters((current) => ({
      ...current,
      sort: key,
      direction:
        current.sort === key && current.direction === "desc" ? "asc" : "desc",
    }));
    setPage(0);
  }
  const sortIcon = (key: Filters["sort"]) =>
    filters.sort === key ? (
      filters.direction === "desc" ? (
        <ArrowDown size={13} />
      ) : (
        <ArrowUp size={13} />
      )
    ) : (
      <ChevronDown size={13} />
    );
  const reset = () => {
    setFilters(defaultFilters);
    setPage(0);
    setExpanded(null);
  };

  return (
    <MainLayout
      activePage="benchmark"
      actions={
        <span className={s.headerLabel}>
          <Database size={14} /> Public on-chain data
        </span>
      }
    >
      <div className={s.root}>
        <div className={s.heading}>
          <div>
            <div className={s.eyebrow}>LIQUIDITY INTELLIGENCE</div>
            <h1>What can one wallet earn?</h1>
            <p>
              Explore historical LP fee collections across DEXes and chains.
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
            />{" "}
            {query.isFetching ? "Refreshing" : "Refresh data"}
          </button>
        </div>
        <div className={s.notice}>
          <ShieldCheck size={19} />
          <div>
            <strong>Verified collections, not projected returns.</strong>
            <p>
              This is a sample of v3 position histories, not a global wallet
              leaderboard. Principal is excluded. USD values use historical
              subgraph price snapshots. Fees are not profit and top wallets are
              not typical outcomes.
            </p>
          </div>
          <a href="#methodology">
            How we calculate <ArrowUpRight size={13} />
          </a>
        </div>
        {query.isError && (
          <div className={s.error} role="alert">
            {query.error.message}{" "}
            {query.data && "Showing the last loaded snapshot."}
          </div>
        )}
        {!query.isPending && databaseOld && (
          <div className={s.error} role="status">
            {data.updatedAt
              ? "The stored backfill is over 24 hours old. Refresh reloads saved results, not blockchain history."
              : "The historical indexer has not published a snapshot yet. No example wallets are substituted."}
          </div>
        )}
        <section className={s.stats} aria-label="Benchmark summary">
          <div className={s.featuredStat}>
            <span>
              <Layers3 size={15} /> Collected fees in this sample
            </span>
            <strong>{query.isPending ? "…" : compact(totalFees)}</strong>
            <small>
              Priced fees only ·{" "}
              {rows.reduce((sum, row) => sum + row.unpricedPositions, 0)}{" "}
              unpriced histories
            </small>
          </div>
          <div>
            <span>
              <Wallet size={15} /> Verified wallets
            </span>
            <strong>
              {query.isPending ? "…" : rows.length.toLocaleString()}
            </strong>
            <small>
              {rows.reduce((sum, row) => sum + row.positions.length, 0)} audited
              position histories
            </small>
          </div>
          <div>
            <span>
              <ShieldCheck size={15} /> Highest priced wallet total
            </span>
            <strong>
              {query.isPending
                ? "…"
                : rows.length
                  ? Math.max(...rows.map((row) => row.feesUSD)) > 0
                    ? compact(Math.max(...rows.map((row) => row.feesUSD)))
                    : "Unpriced"
                  : "Not available"}
            </strong>
            <small>Collected fees, before costs and losses</small>
          </div>
          <div>
            <span>
              <Database size={15} /> Source coverage
            </span>
            <strong>
              {query.isPending ? "…" : `${fresh.length} / ${sources.length}`}
            </strong>
            <small>Fresh deployments · 3 DEXes · 9 chains</small>
          </div>
        </section>
        <section className={s.panel} aria-label="LP fee benchmark">
          <div className={s.panelHeading}>
            <div className={s.tabs}>
              <button
                aria-pressed={tab === "wallets"}
                className={tab === "wallets" ? s.activeTab : ""}
                onClick={() => setTab("wallets")}
              >
                Wallet rankings <span>{rows.length}</span>
              </button>
              <button
                aria-pressed={tab === "coverage"}
                className={tab === "coverage" ? s.activeTab : ""}
                onClick={() => setTab("coverage")}
              >
                Data coverage <span>{sources.length}</span>
              </button>
            </div>
            <span className={s.snapshot}>
              <i className={databaseOld ? s.staleDot : s.dot} />
              {data.updatedAt
                ? `Snapshot ${new Date(data.updatedAt).toLocaleString()}`
                : "Awaiting backfill"}
            </span>
          </div>
          <div className={s.filters}>
            <label>
              Chain
              <select
                value={filters.chain}
                onChange={(e) => update("chain", e.target.value)}
              >
                <option value="all">All chains</option>
                {Object.keys(chainNames).map((chain) => (
                  <option key={chain} value={chain}>
                    {chainNames[chain]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              DEX
              <select
                value={filters.dex}
                onChange={(e) => update("dex", e.target.value)}
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
                onChange={(e) => update("version", e.target.value)}
              >
                <option value="all">All versions</option>
                {["v2", "v3", "v4"].map((version) => (
                  <option key={version}>{version}</option>
                ))}
              </select>
            </label>
            {tab === "wallets" && (
              <>
                <label>
                  Last collection
                  <select
                    value={filters.closedDays}
                    onChange={(e) =>
                      update("closedDays", Number(e.target.value))
                    }
                  >
                    <option value={0}>All indexed history</option>
                    <option value={7}>In the last 7 days</option>
                    <option value={30}>In the last 30 days</option>
                    <option value={90}>In the last 90 days</option>
                  </select>
                </label>
                <label>
                  Min. collected fees
                  <input
                    type="number"
                    min="0"
                    step="any"
                    placeholder="USD 0"
                    value={filters.minFees || ""}
                    onChange={(e) =>
                      update(
                        "minFees",
                        Math.max(0, Number(e.target.value) || 0),
                      )
                    }
                  />
                </label>
              </>
            )}
            <button className={s.reset} onClick={reset}>
              Reset filters
            </button>
          </div>
          {tab === "wallets" ? (
            <>
              <div className={s.tableToolbar}>
                <label className={s.search}>
                  <Search size={16} />
                  <input
                    aria-label="Search wallet address"
                    placeholder="Search wallet address"
                    value={filters.search}
                    onChange={(e) => update("search", e.target.value)}
                  />
                </label>
                <span>
                  {rows.length} wallets <span className={s.separator}>/</span>{" "}
                  Collections through each audited cutoff
                </span>
              </div>
              <div className={s.tableScroll}>
                <table className={s.table}>
                  <caption className={s.srOnly}>
                    Wallet rankings by verified collected LP fees
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Rank</th>
                      <th scope="col">Wallet</th>
                      <th scope="col">DEXes / chains</th>
                      <th
                        scope="col"
                        aria-sort={
                          filters.sort === "positions"
                            ? filters.direction === "desc"
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        <button onClick={() => sort("positions")}>
                          Positions {sortIcon("positions")}
                        </button>
                      </th>
                      <th
                        scope="col"
                        aria-sort={
                          filters.sort === "deposits"
                            ? filters.direction === "desc"
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        <button onClick={() => sort("deposits")}>
                          Cumulative deposits {sortIcon("deposits")}
                        </button>
                      </th>
                      <th
                        scope="col"
                        aria-sort={
                          filters.sort === "fees"
                            ? filters.direction === "desc"
                              ? "descending"
                              : "ascending"
                            : "none"
                        }
                      >
                        <button onClick={() => sort("fees")}>
                          Collected fees {sortIcon("fees")}
                        </button>
                      </th>
                      <th scope="col">
                        <span className={s.srOnly}>Position details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {query.isPending
                      ? Array.from({ length: 5 }, (_, i) => (
                          <tr key={i}>
                            <td colSpan={7}>
                              <div className={s.skeleton} />
                            </td>
                          </tr>
                        ))
                      : shown.map((row, index) => (
                          <Fragment key={row.wallet}>
                            <tr
                              className={
                                expanded === row.wallet ? s.selectedRow : ""
                              }
                            >
                              <td>
                                <span className={s.rank}>
                                  {filters.sort === "fees" &&
                                  row.unpricedPositions === row.positions.length
                                    ? "n/a"
                                    : currentPage * pageSize + index + 1}
                                </span>
                              </td>
                              <td>
                                <div className={s.wallet}>
                                  <span
                                    className={s.avatar}
                                    style={{
                                      background: `hsl(${parseInt(row.wallet.slice(2, 6), 16) % 360} 55% 94%)`,
                                      color: `hsl(${parseInt(row.wallet.slice(2, 6), 16) % 360} 45% 38%)`,
                                    }}
                                  >
                                    <Wallet size={17} />
                                  </span>
                                  <div>
                                    <code title={row.wallet}>
                                      {short(row.wallet)}
                                    </code>
                                    <small>Verified position owner</small>
                                  </div>
                                </div>
                              </td>
                              <td>
                                <div className={s.dexes}>
                                  {row.dexes.join(", ")}
                                </div>
                                <div className={s.chains}>
                                  {row.chains.map((chain) => (
                                    <span key={chain}>{chainNames[chain]}</span>
                                  ))}
                                </div>
                              </td>
                              <td>{row.positions.length}</td>
                              <td className={s.numeric}>
                                {money(row.depositUSD)}
                                <small>Not average capital</small>
                              </td>
                              <td className={s.fee}>
                                {money(
                                  row.unpricedPositions === row.positions.length
                                    ? null
                                    : row.feesUSD,
                                )}
                                <small>
                                  {row.unpricedPositions
                                    ? `${row.unpricedPositions} unpriced histories excluded from USD`
                                    : "Principal excluded"}
                                </small>
                              </td>
                              <td>
                                <button
                                  className={s.expand}
                                  aria-label={`View positions for ${short(row.wallet)}`}
                                  aria-expanded={expanded === row.wallet}
                                  onClick={() =>
                                    setExpanded(
                                      expanded === row.wallet
                                        ? null
                                        : row.wallet,
                                    )
                                  }
                                >
                                  <ChevronDown size={16} />
                                </button>
                              </td>
                            </tr>
                            {expanded === row.wallet && (
                              <tr>
                                <td colSpan={7} className={s.detailCell}>
                                  <div className={s.details}>
                                    <h3>Audited position histories</h3>
                                    <p className={s.fullAddress}>
                                      {row.wallet}
                                    </p>
                                    {row.positions.map((position) => {
                                      const source = sources.find(
                                        (source) =>
                                          source.id === position.sourceId,
                                      )!;
                                      return (
                                        <div
                                          key={position.id}
                                          className={s.position}
                                        >
                                          <div>
                                            <strong>{position.pair}</strong>
                                            <p>
                                              {source.dex} {source.version} ·{" "}
                                              {chainNames[source.chain]} · NFT #
                                              {position.tokenId} ·{" "}
                                              {position.closed === false
                                                ? "Open at cutoff"
                                                : "Closed at cutoff"}
                                            </p>
                                            <small>
                                              Opened{" "}
                                              {new Date(
                                                position.openedAt * 1000,
                                              ).toLocaleDateString()}{" "}
                                              · Last collection{" "}
                                              {new Date(
                                                position.closedAt * 1000,
                                              ).toLocaleDateString()}
                                            </small>
                                          </div>
                                          <div>
                                            <strong>
                                              {money(position.feesUSD)}
                                            </strong>
                                            <p>
                                              {position.feesToken0} /{" "}
                                              {position.feesToken1} fee tokens
                                            </p>
                                            <small>
                                              USD price snapshot at block{" "}
                                              {position.valuationBlock.toLocaleString()}
                                              . Audited through block{" "}
                                              {position.auditedThroughBlock.toLocaleString()}
                                              .
                                            </small>
                                          </div>
                                          <a
                                            href={`${explorers[source.chain]}/tx/${position.transaction}`}
                                            target="_blank"
                                            rel="noreferrer"
                                          >
                                            Collection transaction{" "}
                                            <ArrowUpRight size={14} />
                                          </a>
                                        </div>
                                      );
                                    })}
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
                    {data.positions.length
                      ? "No wallets match these filters"
                      : "No verified wallet histories yet"}
                  </h3>
                  <p>
                    {filters.version === "v2" || filters.version === "v4"
                      ? "Wallet fee accounting for this AMM version is not implemented. Pool-level coverage is listed separately."
                      : data.positions.length
                        ? "Try another chain, DEX, or minimum fee."
                        : "Only complete, principal-adjusted histories are eligible. Check source coverage for indexing status."}
                  </p>
                  <button
                    onClick={
                      data.positions.length ? reset : () => setTab("coverage")
                    }
                  >
                    {data.positions.length
                      ? "Clear filters"
                      : "View data coverage"}
                  </button>
                </div>
              )}
              <div className={s.pagination}>
                <span>
                  {rows.length
                    ? `${currentPage * pageSize + 1}–${Math.min((currentPage + 1) * pageSize, rows.length)} of ${rows.length} wallets`
                    : "0 wallets"}
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
                The same standardized AMM query reads LP supply-side revenue
                across DEXes and chains. Pool totals are never substituted for
                wallet earnings. V4 currently uses a separate ownership-only
                schema.
              </p>
              <div className={s.tableScroll}>
                <table className={s.table}>
                  <caption className={s.srOnly}>
                    Subgraph coverage and wallet accounting availability
                  </caption>
                  <thead>
                    <tr>
                      <th>Deployment</th>
                      <th>Index status</th>
                      <th>Pool LP revenue, all time</th>
                      <th>Wallet accounting</th>
                      <th>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCoverage.map((source) => {
                      const status =
                        source.status === "ready" &&
                        source.indexedAt &&
                        now / 1000 - source.indexedAt > 86400
                          ? "stale"
                          : source.status;
                      return (
                        <tr key={source.id}>
                          <td>
                            <strong>
                              {source.dex} {source.version}
                            </strong>
                            <small>
                              {chainNames[source.chain]} ·{" "}
                              {source.schemaVersion
                                ? `Schema ${source.schemaVersion}`
                                : source.schema === "messari"
                                  ? "Schema not verified"
                                  : "Protocol-specific schema"}
                            </small>
                          </td>
                          <td>
                            <span
                              className={`${s.status} ${status === "ready" ? s.ready : status === "stale" ? s.stale : s.unavailable}`}
                            >
                              {status === "ready"
                                ? "Indexed"
                                : status === "stale"
                                  ? "Stale"
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
                            {source.poolFeesUSD === undefined
                              ? "Not available"
                              : compact(source.poolFeesUSD)}
                          </td>
                          <td>
                            <span>{source.walletStatus}</span>
                            <small>
                              {source.verified} verified · {source.candidates}{" "}
                              replay attempts
                              {source.error ? ` · ${source.error}` : ""}
                            </small>
                          </td>
                          <td>
                            <a
                              className={s.sourceLink}
                              href={`https://thegraph.com/explorer/subgraphs/${source.subgraphId}?view=Query&chain=arbitrum-one`}
                              target="_blank"
                              rel="noreferrer"
                              aria-label={`Open ${source.id} subgraph`}
                            >
                              <ArrowUpRight size={17} />
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {!filteredCoverage.length && (
                <div className={s.empty}>
                  No deployments match these filters.
                </div>
              )}
            </div>
          )}
        </section>
        <section className={s.methodology} id="methodology">
          <div>
            <Info size={19} />
            <h2>Read the numbers correctly</h2>
          </div>
          <div className={s.methodGrid}>
            <article>
              <h3>Historical accounting</h3>
              <p>
                We discover v3 positions through Messari&apos;s standardized AMM
                schema and replay NFT mint, transfer, liquidity, and collection
                logs from mint through the last indexed liquidity change.
                Collected token amounts minus withdrawn principal are fees.
                Transferred NFTs and histories with unpaid principal are
                excluded.
              </p>
            </article>
            <article>
              <h3>A sample, not expected income</h3>
              <p>
                The backfill prioritizes high-withdrawal, recently opened
                positions within its RPC budget. Short histories and large
                wallets are overrepresented. It excludes uncollected fees,
                collections after the audited cutoff, gas, impermanent loss,
                incentives, and tax. Deposits may recycle the same capital.
              </p>
            </article>
            <article>
              <h3>Valuation and coverage</h3>
              <p>
                All fee tokens for a position use the subgraph&apos;s token
                prices as of its final indexed collection block, not prices at
                every collection. Date filters select positions by final
                collection date; they do not measure fees generated within that
                period. Missing token prices remain unpriced, never zero
                earnings. V2 and v4 wallet accounting is not implemented.
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
