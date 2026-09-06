import { useState } from "react"
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Code2,
  Copy,
  Database,
  FileText,
  Info,
  Layers,
  LoaderCircle,
  LockKeyhole,
  MessageSquarePlus,
  Paperclip,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Wallet,
} from "lucide-react"
import {
  average,
  compact,
  marketById,
  markets,
  money,
  percent,
  protocolUrl,
  SNAPSHOT,
  starters,
} from "@/lib/demo-data"
import type { Market } from "@/lib/demo-data"
import { useWorkspace } from "@/lib/workspace"
import type { ResearchMessage, Thread } from "@/lib/workspace"
import {
  BrandMark,
  ChainBadge,
  ExternalLink,
  Modal,
  ProtocolIcon,
  SampleBadge,
  TokenIcon,
} from "./primitives"
import { ResearchComposer } from "./research-composer"
import { YieldChart } from "./yield-chart"

type Props = {
  thread: Thread | null
  draft: string
  onDraftChange: (draft: string) => void
  onSend: () => void
  onAccess: () => void
  onStop: () => void
  onNew: () => void
  includeContext: boolean
  onContextChange: (include: boolean) => void
  busy: boolean
  stage: number
  runningId?: string
  onInspect: (market: Market) => void
  onAction: (market: Market, kind?: "supply" | "withdraw" | "swap") => void
  onPrompt: (prompt: string) => void
}
const steps = [
  "Understanding your question",
  "Reading protocol observations",
  "Comparing like-for-like data",
  "Checking constraints and risks",
  "Putting the evidence together",
]

function Evidence({
  message,
  onClose,
}: {
  message: ResearchMessage
  onClose: () => void
}) {
  const candidates = message.marketIds
    .map(marketById)
    .filter((market): market is Market => !!market)
  return (
    <Modal
      title="The evidence behind the answer"
      eyebrow="Research notebook"
      onClose={onClose}
      wide
    >
      <div className="evidence-modal">
        <SampleBadge />
        <p>
          This prototype uses a local, fixed dataset. The sources below describe
          the intended integrations, not live queries executed for this answer.
        </p>
        <dl className="definition-list">
          <div>
            <dt>Observed</dt>
            <dd>{SNAPSHOT}</dd>
          </div>
          <div>
            <dt>Observation window</dt>
            <dd>
              {message.kind === "pool"
                ? "Sep 3 to Sep 5, 2026"
                : "Aug 30 to Sep 5, 2026"}
            </dd>
          </div>
          <div>
            <dt>Method</dt>
            <dd>
              {message.kind === "pool"
                ? "Sum of trading fees across 3 daily snapshots"
                : "Arithmetic mean of 7 daily supply APY observations"}
            </dd>
          </div>
          <div>
            <dt>Incentives</dt>
            <dd>Excluded from every result</dd>
          </div>
          <div>
            <dt>Coverage</dt>
            <dd>{candidates.length} comparable sample markets</dd>
          </div>
        </dl>
        <h3>Source references</h3>
        <div className="source-reference">
          <span className="source-number">1</span>
          <div>
            <strong>The Graph protocol subgraphs</strong>
            <p>
              Intended source for normalized public market observations.
              Illustrative data only.
            </p>
            <ExternalLink href="https://thegraph.com/explorer">
              Explore The Graph
            </ExternalLink>
          </div>
        </div>
        {[...new Set(candidates.map((item) => item.protocol))].map(
          (protocol, index) => (
            <div className="source-reference" key={protocol}>
              <span className="source-number">{index + 2}</span>
              <div>
                <strong>{protocol} documentation</strong>
                <p>
                  Protocol mechanics, supported assets, and market-specific
                  risks.
                </p>
                <ExternalLink href={protocolUrl(protocol)}>
                  Visit {protocol}
                </ExternalLink>
              </div>
            </div>
          )
        )}
        <details className="query-details">
          <summary>
            <Code2 size={15} />
            Inspect the calculation
          </summary>
          <pre>
            <code>
              {message.kind === "pool"
                ? "periodFees = sum(dailyTradingFeesUSD)\nperiodVolume = sum(dailyVolumeUSD)\n// Fees do not include incentives.\n// Fees are not net returns or LP-specific returns."
                : "window = 2026-08-30 to 2026-09-05\nobservations = 7 daily supply APY snapshots\nperiodAPY = sum(observations) / 7\n// Arithmetic mean of quoted APYs, not realized return.\n// Exclude incentives and incomplete histories.\n// Compare the same asset; disclose protocol differences."}
            </code>
          </pre>
        </details>
        <div className="callout">
          <Info size={17} />
          <p>
            Sample data cannot establish that an investment is best or safe.
            Live rates, gas costs, vault exposure, and withdrawal conditions may
            differ.
          </p>
        </div>
      </div>
    </Modal>
  )
}

