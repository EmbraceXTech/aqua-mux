import { useEffect, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  Coins,
  Compass,
  Database,
  ExternalLink as LinkIcon,
  Info,
  Layers,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TrendingUp,
  Waves,
  X,
} from "lucide-react"
import { average, compact, markets, percent, starters } from "@/lib/demo-data"
import type { Market } from "@/lib/demo-data"
import { useWorkspace } from "@/lib/workspace"
import {
  ChainBadge,
  EmptyState,
  ProtocolIcon,
  SampleBadge,
  TokenIcon,
} from "./primitives"
import { ResearchComposer } from "./research-composer"

type Props = {
  draft: string
  onDraftChange: (value: string) => void
  onSend: () => void
  onAccess: () => void
  includeContext: boolean
  onContextChange: (value: boolean) => void
  onInspect: (market: Market) => void
  onPrompt: (prompt: string) => void
  savedOnly?: boolean
}
export function Discover({
  draft,
  onDraftChange,
  onSend,
  onAccess,
  includeContext,
  onContextChange,
  onInspect,
  onPrompt,
  savedOnly,
}: Props) {
  const { state, toggleSaved, toast } = useWorkspace()
  const [kind, setKind] = useState("lending")
  const [chain, setChain] = useState("All networks")
  const [asset, setAsset] = useState("All assets")
  const [search, setSearch] = useState("")
  const [sort, setSort] = useState("liquidity")
  const [showAll, setShowAll] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [liquidOnly, setLiquidOnly] = useState(false)
  const [executableOnly, setExecutableOnly] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [stale, setStale] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined
  )
  useEffect(() => () => clearTimeout(refreshTimer.current), [])
  const visible = markets
    .filter(
      (market) =>
        (savedOnly ? state.saved.includes(market.id) : true) &&
        market.kind === kind &&
        (chain === "All networks" || market.chain === chain) &&
        (asset === "All assets" || market.asset.includes(asset)) &&
        `${market.asset} ${market.protocol}`
          .toLowerCase()
          .includes(search.toLowerCase()) &&
        (!liquidOnly || market.liquidity >= 25000000) &&
        (!executableOnly || market.executable)
    )
    .sort((a, b) =>
      sort === "apy"
        ? b.apy - a.apy
        : sort === "average"
          ? average(b.history) - average(a.history)
          : sort === "fees"
            ? (b.fees ?? 0) - (a.fees ?? 0)
            : a.id === "aave-base"
              ? -1
              : b.id === "aave-base"
                ? 1
                : b.liquidity - a.liquidity
    )
  const rows = showAll ? visible : visible.slice(0, 5)
  const filterCount = [
    chain !== "All networks",
    asset !== "All assets",
    liquidOnly,
    executableOnly,
  ].filter(Boolean).length
  const reset = () => {
    setChain("All networks")
    setAsset("All assets")
    setSearch("")
    setLiquidOnly(false)
    setExecutableOnly(false)
  }
  const refresh = () => {
    setRefreshing(true)
    refreshTimer.current = setTimeout(() => {
      setRefreshing(false)
      setStale(false)
      toast("Sample snapshot refreshed. No live data was fetched.")
    }, 1000)
  }
  return (
    <div className="discover-page page-enter">
      {!savedOnly ? (
        <>
          <section className="discovery-intro">
            <div className="intro-copy">
              <div className="eyebrow">
                <Compass size={12} aria-hidden="true" /> A clearer view of DeFi
              </div>
              <h1>What would you like to understand?</h1>
              <p>
                Your next move starts with a good question. Let's follow the
                evidence.
              </p>
            </div>
            <div className="intro-illustration" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="orbit orbit-three" />
              <span className="orbit-center">
                <Compass size={30} strokeWidth={1.3} />
              </span>
              <span className="orbit-point p1" />
              <span className="orbit-point p2" />
              <span className="orbit-point p3" />
            </div>
          </section>
          <ResearchComposer
            draft={draft}
            onDraftChange={onDraftChange}
            onSend={onSend}
            onAccess={onAccess}
            includeContext={includeContext}
            onContextChange={onContextChange}
          />
          <div className="starter-grid">
            {starters.map((starter, index) => (
              <button
                className="starter-card"
                key={starter.title}
                onClick={() => onPrompt(starter.text)}
              >
                <span className={`starter-icon starter-icon-${index}`}>
                  {index === 0 ? (
                    <Coins size={19} />
                  ) : index === 1 ? (
                    <Waves size={19} />
                  ) : (
                    <SlidersHorizontal size={19} />
                  )}
                </span>
                <span className="starter-copy">
                  <span className="starter-tag">{starter.tag}</span>
                  <strong>{starter.title}</strong>
                </span>
                <ArrowUpRight size={16} />
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="page-heading">
          <span className="eyebrow">Your shortlist</span>
          <h1 className="page-title">Saved opportunities</h1>
          <p>
            Good research is worth keeping. Revisit your markets and compare
            what changed.
          </p>
        </div>
      )}

      <div className="discovery-grid">
        <section className="markets-section">
          <div className="section-heading">
            <div>
              <h2>{savedOnly ? "Your watchlist" : "Explore opportunities"}</h2>
              <p>Start with the numbers. Stay for the context.</p>
            </div>
            <SampleBadge />
          </div>
          <div
            className="market-tabs"
            role="tablist"
            aria-label="Opportunity type"
          >
            <button
              role="tab"
              aria-selected={kind === "lending"}
              className={kind === "lending" ? "active" : ""}
              onClick={() => {
                setKind("lending")
                setSort("liquidity")
                setAsset("All assets")
              }}
            >
              <Coins size={16} />
              Lending markets
              <span>
                {
                  markets.filter(
                    (m) =>
                      m.kind === "lending" &&
                      (!savedOnly || state.saved.includes(m.id))
                  ).length
                }
              </span>
            </button>
            <button
              role="tab"
              aria-selected={kind === "pool"}
              className={kind === "pool" ? "active" : ""}
              onClick={() => {
                setKind("pool")
                setSort("fees")
                setAsset("All assets")
              }}
            >
              <Waves size={16} />
              Liquidity pools
              <span>
                {
                  markets.filter(
                    (m) =>
                      m.kind === "pool" &&
                      (!savedOnly || state.saved.includes(m.id))
                  ).length
                }
              </span>
            </button>
          </div>
          <div className="market-filter-row">
            <label className="select-control">
              <Layers size={13} />
              <select
                aria-label="Filter by network"
                value={chain}
                onChange={(event) => setChain(event.target.value)}
              >
                <option>All networks</option>
                <option>Ethereum</option>
                <option>Base</option>
                <option>Arbitrum</option>
              </select>
              <ChevronDown size={12} />
            </label>
            <label className="select-control">
              <select
                aria-label="Filter by asset"
                value={asset}
                onChange={(event) => setAsset(event.target.value)}
              >
                <option>All assets</option>
                <option>USDC</option>
                <option>USDT</option>
                {kind === "pool" && <option>ETH</option>}
              </select>
              <ChevronDown size={12} />
            </label>
            <button
              className={`filter-button ${filterCount ? "selected" : ""}`}
              onClick={() => setFiltersOpen(!filtersOpen)}
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal size={14} />
              Filters{filterCount > 0 && <span>{filterCount}</span>}
            </button>
            <div className="filter-spacer" />
            <label className="market-search">
              <Search size={14} />
              <input
                aria-label="Search markets"
                placeholder="Search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              {search && (
                <button aria-label="Clear search" onClick={() => setSearch("")}>
                  <X size={12} />
                </button>
              )}
            </label>
          </div>
          {filtersOpen && (
            <div className="advanced-filters">
              <label>
                <input
                  type="checkbox"
                  checked={liquidOnly}
                  onChange={(event) => setLiquidOnly(event.target.checked)}
                />
                At least $25M liquidity
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={executableOnly}
                  onChange={(event) => setExecutableOnly(event.target.checked)}
                />
                Demo execution available
              </label>
              <button className="text-button" onClick={reset}>
                Reset filters
              </button>
            </div>
          )}
          {stale && (
            <div className="callout callout-warning stale-note">
              <Info size={16} />
              <span>
                This preview is showing stale data. Refresh the sample snapshot
                before comparing.
              </span>
              <button className="text-button" onClick={refresh}>
                Refresh
              </button>
            </div>
          )}
          <div
            className={`market-table-container ${refreshing ? "is-refreshing" : ""}`}
            aria-busy={refreshing}
          >
            {rows.length ? (
              <div className="table-scroll">
                <table className="market-table">
                  <thead>
                    <tr>
                      <th>Market</th>
                      <th className="align-right">
                        <button
                          onClick={() =>
                            setSort(
                              kind === "lending"
                                ? sort === "apy"
                                  ? "average"
                                  : "apy"
                                : "fees"
                            )
                          }
                        >
                          {kind === "lending"
                            ? sort === "average"
                              ? "7d avg. APY"
                              : "Supply APY"
                            : "Fees / 3d"}
                          <ArrowDown size={11} />
                        </button>
                      </th>
                      <th className="align-right">
                        {kind === "lending" ? "7d change" : "Volume / 3d"}
                      </th>
                      <th className="align-right">
                        {kind === "lending" ? "Liquidity" : "TVL"}
                      </th>
                      <th>Network</th>
                      <th>
                        <span className="sr-only">Save or inspect</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((market) => (
                      <tr key={market.id} onClick={() => onInspect(market)}>
                        <td>
                          <button
                            className="market-name"
                            onClick={(event) => {
                              event.stopPropagation()
                              onInspect(market)
                            }}
                          >
                            <span className="market-token">
                              <TokenIcon asset={market.asset} />
                              <span className="protocol-overlay">
                                <ProtocolIcon
                                  protocol={market.protocol}
                                  small
                                />
                              </span>
                            </span>
                            <span>
                              <strong>{market.asset}</strong>
                              <span>
                                {market.protocol}
                                {market.feeTier && ` / ${market.feeTier}`}
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="align-right market-apy">
                          {kind === "lending"
                            ? percent(
                                sort === "average"
                                  ? average(market.history)
                                  : market.apy
                              )
                            : compact(market.fees ?? 0)}
                        </td>
                        <td
                          className={`align-right ${kind === "lending" ? (market.change >= 0 ? "positive" : "muted") : ""}`}
                        >
                          {kind === "lending"
                            ? `${market.change > 0 ? "+" : ""}${market.change.toFixed(2)} pp`
                            : compact(market.volume ?? 0)}
                        </td>
                        <td className="align-right">
                          {compact(market.liquidity)}
                        </td>
                        <td>
                          <ChainBadge chain={market.chain} />
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              className={`icon-button save-button ${state.saved.includes(market.id) ? "saved" : ""}`}
                              aria-label={`${state.saved.includes(market.id) ? "Unsave" : "Save"} ${market.protocol} ${market.asset} on ${market.chain}`}
                              aria-pressed={state.saved.includes(market.id)}
                              onClick={(event) => {
                                event.stopPropagation()
                                toggleSaved(market.id)
                              }}
                            >
                              <Bookmark
                                size={15}
                                fill={
                                  state.saved.includes(market.id)
                                    ? "currentColor"
                                    : "none"
                                }
                              />
                            </button>
                            <ArrowUpRight size={15} className="row-arrow" />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={
                  savedOnly && !state.saved.length ? (
                    <Bookmark size={25} />
                  ) : (
                    <Search size={25} />
                  )
                }
                title={
                  savedOnly && !state.saved.length
                    ? "A home for your next move"
                    : "No markets match these filters"
                }
                text={
                  savedOnly && !state.saved.length
                    ? "Tap the bookmark beside a market to keep it here for later."
                    : "Try another asset or network. This demo covers a defined set of markets."
                }
                action={
                  !savedOnly || state.saved.length ? (
                    <button className="btn btn-secondary" onClick={reset}>
                      Reset filters
                    </button>
                  ) : undefined
                }
              />
            )}
          </div>
          <div className="table-footer">
            <span>
              <Database size={12} />
              {visible.length} {kind === "pool" ? "pools" : "markets"} in this
              sample
            </span>
            {visible.length > 5 && (
              <button
                className="text-button"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll ? "Show less" : `View all ${visible.length} markets`}
                <ArrowRight size={13} />
              </button>
            )}
            <button
              className="refresh-button"
              aria-label="Refresh sample data"
              disabled={refreshing}
              onClick={refresh}
            >
              <RefreshCw size={12} className={refreshing ? "spin" : ""} />
              {refreshing ? "Refreshing" : "Sep 5, 12:00 UTC"}
            </button>
          </div>
          <div className="market-disclaimer">
            <Info size={13} />
            <p>
              {kind === "lending"
                ? "APYs are variable, exclude incentives, and are not guaranteed returns. 7d change is in percentage points."
                : "Trading fees are not net returns. These figures exclude incentives, gas costs, and impermanent loss."}
            </p>
          </div>
          <details className="coverage-details">
            <summary>
              <span>
                <ShieldCheck size={13} />
                Know what you're comparing
              </span>
              <ChevronDown size={13} />
            </summary>
            <p>
              Illustrative snapshots for Aave V3, Morpho, Compound V3, and
              Uniswap V3 on Ethereum, Base, and Arbitrum. No live queries run in
              this prototype. Seven-day averages use one observation per day,
              Aug 30 to Sep 5, 2026. Markets without seven observations are
              excluded from period comparisons.
            </p>
            <div className="row">
              <button className="text-button" onClick={() => setStale(!stale)}>
                {stale
                  ? "Hide stale-data preview"
                  : "Preview stale-data warning"}
              </button>
              <a
                className="text-button"
                href="https://thegraph.com"
                target="_blank"
                rel="noreferrer"
              >
                About the data source
                <LinkIcon size={12} />
              </a>
            </div>
          </details>
        </section>
        <aside className="discovery-aside">
          <div className="aside-heading">
            <span className="radar-dot" />
            <h2>On the radar</h2>
            <span className="small muted">Sample insights</span>
          </div>
          <div className="radar-card">
            <div className="row radar-label">
              <TrendingUp size={16} />
              <span>A rate worth a closer look</span>
            </div>
            <div className="radar-value">
              <span>
                6.84<span>%</span>
              </span>
              <span className="delta-badge">+0.92 pp</span>
            </div>
            <p>
              USDC supply APY on Aave Base is up this week. What's behind the
              move?
            </p>
            <div className="radar-meta">
              <ProtocolIcon protocol="Aave V3" small />
              <span>Aave V3</span>
              <span className="radar-separator" />
              <ChainBadge chain="Base" />
            </div>
            <button
              className="radar-action"
              onClick={() =>
                onPrompt(
                  "Why did the USDC supply APY on Aave V3 Base change over the last seven days? Compare utilization and available liquidity."
                )
              }
            >
              Investigate with the agent
              <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="field-note">
            <span className="eyebrow">
              <Waves size={13} /> Field notes
            </span>
            <h3>
              Fees tell a story.
              <br />
              They don't tell it all.
            </h3>
            <p>
              A busy pool can earn more fees and still lose value. Compare
              volume, depth, and impermanent loss together.
            </p>
            <button
              className="text-button"
              onClick={() =>
                onPrompt(
                  "Explain the tradeoffs of providing ETH / USDC liquidity on Uniswap V3 compared with supplying USDC on Aave."
                )
              }
            >
              Explore the tradeoffs
              <ArrowRight size={14} />
            </button>
            <div className="field-note-art" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
          <div className="trust-note">
            <span className="trust-icon">
              <ShieldCheck size={20} />
            </span>
            <div>
              <strong>Research freely. Act deliberately.</strong>
              <p>The agent can prepare a next step. Only you can confirm it.</p>
            </div>
          </div>
        </aside>
      </div>
      <div className="discovery-bottom">
        <span>
          <Check size={12} />
          No private keys. No automatic trades.
        </span>
        <span>Built for the questions behind the numbers.</span>
      </div>
    </div>
  )
}
