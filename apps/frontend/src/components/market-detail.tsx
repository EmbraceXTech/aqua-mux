import { useState } from "react"
import {
  ArrowRight,
  Bookmark,
  Check,
  Code2,
  Database,
  Info,
  ShieldAlert,
  Sparkles,
} from "lucide-react"
import {
  average,
  compact,
  percent,
  protocolUrl,
  SNAPSHOT,
} from "@/lib/demo-data"
import type { Market } from "@/lib/demo-data"
import { useWorkspace } from "@/lib/workspace"
import {
  ChainBadge,
  ExternalLink,
  Modal,
  ProtocolIcon,
  SampleBadge,
  TokenIcon,
} from "./primitives"
import { YieldChart } from "./yield-chart"

export function MarketDetail({
  market,
  onClose,
  onAction,
  onResearch,
}: {
  market: Market
  onClose: () => void
  onAction: (market: Market) => void
  onResearch: (prompt: string) => void
}) {
  const [tab, setTab] = useState("Overview")
  const { state, toggleSaved, toast } = useWorkspace()
  const query =
    market.kind === "lending"
      ? `# Illustrative query. This prototype does not query a subgraph.\nquery SupplyHistory {\n  market(id: "${market.id}") {\n    name\n    dailySnapshots(first: 7, orderBy: timestamp,\n      orderDirection: desc) {\n      timestamp\n      rates { rate side type }\n      totalDepositBalanceUSD\n      totalBorrowBalanceUSD\n    }\n  }\n}`
      : `# Illustrative query. Schema varies by deployment.\nquery PoolResearch {\n  pool(id: "${market.id}") {\n    token0 { symbol }\n    token1 { symbol }\n    feeTier\n    totalValueLockedUSD\n    poolDayData(first: 3) {\n      date\n      volumeUSD\n      feesUSD\n    }\n  }\n}`
  return (
    <Modal
      title="A closer look"
      eyebrow="Market details"
      onClose={onClose}
      wide
    >
      <div className="market-detail-content">
        <div className="detail-market-heading">
          <div className="row">
            <TokenIcon asset={market.asset} />
            <div>
              <h3>{market.asset}</h3>
              <span className="row small muted">
                <ProtocolIcon protocol={market.protocol} small />
                {market.protocol}
                <ChainBadge chain={market.chain} />
              </span>
            </div>
          </div>
          <button
            className={`btn btn-secondary ${state.saved.includes(market.id) ? "saved" : ""}`}
            onClick={() => toggleSaved(market.id)}
          >
            <Bookmark
              size={15}
              fill={state.saved.includes(market.id) ? "currentColor" : "none"}
            />
            {state.saved.includes(market.id) ? "Saved" : "Save market"}
          </button>
        </div>
        <div className="detail-hero">
          <div>
            <span className="small muted">
              {market.kind === "lending"
                ? "Current supply APY"
                : "Trading fees over 3 days"}
            </span>
            <div className="detail-hero-value">
              {market.kind === "lending"
                ? percent(market.apy)
                : compact(market.fees ?? 0)}
            </div>
            <span className="small muted">
              {market.kind === "lending"
                ? "Variable rate. Incentives excluded."
                : "Fees are not net returns. Incentives excluded."}
            </span>
          </div>
          <SampleBadge />
        </div>
        <div className="detail-stats">
          <div>
            <span>
              {market.kind === "lending"
                ? "7d average APY"
                : "Trading volume / 3d"}
            </span>
            <strong>
              {market.kind === "lending"
                ? percent(average(market.history))
                : compact(market.volume ?? 0)}
            </strong>
          </div>
          <div>
            <span>Available liquidity</span>
            <strong>{compact(market.liquidity)}</strong>
          </div>
          <div>
            <span>
              {market.kind === "lending" ? "Utilization" : "Fee tier"}
            </span>
            <strong>
              {market.kind === "lending"
                ? percent(market.utilization)
                : market.feeTier}
            </strong>
          </div>
        </div>
        <div className="detail-tabs" role="tablist" aria-label="Market details">
          {["Overview", "Evidence", "Risks"].map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={tab === item}
              className={tab === item ? "active" : ""}
              onClick={() => setTab(item)}
            >
              {item}
            </button>
          ))}
        </div>
        {tab === "Overview" && (
          <div className="detail-tab-content">
            {market.kind === "lending" ? (
              <YieldChart items={[market]} />
            ) : (
              <div className="callout">
                <Info size={18} />
                <div>
                  <strong>
                    High fees don't guarantee a profitable position
                  </strong>
                  <p>
                    Your fee share depends on the range you select and the time
                    your position stays in range. Asset prices and impermanent
                    loss can outweigh fees.
                  </p>
                </div>
              </div>
            )}
            <div className="detail-observation">
              <Database size={15} />
              <p>
                Sample observation for {SNAPSHOT}.{" "}
                {market.kind === "lending"
                  ? "Seven daily observations, Aug 30 to Sep 5."
                  : "Three daily observations, Sep 3 to Sep 5."}{" "}
                No live data was fetched.
              </p>
            </div>
          </div>
        )}
        {tab === "Evidence" && (
          <div className="detail-tab-content evidence-content">
            <div className="row">
              <Database size={17} />
              <h3>Source and method</h3>
            </div>
            <p>
              These are illustrative {market.protocol} observations on{" "}
              {market.chain}, shaped like normalized public protocol data. They
              are not a verified live response.
            </p>
            <dl className="definition-list">
              <div>
                <dt>Asset</dt>
                <dd>{market.asset}</dd>
              </div>
              <div>
                <dt>Observed</dt>
                <dd>{SNAPSHOT}</dd>
              </div>
              <div>
                <dt>Comparison method</dt>
                <dd>
                  {market.kind === "lending"
                    ? "Arithmetic mean of 7 daily APY observations"
                    : "Sum of 3 daily trading-fee observations"}
                </dd>
              </div>
              <div>
                <dt>Incentive rewards</dt>
                <dd>Excluded</dd>
              </div>
            </dl>
            <details className="query-details">
              <summary>
                <Code2 size={15} />
                Inspect illustrative query
              </summary>
              <pre>
                <code>{query}</code>
              </pre>
              <button
                className="text-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(query)
                    toast("Illustrative query copied")
                  } catch {
                    toast("Copy unavailable. Select the query text to copy it.")
                  }
                }}
              >
                Copy query
              </button>
            </details>
            <ExternalLink href={protocolUrl(market.protocol)}>
              Visit {market.protocol}
            </ExternalLink>
          </div>
        )}
        {tab === "Risks" && (
          <div className="detail-tab-content">
            <div className="callout callout-warning">
              <ShieldAlert size={20} />
              <div>
                <strong>
                  {market.risk === "Elevated"
                    ? "Additional strategy risks apply"
                    : "Established protocols still carry risk"}
                </strong>
                <p>
                  No supply position or liquidity pool is risk-free. These are
                  research inputs, not financial advice.
                </p>
              </div>
            </div>
            <ul className="risk-list">
              <li>
                <strong>Smart-contract risk</strong>
                <p>
                  Code failures or an exploit can cause a partial or total loss
                  of funds.
                </p>
              </li>
              <li>
                <strong>
                  {market.kind === "pool"
                    ? "Impermanent loss and price range"
                    : "Variable rates and withdrawals"}
                </strong>
                <p>
                  {market.kind === "pool"
                    ? "Price divergence can reduce your value relative to holding the assets. Out-of-range positions stop earning trading fees."
                    : "Supply APY changes with borrowing demand. High utilization can reduce immediately available withdrawal liquidity."}
                </p>
              </li>
              <li>
                <strong>Asset and network risk</strong>
                <p>
                  Stablecoins can lose their peg. Bridges, sequencers, and
                  network congestion introduce separate risks.
                </p>
              </li>
              {market.protocol === "Morpho" && (
                <li>
                  <strong>Vault and curator exposure</strong>
                  <p>
                    Different collateral markets, oracles, and curator decisions
                    mean this market is not a like-for-like Aave alternative.
                  </p>
                </li>
              )}
            </ul>
          </div>
        )}
        <div className="detail-actions">
          {market.executable ? (
            <button
              className="btn btn-primary"
              onClick={() => onAction(market)}
            >
              Supply {market.asset}
              <ArrowRight size={16} />
            </button>
          ) : (
            <span className="small muted">
              <Info size={13} />
              Research only. Execution is not supported in this demo.
            </span>
          )}
          <button
            className="btn btn-secondary"
            onClick={() =>
              onResearch(
                `Research ${market.asset} on ${market.protocol} ${market.chain}. Compare its recent ${market.kind === "pool" ? "fees and liquidity" : "supply APY"} and explain the material risks.`
              )
            }
          >
            <Sparkles size={15} />
            Ask about this market
          </button>
        </div>
        <p className="detail-footnote">
          <Check size={12} />
          Any next step requires your separate confirmation. All transactions
          here are simulated.
        </p>
      </div>
    </Modal>
  )
}
