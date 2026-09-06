import { useEffect, useEffectEvent, useState } from "react"
import { type Access, type Market, type Position, money } from "./data"
import { Chain, Icon, Modal, Token } from "./primitives"

export function AccessSetup({
  onClose,
  onComplete,
}: {
  onClose: () => void
  onComplete: (access: Access) => void
}) {
  const [type, setType] = useState<"own" | "paid">("own")
  const [step, setStep] = useState<number | "expired" | "unavailable">(0)
  const [provider, setProvider] = useState("Claude Code")
  const [model, setModel] = useState("Claude Sonnet")
  const [budget, setBudget] = useState("10")
  const [error, setError] = useState("")
  useEffect(() => {
    if (step === 1 || step === 2) {
      const timer = setTimeout(() => setStep(step + 1), 950)
      return () => clearTimeout(timer)
    }
  }, [step])
  return (
    <Modal title="Make room for a little intelligence." onClose={onClose}>
      <div className="modal-body">
        <span className="eyebrow">YOUR RESEARCH, YOUR CHOICE</span>
        <p className="muted">
          Choose how your agent runs. You can change this anytime.
        </p>
        <div className="segmented access-tabs">
          <button
            className={type === "own" ? "active" : ""}
            onClick={() => {
              setType("own")
              setStep(0)
              setError("")
            }}
          >
            <Icon name="terminal" size={17} />
            Use my subscription
          </button>
          <button
            className={type === "paid" ? "active" : ""}
            onClick={() => {
              setType("paid")
              setError("")
            }}
          >
            <Icon name="coins" size={17} />
            Pay per request
          </button>
        </div>
        {type === "own" ? (
          <>
            <label className="field-label" htmlFor="provider">
              Local AI provider
            </label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => {
                setProvider(e.target.value)
                setModel(
                  e.target.value === "Codex" ? "GPT research" : "Claude Sonnet"
                )
                setStep(0)
              }}
            >
              <option>Claude Code</option>
              <option>Codex</option>
            </select>
            <div className="connection-box">
              <Icon name="terminal" size={25} />
              <h3>
                {step === "expired"
                  ? "Authorization expired"
                  : step === "unavailable"
                    ? "Runtime unavailable"
                    : step === 0
                      ? "Connect your local runtime"
                      : step === 1
                        ? "Connecting to your runtime..."
                        : step === 2
                          ? "Verifying with a test request..."
                          : "Your agent is ready"}
              </h3>
              <p>
                {step === "expired"
                  ? "Your local session is no longer authorized. Reconnect to continue using your subscription."
                  : step === "unavailable"
                    ? "We could not reach a local runtime. Confirm it is installed and running, then retry."
                    : step === 3
                      ? `${provider} connected in this simulation. Subscription limits are not available in the prototype.`
                      : "Your subscription and reusable credentials stay on your device. No keys to copy or paste."}
              </p>
              <span className="pill">Prototype connection</span>
              {step === "expired" || step === "unavailable" ? (
                <button
                  className="button secondary"
                  onClick={() => setStep(0)}
                >
                  Reconnect <Icon name="arrow" size={16} />
                </button>
              ) : (
                step < 3 && (
                  <button
                    className="button secondary"
                    disabled={step > 0}
                    onClick={() => setStep(1)}
                  >
                    {step > 0 ? (
                      <>
                        <span className="spinner" />{" "}
                        {step === 1 ? "Connecting" : "Verifying"}
                      </>
                    ) : (
                      <>
                        Simulate connection <Icon name="arrow" size={16} />
                      </>
                    )}
                  </button>
                )
              )}
              {step === 0 && (
                <div className="preview-state-links">
                  <button
                    className="text-button"
                    onClick={() => setStep("expired")}
                  >
                    Preview: authorization expired
                  </button>
                  <button
                    className="text-button"
                    onClick={() => setStep("unavailable")}
                  >
                    Preview: runtime unavailable
                  </button>
                </div>
              )}
            </div>
            <label className="field-label" htmlFor="access-model">
              Research model
            </label>
            <select
              id="access-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
            >
              {provider === "Claude Code" ? (
                <>
                  <option>Claude Sonnet</option>
                  <option>Claude Opus</option>
                </>
              ) : (
                <option>GPT research</option>
              )}
            </select>
            <p className="micro">
              Uses your existing plan in the intended product. Supported account
              terms and a verified connector will be required for a real
              connection.
            </p>
            <button
              className="button primary full"
              disabled={step !== 3}
              onClick={() => onComplete({ type, model, budget: 0, spent: 0 })}
            >
              Continue with my subscription <Icon name="arrow" size={17} />
            </button>
          </>
        ) : (
          <>
            <div className="price-card">
              <span>Estimated research request</span>
              <strong>
                0.12 <small>USDC</small>
              </strong>
              <p>
                Example rate: 0.02 USDC per analysis step, up to 6 steps. Actual
                pricing is not connected.
              </p>
            </div>
            <label className="field-label" htmlFor="budget">
              Maximum research budget
            </label>
            <div className="amount-input">
              <input
                id="budget"
                type="number"
                min="0.12"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
              <span>USDC</span>
            </div>
            <p className="micro">
              Requests stop at your cap. Protocol transactions and network fees
              have their own separate review.
            </p>
            <div className="notice">
              <Icon name="info" size={18} />
              <span>
                Simulated Hedera payment. No real charge or wallet
                authorization.
              </span>
            </div>
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              onClick={() => {
                if (!Number.isFinite(Number(budget)) || Number(budget) < 0.12)
                  setError(
                    "Set a budget of at least 0.12 USDC to run this sample request."
                  )
                else
                  onComplete({
                    type,
                    model: "Claude Sonnet",
                    budget: Number(budget),
                    spent: 0,
                  })
              }}
            >
              Approve demo budget & continue <Icon name="arrow" size={17} />
            </button>
            <button
              className="text-button full"
              onClick={() =>
                setError(
                  "Payment rejected. Your balance is unchanged. You can retry or use your subscription."
                )
              }
            >
              Preview payment rejection
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

export function Evidence({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState("Sources")
  return (
    <Modal title="The evidence behind the answer" onClose={onClose} drawer>
      <div className="modal-body">
        <span className="pill amber">Sample data</span>
        <p className="muted">
          An inspectable example of how Cool Bar supports a comparison.
        </p>
        <div className="tabs">
          {["Sources", "Methodology", "Query"].map((t) => (
            <button
              key={t}
              className={tab === t ? "active" : ""}
              onClick={() => setTab(t)}
            >
              {t}
            </button>
          ))}
        </div>
        {tab === "Sources" ? (
          <>
            <h3>Protocol coverage</h3>
            {["Base", "Arbitrum", "Ethereum"].map((chain) => (
              <a
                className="source-item"
                key={chain}
                href="https://aave.com/docs"
                target="_blank"
                rel="noreferrer"
              >
                <span className="protocol-logo">a</span>
                <div>
                  <strong>Aave V3</strong>
                  <p>{chain} market snapshot</p>
                </div>
                <Icon name="external" size={16} />
              </a>
            ))}
            <a
              className="source-item"
              href="https://docs.uniswap.org/"
              target="_blank"
              rel="noreferrer"
            >
              <span className="protocol-logo pink">u</span>
              <div>
                <strong>Uniswap V3</strong>
                <p>Pool fee and volume definitions</p>
              </div>
              <Icon name="external" size={16} />
            </a>
            <div className="notice">
              <Icon name="clock" size={18} />
              <span>
                Sample observation: September 5, 2026 at 09:41 UTC. No live
                sources have been queried.
              </span>
            </div>
            <h3>Known coverage gaps</h3>
            <p className="muted">
              This prototype includes Aave V3 and Uniswap V3 examples on three
              chains. It does not compare all markets. Candidates with missing
              history would be excluded from rankings.
            </p>
          </>
        ) : tab === "Methodology" ? (
          <>
            <h3>Compare like with like</h3>
            <dl className="detail-list">
              <div>
                <dt>Observation window</dt>
                <dd>August 30 to September 5, 2026</dd>
              </div>
              <div>
                <dt>Supply APY</dt>
                <dd>Current annualized variable supply rate</dd>
              </div>
              <div>
                <dt>7-day average</dt>
                <dd>Arithmetic mean of daily APY samples</dd>
              </div>
              <div>
                <dt>Incentives</dt>
                <dd>Excluded from every comparison</dd>
              </div>
              <div>
                <dt>Pool fees</dt>
                <dd>Seven-day volume multiplied by fee tier</dd>
              </div>
            </dl>
            <div className="notice">
              <Icon name="info" size={18} />
              <span>
                Fees are not net returns. Gas, impermanent loss, token price
                changes, and liquidity range are excluded.
              </span>
            </div>
            <p className="muted">
              All financial values are illustrative fixtures. APY is variable
              and does not predict future returns. Cross-chain execution
              introduces additional costs and bridge risk.
            </p>
          </>
        ) : (
          <>
            <h3>Illustrative query</h3>
            <p className="muted">
              Example shape only. This is not a verified query for a deployed
              subgraph.
            </p>
            <pre>{`query SupplyComparison {\n  reserves(\n    where: { symbol: "USDC" }\n  ) {\n    symbol\n    liquidityRate\n    availableLiquidity\n    utilizationRate\n    lastUpdateTimestamp\n  }\n}`}</pre>
            <a
              className="text-button"
              href="https://thegraph.com/docs/"
              target="_blank"
              rel="noreferrer"
            >
              The Graph documentation <Icon name="external" size={14} />
            </a>
          </>
        )}
      </div>
    </Modal>
  )
}

export function Transaction({
  market,
  connected,
  onConnect,
  onClose,
  onComplete,
  onRecord,
}: {
  market: Market
  connected: boolean
  onConnect: () => void
  onClose: () => void
  onComplete: () => void
  onRecord: (position: Position) => void
}) {
  const [step, setStep] = useState(0)
  const [amount, setAmount] = useState("1000")
  const [funding, setFunding] = useState("USDC")
  const [scenario, setScenario] = useState("Normal flow")
  const [error, setError] = useState("")
  const [approved, setApproved] = useState(false)
  const [swapped, setSwapped] = useState(false)
  const [networkReady, setNetworkReady] = useState(false)
  const [pending, setPending] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const total = Number(amount)
  const valid = Number.isFinite(total) && total >= 0.01 && total <= 12500
  const recordPosition = useEffectEvent(onRecord)
  useEffect(() => {
    if (!pending) return
    const timer = setTimeout(() => {
      recordPosition({
        id: crypto.randomUUID(),
        marketId: market.id,
        amount: total,
        date: new Date().toISOString(),
        reference: `demo:${crypto.randomUUID().slice(0, 8)}`,
      })
      setPending(false)
      setConfirmed(true)
      setStep(3)
    }, 1800)
    return () => clearTimeout(timer)
  }, [pending, market.id, total])
  function prepare() {
    if (!valid) {
      setError("Enter an amount between 0.01 and 12,500 USDC.")
      return
    }
    if (scenario === "Insufficient funds") {
      setError(
        "Insufficient USDC. Reduce the amount or choose another funding asset."
      )
      return
    }
    if (scenario === "Simulation failure") {
      setError(
        "Transaction simulation failed. No funds moved. Reset the preview to Normal flow and try again."
      )
      return
    }
    setError("")
    setStep(1)
  }
  function confirm() {
    if (scenario === "Rejected signature") {
      setError(
        "Signature rejected. Completed steps are preserved. Retry when you are ready."
      )
      return
    }
    if (scenario === "Expired quote" && funding === "ETH" && !swapped) {
      setError("This swap quote expired. Refresh it before continuing.")
      return
    }
    setError("")
    if (funding === "ETH" && !swapped) {
      setSwapped(true)
      return
    }
    if (!approved) {
      setApproved(true)
      return
    }
    setPending(true)
  }
  return (
    <Modal
      title={confirmed ? "A new position, all in view." : "Supply to Aave"}
      onClose={onClose}
      busy={pending}
      drawer
    >
      <div className="modal-body">
        <div className="transaction-heading">
          <Token asset={market.asset} />
          <div>
            <h3>{market.asset} supply</h3>
            <span>
              Aave V3 <span className="dot-separator">/</span> {market.chain}
            </span>
          </div>
          <span className="pill amber">Simulation</span>
        </div>
        <div className="stepper">
          {["Prepare", "Review", "Wallet", "Complete"].map((label, i) => (
            <span className={step >= i ? "active" : ""} key={label}>
              <b>{step > i ? <Icon name="check" size={12} /> : i + 1}</b>
              {label}
            </span>
          ))}
        </div>
        {step === 0 && (
          <>
            <div className="yield-banner">
              <span>
                Current supply APY <small>Variable, excluding incentives</small>
              </span>
              <strong>{market.apy.toFixed(2)}%</strong>
            </div>
            <label className="field-label" htmlFor="supply-amount">
              Amount to supply
            </label>
            <div className="amount-input">
              <input
                id="supply-amount"
                type="number"
                min="0.01"
                max="12500"
                step="0.01"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value)
                  setApproved(false)
                  setSwapped(false)
                  setError("")
                }}
              />
              <Token asset={market.asset} small />
              <span>{market.asset}</span>
            </div>
            <div className="amount-meta">
              <span>Sample balance: 12,500 {market.asset}</span>
              <button
                className="text-button"
                onClick={() => {
                  setAmount("12500")
                  setApproved(false)
                  setSwapped(false)
                }}
              >
                Max
              </button>
            </div>
            {market.asset === "USDC" && (
              <>
                <label className="field-label" htmlFor="funding">
                  Fund with
                </label>
                <select
                  id="funding"
                  value={funding}
                  onChange={(e) => setFunding(e.target.value)}
                >
                  <option>USDC</option>
                  <option value="ETH">ETH via a separate 1inch swap</option>
                </select>
              </>
            )}
            <div className="notice">
              <Icon name="shield" size={19} />
              <span>
                Variable yield, stablecoin depeg, and smart-contract risk.
                Withdrawals depend on available liquidity.
              </span>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Protocol</dt>
                <dd>Aave V3</dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>
                  <Chain name={market.chain} />
                </dd>
              </div>
              <div>
                <dt>Estimated network fee</dt>
                <dd>
                  {market.chain === "Ethereum" ? "$2.84" : "$0.08"}{" "}
                  <span className="muted">sample</span>
                </dd>
              </div>
            </dl>
            <button
              className="button primary full"
              onClick={() => {
                if (!connected) onConnect()
                else prepare()
              }}
            >
              {connected ? "Prepare transaction" : "Connect demo wallet"}
              <Icon name="arrow" size={17} />
            </button>
          </>
        )}
        {step === 1 && (
          <>
            <h3>Review your transaction</h3>
            <p className="muted">
              Every step requires a separate simulated wallet confirmation.
            </p>
            <dl className="detail-list">
              <div>
                <dt>You supply</dt>
                <dd>
                  {money(total)} {market.asset}
                </dd>
              </div>
              <div>
                <dt>You receive</dt>
                <dd>
                  {money(total)} a{market.asset}
                </dd>
              </div>
              <div>
                <dt>Destination</dt>
                <dd>Aave V3 Pool on {market.chain}</dd>
              </div>
              <div>
                <dt>Token allowance</dt>
                <dd>
                  Exactly {money(total)} {market.asset}
                </dd>
              </div>
              <div>
                <dt>Protocol deposit fee</dt>
                <dd>$0.00</dd>
              </div>
              <div>
                <dt>Estimated gas</dt>
                <dd>
                  {market.chain === "Ethereum" ? "$2.84" : "$0.08"} per step,
                  sample
                </dd>
              </div>
            </dl>
            {funding === "ETH" && (
              <div className="soft-panel">
                <h4>First, swap ETH to USDC</h4>
                <p>
                  Illustrative 1inch route on {market.chain}. Input:{" "}
                  {((total / 2400) * 1.005).toFixed(6)} ETH.
                </p>
                <p>
                  Slippage: 0.5%. Minimum received: {money(total)} USDC. Quote
                  valid for 60 seconds in this simulation.
                </p>
                <p className="micro">
                  This is a design example, not a claim of Aqua or SwapVM
                  integration compatibility.
                </p>
              </div>
            )}
            <div className="notice">
              <Icon name="info" size={18} />
              <span>
                No contracts will be called. The next screen simulates your
                wallet.
              </span>
            </div>
            <button className="button primary full" onClick={() => setStep(2)}>
              Continue to demo wallet <Icon name="wallet" size={17} />
            </button>
            <button className="text-button full" onClick={() => setStep(0)}>
              Edit amount
            </button>
          </>
        )}
        {step === 2 && (
          <>
            <div className="wallet-simulation">
              <span className="wallet-large">
                <Icon name="wallet" size={30} />
              </span>
              <span className="eyebrow">SIMULATED WALLET HANDOFF</span>
              <h3>
                {pending
                  ? "Transaction pending"
                  : scenario === "Wrong network" && !networkReady
                    ? `Switch to ${market.chain}`
                    : funding === "ETH" && !swapped
                      ? "Confirm the swap"
                      : !approved
                        ? `Approve ${market.asset}`
                        : "Confirm your supply"}
              </h3>
              <p>
                {pending
                  ? "Waiting for the simulated network confirmation."
                  : !approved
                    ? `Allow Aave V3 Pool to use exactly ${money(total)} ${market.asset}. This does not deposit funds.`
                    : `Supply ${money(total)} ${market.asset} to Aave V3 on ${market.chain}.`}
              </p>
              <strong>
                {money(total)} {market.asset}
              </strong>
            </div>
            <div className="transaction-checklist">
              {funding === "ETH" && (
                <span>
                  <Icon name={swapped ? "check" : "clock"} size={16} />
                  1inch swap {swapped ? "completed" : "awaiting confirmation"}
                </span>
              )}
              <span>
                <Icon name={approved ? "check" : "clock"} size={16} />
                Token approval{" "}
                {approved ? "completed" : "awaiting confirmation"}
              </span>
              <span>
                <Icon name={pending ? "refresh" : "clock"} size={16} />
                Aave deposit {pending ? "pending" : "awaiting confirmation"}
              </span>
            </div>
            {scenario === "Wrong network" && !networkReady ? (
              <button
                className="button primary full"
                onClick={() => setNetworkReady(true)}
              >
                Switch demo network to {market.chain}
              </button>
            ) : (
              <button
                className="button primary full"
                disabled={pending}
                onClick={confirm}
              >
                {pending ? (
                  <>
                    <span className="spinner" /> Confirming...
                  </>
                ) : funding === "ETH" && !swapped ? (
                  "Confirm demo swap"
                ) : !approved ? (
                  "Approve demo allowance"
                ) : (
                  "Confirm demo supply"
                )}
              </button>
            )}
            {!pending && (
              <button
                className="text-button full"
                onClick={() => {
                  setError(
                    "You rejected the request. No new transaction was submitted."
                  )
                  setStep(1)
                }}
              >
                Reject request
              </button>
            )}
          </>
        )}
        {confirmed && (
          <div className="success-state">
            <span className="success-icon">
              <Icon name="check" size={30} />
            </span>
            <h3>
              {money(total)} {market.asset} supplied
            </h3>
            <p>
              Your simulated position is ready to track. No real funds have
              moved.
            </p>
            <dl className="detail-list">
              <div>
                <dt>Protocol</dt>
                <dd>Aave V3 on {market.chain}</dd>
              </div>
              <div>
                <dt>Transaction</dt>
                <dd className="mono">demo:local-confirmation</dd>
              </div>
              <div>
                <dt>Tracking</dt>
                <dd>In this browser</dd>
              </div>
            </dl>
            <button className="button primary full" onClick={onComplete}>
              View in portfolio <Icon name="arrow" size={17} />
            </button>
          </div>
        )}
        {error && (
          <div className="notice danger" role="alert">
            <Icon name="warning" size={18} />
            <span>
              {error}
              {error.includes("expired") && (
                <button
                  className="text-button"
                  onClick={() => {
                    setScenario("Normal flow")
                    setError("")
                  }}
                >
                  Refresh demo quote
                </button>
              )}
            </span>
          </div>
        )}
        {!confirmed && (
          <details className="preview-states">
            <summary>Prototype state previews</summary>
            <label className="field-label" htmlFor="transaction-scenario">
              Simulate a transaction condition
            </label>
            <select
              id="transaction-scenario"
              value={scenario}
              onChange={(e) => {
                setScenario(e.target.value)
                setError("")
              }}
            >
              {[
                "Normal flow",
                "Wrong network",
                "Insufficient funds",
                "Simulation failure",
                "Rejected signature",
                "Expired quote",
              ].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <p className="micro">
              These controls preview product states. They do not reflect a real
              wallet.
            </p>
          </details>
        )}
      </div>
    </Modal>
  )
}