function ResearchResult({
  message,
  onInspect,
  onAction,
  onPrompt,
}: {
  message: ResearchMessage
  onInspect: Props["onInspect"]
  onAction: Props["onAction"]
  onPrompt: Props["onPrompt"]
}) {
  const { toast } = useWorkspace()
  const [evidence, setEvidence] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const candidates = message.marketIds
    .map(marketById)
    .filter((item): item is Market => !!item)
  const leading = candidates[0]
  const executable = candidates.find((item) => item.executable)
  const aaveMarkets = candidates.filter((item) => item.protocol === "Aave V3")
  const chartMarkets = aaveMarkets.length
    ? aaveMarkets.slice(0, 3)
    : candidates.slice(0, 1)
  const isPool = message.kind === "pool"
  const queryTitle = isPool
    ? "Follow the fees. Keep the risks in view."
    : candidates.length === 1
      ? `A closer look at ${leading?.protocol} on ${leading?.chain}`
      : "The rate is a starting point, not the whole story."
  const copyResult = async () => {
    try {
      await navigator.clipboard.writeText(
        `Cool Bar sample research\n${message.prompt}\n${SNAPSHOT}\n${candidates.map((item) => `${item.protocol} / ${item.asset} / ${item.chain}: ${isPool ? compact(item.fees ?? 0) + " fees over 3d" : percent(average(item.history)) + " 7d average APY"}`).join("\n")}\nSample data only. Not financial advice.`
      )
      toast("Research summary copied")
    } catch {
      toast("Clipboard access unavailable in this browser")
    }
  }
  const showMarketResult =
    (message.kind === "lending" || isPool) && candidates.length > 0
  return (
    <div className="research-answer">
      <div className="answer-byline">
        <BrandMark small />
        <strong>Cool Bar</strong>
        <span className="agent-badge">Research agent</span>
        <span className="answer-complete">
          <CheckCheck size={13} />
          Research complete
        </span>
      </div>
      {showMarketResult && (
        <>
          <h2 className="answer-title">{queryTitle}</h2>
          <p className="answer-lead">
            {isPool ? (
              <>
                <strong>
                  {leading.protocol} {leading.asset} on {leading.chain}
                </strong>{" "}
                generated the most trading fees in this sample, at{" "}
                <strong>{compact(leading.fees ?? 0)}</strong> over three days.
                That describes pool activity, not the return a liquidity
                provider would earn.{" "}
              </>
            ) : (
              <>
                <strong>
                  {leading.protocol} on {leading.chain}
                </strong>{" "}
                has the highest seven-day average supply APY among these{" "}
                {candidates.length} comparable {leading.asset} markets, at{" "}
                <strong>{percent(average(leading.history))}</strong>.{" "}
                {leading.protocol === "Morpho"
                  ? "It also introduces different vault and curator exposure, so the extra yield is not a free upgrade."
                  : "The current rate is different from the period average, and both can change."}{" "}
              </>
            )}
            <button
              className="citation"
              onClick={() => setEvidence(true)}
              aria-label="Open source 1"
            >
              1
            </button>
          </p>
          <div className="answer-constraints">
            <span>
              <Layers size={12} />
              {[...new Set(candidates.map((item) => item.chain))].join(", ")}
            </span>
            <span>
              <Clock3 size={12} />
              {isPool ? "Sep 3 to Sep 5" : "Aug 30 to Sep 5"}
            </span>
            <span>
              <Check size={12} />
              No incentives
            </span>
          </div>
          <div className="result-table-heading">
            <h3>
              {isPool ? "Trading fee comparison" : "A like-for-like comparison"}
            </h3>
            <SampleBadge />
          </div>
          <div className="table-scroll result-table-wrap">
            <table className="result-table">
              <thead>
                <tr>
                  <th>Market / network</th>
                  <th className="align-right">
                    {isPool ? "Fees / 3d" : "7d avg. APY"}
                  </th>
                  <th className="align-right">
                    {isPool ? "Volume / 3d" : "Current APY"}
                  </th>
                  <th className="align-right">
                    {isPool ? "TVL" : "Liquidity"}
                  </th>
                  <th>
                    <span className="sr-only">Details</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {candidates.map((market, index) => (
                  <tr key={market.id}>
                    <td>
                      <button
                        className="result-market"
                        onClick={() => onInspect(market)}
                      >
                        <span className="rank">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <ProtocolIcon protocol={market.protocol} small />
                        <span>
                          <strong>
                            {market.protocol}
                            {isPool ? ` / ${market.asset}` : ""}
                          </strong>
                          <ChainBadge chain={market.chain} />
                        </span>
                      </button>
                    </td>
                    <td className="align-right">
                      <strong>
                        {isPool
                          ? compact(market.fees ?? 0)
                          : percent(average(market.history))}
                      </strong>
                    </td>
                    <td className="align-right">
                      {isPool
                        ? compact(market.volume ?? 0)
                        : percent(market.apy)}
                    </td>
                    <td className="align-right">{compact(market.liquidity)}</td>
                    <td>
                      <button
                        className="icon-button"
                        onClick={() => onInspect(market)}
                        aria-label={`Inspect ${market.protocol} on ${market.chain}`}
                      >
                        <ArrowUpRight size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="table-method">
            {isPool
              ? "Sum of three daily fee observations. Trading fees exclude incentives, gas, and impermanent loss."
              : "Arithmetic mean of seven daily APY observations. This is not a realized seven-day return."}
          </p>
          {!isPool && candidates.length > 1 && (
            <YieldChart
              items={chartMarkets}
              title={
                aaveMarkets.length
                  ? "How Aave's sample rates moved"
                  : `How ${chartMarkets[0].protocol}'s sample rate moved`
              }
            />
          )}
          <div className="takeaway">
            <span>
              <BookOpen size={19} />
            </span>
            <div>
              <h3>What I'd look at next</h3>
              <p>
                {isPool
                  ? "Choose a price range and compare fee income with a hold-only baseline. A pool with more total fees may have more liquidity competing for them, and an out-of-range position earns no fees."
                  : leading.protocol === "Morpho"
                    ? `Aave on ${executable?.chain ?? "Base"} is worth comparing if you prefer a direct supply market. Check the marginal yield against collateral exposure, withdrawal liquidity, and the cost of changing networks.`
                    : `Before moving funds to ${leading.chain}, compare any bridging cost with the expected yield difference. At small balances, transaction costs can outweigh weeks of extra yield.`}
              </p>
            </div>
          </div>
          <details className="answer-caveats">
            <summary>
              <ShieldCheck size={15} />
              Assumptions and material risks
              <ChevronDown size={14} />
            </summary>
            <ul>
              <li>
                All figures come from a fixed sample observed on {SNAPSHOT}. No
                live query ran.
              </li>
              <li>
                {isPool
                  ? "Trading fees are a pool-level total. Individual returns depend on range, position size, asset prices, and time in range."
                  : "Each period average includes seven daily observations. Markets with incomplete history are excluded; a daily sample can miss intraday changes."}
              </li>
              <li>
                These candidates share the requested asset, but protocols and
                collateral exposure differ. A higher quoted APY does not
                establish a safer or better investment.
              </li>
              <li>
                Smart-contract failure, stablecoin depegging, network
                interruptions, and{" "}
                {isPool ? "impermanent loss" : "withdrawal liquidity"} remain
                material risks.
              </li>
            </ul>
          </details>
          {executable && !isPool && (
            <div className="research-action-card">
              <div className="action-card-eyebrow">
                <Sparkles size={13} />
                An optional next step
              </div>
              <div className="action-card-main">
                <TokenIcon asset={executable.asset} />
                <div>
                  <h3>
                    Supply {executable.asset} on {executable.protocol}
                  </h3>
                  <span>
                    <ChainBadge chain={executable.chain} />
                    <span>{percent(executable.apy)} current APY</span>
                  </span>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => onAction(executable)}
                >
                  Review supply
                  <ArrowRight size={15} />
                </button>
              </div>
              <p>
                <LockKeyhole size={12} />
                Nothing moves until you confirm. This transaction is simulated.
              </p>
            </div>
          )}
        </>
      )}
      {message.kind === "portfolio" && (
        <>
          <h2 className="answer-title">
            {message.context && message.positions?.length
              ? "Your positions, with the context that matters."
              : "Your portfolio is still yours to share."}
          </h2>
          {message.context && message.positions?.length ? (
            <>
              <p className="answer-lead">
                You attached {message.positions.length} locally tracked position
                {message.positions.length === 1 ? "" : "s"}, totaling{" "}
                <strong>
                  {money(
                    message.positions.reduce(
                      (sum, position) => sum + position.amount,
                      0
                    )
                  )}
                </strong>{" "}
                in sample stablecoins. I only used the positions attached to
                this request.
              </p>
              <div className="portfolio-result-list">
                {message.positions.map((position) => {
                  const market = marketById(position.marketId)
                  if (!market) return null
                  return (
                    <button key={position.id} onClick={() => onInspect(market)}>
                      <TokenIcon asset={market.asset} />
                      <span>
                        <strong>
                          {market.protocol} on {market.chain}
                        </strong>
                        <span>
                          {position.amount.toLocaleString()} {market.asset}{" "}
                          supplied
                        </span>
                      </span>
                      <span>
                        <strong>{percent(market.apy)}</strong>
                        <span>Sample APY</span>
                      </span>
                      <ArrowUpRight size={15} />
                    </button>
                  )
                })}
              </div>
              <div className="callout">
                <Info size={17} />
                <p>
                  These are tracked principal amounts, not a live portfolio
                  valuation. The prototype does not accrue yield or reconcile
                  wallet activity. Compare current sample rates before deciding
                  whether to move a position.
                </p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() =>
                  onPrompt(
                    "Compare Aave USDC supply opportunities on Base, Arbitrum, and Ethereum over the last seven days."
                  )
                }
              >
                Compare current alternatives
                <ArrowRight size={15} />
              </button>
            </>
          ) : (
            <>
              <p className="answer-lead">
                Connecting a wallet does not let the agent read your positions.
                Use <strong>Add context</strong> below to explicitly attach your
                tracked positions, then ask again.
              </p>
              <div className="callout">
                <LockKeyhole size={18} />
                <p>No portfolio data was included in this answer.</p>
              </div>
            </>
          )}
        </>
      )}
      {message.kind === "swap" && (
        <>
          <h2 className="answer-title">
            Review the route before making a move.
          </h2>
          <p className="answer-lead">
            This demo supports an <strong>ETH to USDC swap on Base</strong>. The
            review includes a sample quote, slippage limit, minimum received,
            and network cost before any simulated wallet confirmation.
          </p>
          <div className="research-action-card">
            <div className="action-card-main">
              <TokenIcon asset="ETH" />
              <ArrowRight size={18} />
              <TokenIcon asset="USDC" />
              <div>
                <h3>ETH to USDC</h3>
                <span>1inch sample route on Base</span>
              </div>
              <button
                className="btn btn-primary"
                onClick={() => onAction(markets[0], "swap")}
              >
                Review swap
                <ArrowRight size={15} />
              </button>
            </div>
            <p>
              <Info size={12} />
              Other assets and networks are not supported by this demo swap.
            </p>
          </div>
        </>
      )}
      {(message.kind === "unsupported" ||
        ((message.kind === "lending" || isPool) && !candidates.length)) && (
        <>
          <h2 className="answer-title">Let's keep this inside the evidence.</h2>
          <p className="answer-lead">
            I can't produce a supported comparison for that request from this
            demo dataset. It covers stablecoin supply on Aave, Morpho, and
            Compound, plus Uniswap pool fees on Ethereum, Base, and Arbitrum.
          </p>
          <div className="callout">
            <CircleAlert size={18} />
            <p>
              No values or transaction routes were invented to fill the gap. Try
              a supported asset, chain, and observation window.
            </p>
          </div>
          <button
            className="btn btn-secondary"
            onClick={() => onPrompt(starters[0].text)}
          >
            Compare USDC across supported networks
            <ArrowRight size={15} />
          </button>
        </>
      )}
      <div className="answer-footer">
        <div>
          <button className="source-button" onClick={() => setEvidence(true)}>
            <Database size={13} />
            {[...new Set(candidates.map((item) => item.protocol))].length +
              1}{" "}
            source references
            <ChevronRight size={13} />
          </button>
          <span className="small muted">
            {message.cost
              ? `${message.cost.toFixed(2)} USDC settled / simulated`
              : "Own subscription / simulated"}
          </span>
        </div>
        <div className="answer-feedback">
          <button
            className="icon-button"
            aria-label="Copy research summary"
            onClick={copyResult}
          >
            <Copy size={14} />
          </button>
          <button
            className={`icon-button ${feedback === "helpful" ? "selected" : ""}`}
            aria-label="Mark answer helpful"
            aria-pressed={feedback === "helpful"}
            onClick={() => {
              setFeedback("helpful")
              toast("Marked helpful in this session")
            }}
          >
            <ThumbsUp size={14} />
          </button>
          <button
            className={`icon-button ${feedback === "unhelpful" ? "selected" : ""}`}
            aria-label="Mark answer unhelpful"
            aria-pressed={feedback === "unhelpful"}
            onClick={() => {
              setFeedback("unhelpful")
              toast("Feedback noted in this session")
            }}
          >
            <ThumbsDown size={14} />
          </button>
        </div>
      </div>
      {evidence && (
        <Evidence message={message} onClose={() => setEvidence(false)} />
      )}
    </div>
  )
}

export function Research({
  thread,
  draft,
  onDraftChange,
  onSend,
  onAccess,
  onStop,
  onNew,
  includeContext,
  onContextChange,
  busy,
  stage,
  runningId,
  onInspect,
  onAction,
  onPrompt,
}: Props) {
  const messages = thread?.messages ?? []
  return (
    <div className="research-page page-enter">
      <div className="research-page-heading">
        <div>
          <span className="eyebrow">Your research desk</span>
          <h1>
            {thread ? thread.title : "A good question changes the picture."}
          </h1>
        </div>
        <button className="btn btn-secondary" onClick={onNew}>
          <MessageSquarePlus size={15} />
          New research
        </button>
      </div>
      {!messages.length ? (
        <div className="research-empty">
          <div className="research-empty-brand">
            <BrandMark />
          </div>
          <h2>Less noise. More understanding.</h2>
          <p>
            Ask about a market, test a strategy, or make sense of your
            positions.
            <br />
            You'll get the comparison and the evidence behind it.
          </p>
          <div className="research-empty-prompts">
            {starters.map((starter) => (
              <button
                key={starter.title}
                onClick={() => onPrompt(starter.text)}
              >
                <Sparkles size={16} />
                <span>{starter.title}</span>
                <ArrowUpRight size={15} />
              </button>
            ))}
            <button
              onClick={() =>
                onPrompt(
                  "Which of my tracked positions changed the most since I opened them?"
                )
              }
            >
              <Wallet size={16} />
              <span>Understand my tracked positions</span>
              <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className="research-layout">
          <div className="research-messages">
            {messages.map((message) => (
              <article className="research-exchange" key={message.id}>
                <div className="user-message">
                  <div className="user-message-meta">
                    <span className="user-avatar">Y</span>
                    <strong>You</strong>
                    {message.context && (
                      <span className="context-attached">
                        <Paperclip size={12} />
                        Portfolio attached
                      </span>
                    )}
                  </div>
                  <p>{message.prompt}</p>
                </div>
                {message.complete ? (
                  <ResearchResult
                    message={message}
                    onInspect={onInspect}
                    onAction={onAction}
                    onPrompt={onPrompt}
                  />
                ) : busy && runningId === message.id ? (
                  <div
                    className="research-progress"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="answer-byline">
                      <BrandMark small />
                      <strong>Following the evidence</strong>
                      <LoaderCircle size={15} className="spin" />
                    </div>
                    <p>Your demo agent is working through the comparison.</p>
                    <ol>
                      {steps.map((step, index) => (
                        <li
                          key={step}
                          className={
                            index < stage
                              ? "done"
                              : index === stage
                                ? "current"
                                : ""
                          }
                        >
                          <span>
                            {index < stage ? (
                              <Check size={12} />
                            ) : index === stage ? (
                              <span className="progress-dot" />
                            ) : (
                              <span className="progress-wait" />
                            )}
                          </span>
                          {step}
                          {index < stage && (
                            <span className="step-timing">done</span>
                          )}
                        </li>
                      ))}
                    </ol>
                    <span className="small muted">
                      <Database size={12} />
                      Local sample dataset. No live protocol calls.
                    </span>
                  </div>
                ) : (
                  <div className="callout">
                    <Info size={18} />
                    <div>
                      <strong>Research paused</strong>
                      <p>
                        No request charge was settled. Your question is saved.
                      </p>
                      <button
                        className="text-button"
                        onClick={() => onPrompt(message.prompt)}
                      >
                        Try this question again
                        <ArrowRight size={13} />
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
          <aside className="research-notebook">
            <span className="eyebrow">
              <FileText size={13} /> Research notebook
            </span>
            <h3>Every answer has a trail.</h3>
            <p>
              Sources, observations, and assumptions stay with the conversation.
            </p>
            <div>
              <Database size={16} />
              <span>
                <strong>Defined coverage</strong>
                <span>4 protocols, 3 networks</span>
              </span>
            </div>
            <div>
              <Clock3 size={16} />
              <span>
                <strong>A stated time window</strong>
                <span>Daily sample observations</span>
              </span>
            </div>
            <div>
              <ShieldCheck size={16} />
              <span>
                <strong>You make the call</strong>
                <span>No automatic execution</span>
              </span>
            </div>
            <hr />
            <SampleBadge />
            <p className="small">
              This is a working interface with simulated research. It is not an
              investment recommendation.
            </p>
          </aside>
        </div>
      )}
      <div className="research-composer-bottom">
        <ResearchComposer
          draft={draft}
          onDraftChange={onDraftChange}
          onSend={onSend}
          onAccess={onAccess}
          includeContext={includeContext}
          onContextChange={onContextChange}
          busy={busy}
          onStop={onStop}
          compact
        />
      </div>
    </div>
  )
}
