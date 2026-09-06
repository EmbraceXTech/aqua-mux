import { useCallback, useEffect, useId, useRef, useState } from "react"
import {
  ArrowDown,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleAlert,
  Clock3,
  FlaskConical,
  KeyRound,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
  Smartphone,
  Wallet,
} from "lucide-react"
import type { Chain, Market } from "@/lib/demo-data"
import { money, percent } from "@/lib/demo-data"
import { useWorkspace } from "@/lib/workspace"
import {
  ChainBadge,
  Modal,
  ProtocolIcon,
  SampleBadge,
  TokenIcon,
} from "./primitives"
import "./transaction-modal.css"

type TransactionKind = "supply" | "withdraw" | "swap"
type Step = "amount" | "review" | "approval" | "confirm" | "pending" | "success"
type Scenario =
  "normal" | "rejection" | "insufficient" | "simulation" | "wrong-network"
type Operation = "network" | "approval" | "transaction" | null

type Approval = {
  amount: number
  owner: string
  asset: string
  chain: Chain
  spender: string
}
type Receipt = { amount: number; received: number; remaining: number }

const SAMPLE_ETH_PRICE = 3200
const SLIPPAGE = 0.005
const QUOTE_LIFETIME = 120_000
const providers = [
  {
    name: "MetaMask demo",
    label: "MetaMask",
    description: "Simulated browser wallet",
    icon: Wallet,
  },
  {
    name: "Coinbase Wallet demo",
    label: "Coinbase Wallet",
    description: "Simulated mobile wallet",
    icon: Smartphone,
  },
  {
    name: "WalletConnect demo",
    label: "WalletConnect",
    description: "Simulated wallet connection",
    icon: KeyRound,
  },
]

function quantity(value: number, precision = 6) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: precision,
  }).format(value)
}

function toInput(value: number, precision: number) {
  const factor = 10 ** precision
  return String(
    Number((Math.floor(value * factor) / factor).toFixed(precision))
  )
}

function shortAddress(value: string) {
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

function useSafeTimeout() {
  const timer = useRef<ReturnType<typeof window.setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
    },
    []
  )
  return useCallback((callback: () => void, delay: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      timer.current = null
      callback()
    }, delay)
  }, [])
}

export function WalletModal({
  onClose,
  onConnected,
}: {
  onClose: () => void
  onConnected?: () => void
}) {
  const { state, connectWallet } = useWorkspace()
  const [selected, setSelected] = useState(providers[0].name)
  const [connecting, setConnecting] = useState(false)
  const connectingRef = useRef(false)
  const schedule = useSafeTimeout()
  const headingId = useId()

  function connect() {
    if (connectingRef.current) return
    if (state.wallet) {
      onClose()
      onConnected?.()
      return
    }
    connectingRef.current = true
    setConnecting(true)
    schedule(() => {
      connectWallet(selected)
      setConnecting(false)
      onClose()
      onConnected?.()
    }, 650)
  }

  return (
    <Modal
      title={
        state.wallet ? "Your demo wallet is connected" : "Connect a demo wallet"
      }
      eyebrow="Your wallet, your choice"
      onClose={onClose}
      busy={connecting}
    >
      <div className="wallet-content">
        <div className="wallet-intro">
          <span className="wallet-intro-icon">
            <Wallet size={25} aria-hidden="true" />
          </span>
          <div>
            <SampleBadge label="Simulated connection" />
            <p>
              No real wallet connects. No extension opens, and no signature is
              requested.
            </p>
          </div>
        </div>
        {state.wallet ? (
          <div className="wallet-connected-card">
            <CheckCircle2 size={23} aria-hidden="true" />
            <div>
              <strong>{state.wallet.name}</strong>
              <span>
                {shortAddress(state.wallet.address)}{" "}
                <span className="muted">Demo address</span>
              </span>
            </div>
            <ChainBadge chain={state.wallet.chain} />
          </div>
        ) : (
          <fieldset className="wallet-providers" disabled={connecting}>
            <legend id={headingId}>Choose a provider to simulate</legend>
            {providers.map(({ name, label, description, icon: Icon }) => (
              <label
                className={`wallet-provider ${selected === name ? "is-selected" : ""}`}
                key={name}
              >
                <input
                  type="radio"
                  name={headingId}
                  value={name}
                  checked={selected === name}
                  onChange={() => setSelected(name)}
                />
                <span className="wallet-provider-icon">
                  <Icon size={21} aria-hidden="true" />
                </span>
                <span className="wallet-provider-copy">
                  <strong>{label}</strong>
                  <span>{description}</span>
                </span>
                <span className="wallet-provider-check" aria-hidden="true">
                  {selected === name && <Check size={13} />}
                </span>
              </label>
            ))}
          </fieldset>
        )}
        <div className="wallet-privacy">
          <LockKeyhole size={17} aria-hidden="true" />
          <p>
            Only sample balances are added to this browser. Connecting does not
            give research access to your portfolio.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary wallet-connect-button"
          onClick={connect}
          disabled={connecting}
        >
          {connecting ? (
            <>
              <LoaderCircle className="tx-spin" size={17} aria-hidden="true" />
              Connecting demo wallet...
            </>
          ) : (
            <>
              {state.wallet
                ? "Continue with this wallet"
                : "Connect demo wallet"}
              <ArrowRight size={17} aria-hidden="true" />
            </>
          )}
        </button>
        <p className="wallet-footnote" role="status">
          {connecting
            ? "Preparing local sample balances. No wallet request is being sent."
            : "Never enter a seed phrase or private key. This demo will not ask for one."}
        </p>
      </div>
    </Modal>
  )
}

export function TransactionModal({
  market,
  kind = "supply",
  positionId,
  onClose,
  onComplete,
}: {
  market: Market
  kind?: TransactionKind
  positionId?: string
  onClose: () => void
  onComplete: () => void
}) {
  const workspace = useWorkspace()
  const { state, setWalletChain } = workspace
  const latest = useRef(workspace)
  useEffect(() => {
    latest.current = workspace
  }, [workspace])
  const [step, setStep] = useState<Step>("amount")
  const [input, setInput] = useState("")
  const [touched, setTouched] = useState(false)
  const [scenario, setScenario] = useState<Scenario>("normal")
  const [scenarioUsed, setScenarioUsed] = useState(false)
  const [approval, setApproval] = useState<Approval | null>(null)
  const [error, setError] = useState("")
  const [operation, setOperation] = useState<Operation>(null)
  const operationRef = useRef<Operation>(null)
  const [walletDialog, setWalletDialog] = useState(false)
  const [quoteExpiresAt, setQuoteExpiresAt] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now)
  const [receipt, setReceipt] = useState<Receipt | null>(null)
  const schedule = useSafeTimeout()
  const inputRef = useRef<HTMLInputElement>(null)
  const stepHeadingRef = useRef<HTMLHeadingElement>(null)
  const id = useId()

  const asset = kind === "swap" ? "ETH" : market.asset
  const precision = kind === "swap" ? 8 : 6
  const amount = Number(input.trim())
  const isSupply = kind === "supply"
  const verb =
    kind === "withdraw" ? "Withdraw" : kind === "swap" ? "Swap" : "Supply"
  const wallet = state.wallet
  const position = state.positions.find(
    (item) =>
      item.id === positionId &&
      item.marketId === market.id &&
      item.wallet === wallet?.address
  )
  const available =
    kind === "withdraw"
      ? (position?.amount ?? 0)
      : wallet
        ? kind === "swap"
          ? wallet.balanceETH
          : asset === "USDT"
            ? wallet.balanceUSDT
            : wallet.balanceUSDC
        : 0
  const forcedMismatch = scenario === "wrong-network" && !scenarioUsed
  const currentChain = forcedMismatch
    ? market.chain === "Base"
      ? "Ethereum"
      : "Base"
    : wallet?.chain
  const chainMismatch = Boolean(wallet && currentChain !== market.chain)
  const spender = `demo:${market.protocol.toLowerCase().replaceAll(" ", "-")}:${market.chain.toLowerCase()}`
  const approvalValid = Boolean(
    approval &&
    approval.amount === amount &&
    approval.owner === wallet?.address &&
    approval.asset === asset &&
    approval.chain === market.chain &&
    approval.spender === spender
  )
  const busy = operation !== null || step === "pending"
  const expectedReceived =
    Math.round(amount * SAMPLE_ETH_PRICE * 1_000_000) / 1_000_000
  const minimumReceived =
    Math.floor(expectedReceived * (1 - SLIPPAGE) * 1_000_000) / 1_000_000
  const quoteExpired =
    kind === "swap" && quoteExpiresAt !== null && now >= quoteExpiresAt
  const quoteSeconds = quoteExpiresAt
    ? Math.max(0, Math.ceil((quoteExpiresAt - now) / 1000))
    : 0
  const fee =
    market.chain === "Ethereum"
      ? 0.84
      : market.chain === "Arbitrum"
        ? 0.02
        : 0.03
  const unsupported =
    isSupply && (!market.executable || !["USDC", "USDT"].includes(asset))

  let amountError = ""
  if (!input.trim()) amountError = "Enter an amount to continue."
  else if (
    !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(input.trim()) ||
    !Number.isFinite(amount)
  )
    amountError = "Enter a valid amount using numbers and a decimal point."
  else if ((input.trim().split(".")[1]?.length ?? 0) > precision)
    amountError = `Use no more than ${precision} decimal places for ${asset}.`
  else if (amount <= 0) amountError = "The amount must be greater than zero."
  else if (kind === "withdraw" && !position)
    amountError = "This position is not available in the connected demo wallet."
  else if (amount > available)
    amountError =
      kind === "withdraw"
        ? `You can withdraw up to ${quantity(available)} ${asset} from this position.`
        : `Not enough ${asset}. Your demo wallet has ${quantity(available, precision)} ${asset}.`
  else if (scenario === "insufficient" && !scenarioUsed)
    amountError =
      "This scenario simulates insufficient funds. Use your available demo balance below to continue."
  else if (kind === "swap" && minimumReceived <= 0)
    amountError =
      "Increase the amount so the minimum received is at least 0.000001 USDC."

  useEffect(() => {
    if (walletDialog) return
    if (step === "amount") inputRef.current?.focus()
    else stepHeadingRef.current?.focus()
  }, [step, walletDialog])

  useEffect(() => {
    if (
      kind !== "swap" ||
      quoteExpiresAt === null ||
      step === "success" ||
      now >= quoteExpiresAt
    )
      return
    const timer = window.setTimeout(() => setNow(Date.now()), 1000)
    return () => window.clearTimeout(timer)
  }, [kind, quoteExpiresAt, step, now])

  function finishOperation() {
    operationRef.current = null
    setOperation(null)
  }

  function newQuote() {
    const time = Date.now()
    setNow(time)
    setQuoteExpiresAt(time + QUOTE_LIFETIME)
    setError("")
  }

  function validate() {
    setTouched(true)
    if (!wallet) {
      setWalletDialog(true)
      return false
    }
    if (unsupported) {
      setError(
        "This market is research-only. Choose a supported Aave stablecoin market to try a demo supply."
      )
      return false
    }
    if (amountError) {
      setError(amountError)
      return false
    }
    if (chainMismatch) {
      setError(`Switch your demo wallet to ${market.chain} before continuing.`)
      return false
    }
    return true
  }

  function goReview() {
    if (!validate()) {
      inputRef.current?.focus()
      return
    }
    setError("")
    if (kind === "swap") newQuote()
    setStep("review")
  }

  function switchNetwork() {
    if (!wallet || operationRef.current) return
    operationRef.current = "network"
    setOperation("network")
    setError("")
    schedule(() => {
      if (!latest.current.state.wallet) {
        finishOperation()
        setError("The demo wallet disconnected. Reconnect it to continue.")
        return
      }
      setWalletChain(market.chain)
      if (scenario === "wrong-network") setScenarioUsed(true)
      finishOperation()
    }, 550)
  }

  function goToWallet() {
    if (!validate()) return
    if (kind === "swap" && (!quoteExpiresAt || Date.now() >= quoteExpiresAt)) {
      setNow(Date.now())
      setError(
        "This sample quote expired. Refresh it and review the amounts again."
      )
      return
    }
    setError("")
    setStep(isSupply && !approvalValid ? "approval" : "confirm")
  }

  function approve() {
    if (operationRef.current || !validate() || !wallet) return
    const owner = wallet.address
    operationRef.current = "approval"
    setOperation("approval")
    setError("")
    schedule(() => {
      const currentWallet = latest.current.state.wallet
      finishOperation()
      if (
        currentWallet?.address !== owner ||
        currentWallet.chain !== market.chain
      ) {
        setError(
          "Your demo wallet or network changed. Restore it before approving."
        )
        return
      }
      setApproval({ amount, owner, asset, chain: market.chain, spender })
      setStep("confirm")
    }, 850)
  }

  function reject() {
    setError(
      `You rejected the simulated request. Nothing was submitted.${isSupply && approvalValid ? " Your completed approval is kept for this exact amount." : " You can review the details and try again."}`
    )
  }

  function confirm() {
    if (operationRef.current || !validate() || !wallet) return
    if (isSupply && !approvalValid) {
      setStep("approval")
      setError("Approve this exact amount before confirming the supply.")
      return
    }
    if (kind === "swap" && (!quoteExpiresAt || Date.now() >= quoteExpiresAt)) {
      setNow(Date.now())
      setStep("review")
      setError(
        "This sample quote expired. Refresh it and review the amounts again."
      )
      return
    }
    if (!scenarioUsed && scenario === "rejection") {
      setScenarioUsed(true)
      setError(
        `The demo wallet rejected the request. Nothing was submitted.${isSupply ? " Your completed token approval is preserved." : " Your balances are unchanged."} Try confirming again when you are ready.`
      )
      return
    }
    if (!scenarioUsed && scenario === "simulation") {
      setScenarioUsed(true)
      setError(
        `The demo preflight simulation failed. The transaction was not submitted.${isSupply ? " Your completed approval is preserved." : " Your balances are unchanged."} Retry to run a new simulation.`
      )
      return
    }

    const owner = wallet.address
    operationRef.current = "transaction"
    setOperation("transaction")
    setError("")
    setStep("pending")
    schedule(() => {
      const current = latest.current
      const currentWallet = current.state.wallet
      const currentPosition = current.state.positions.find(
        (item) =>
          item.id === positionId &&
          item.marketId === market.id &&
          item.wallet === owner
      )
      const currentAvailable =
        kind === "withdraw"
          ? (currentPosition?.amount ?? 0)
          : currentWallet
            ? kind === "swap"
              ? currentWallet.balanceETH
              : asset === "USDT"
                ? currentWallet.balanceUSDT
                : currentWallet.balanceUSDC
            : 0
      let completionError = ""
      if (!currentWallet || currentWallet.address !== owner)
        completionError =
          "Your demo wallet changed before confirmation. Reconnect the original wallet and try again."
      else if (currentWallet.chain !== market.chain)
        completionError = `Your demo wallet changed networks. Switch back to ${market.chain} and retry.`
      else if (
        amount > currentAvailable ||
        (kind === "withdraw" && !currentPosition)
      )
        completionError =
          "The available balance changed before confirmation. Edit the amount and review it again."
      else if (
        kind === "swap" &&
        (!quoteExpiresAt || Date.now() >= quoteExpiresAt)
      )
        completionError =
          "The sample quote expired before confirmation. Refresh it and review the amounts again."
      if (completionError) {
        finishOperation()
        setError(completionError)
        setStep(kind === "swap" ? "review" : "confirm")
        return
      }

      if (isSupply) current.addPosition(market, amount)
      else if (kind === "withdraw" && positionId)
        current.withdrawPosition(positionId, amount)
      else if (kind === "swap") {
        const activityId = crypto.randomUUID()
        const time = new Date().toISOString()
        current.setState((previous) => {
          if (
            !previous.wallet ||
            previous.wallet.address !== owner ||
            previous.wallet.chain !== market.chain ||
            previous.wallet.balanceETH < amount
          )
            return previous
          return {
            ...previous,
            wallet: {
              ...previous.wallet,
              balanceETH: Number(
                (previous.wallet.balanceETH - amount).toFixed(8)
              ),
              balanceUSDC: Number(
                (previous.wallet.balanceUSDC + expectedReceived).toFixed(6)
              ),
            },
            activity: [
              {
                id: activityId,
                type: "Swap",
                title: "Swap ETH to USDC",
                amount,
                asset: "ETH",
                chain: market.chain,
                time,
                tx: `demo-${activityId.slice(0, 8)}`,
              },
              ...previous.activity,
            ],
          }
        })
      }
      setReceipt({
        amount,
        received: expectedReceived,
        remaining: Math.max(0, currentAvailable - amount),
      })
      finishOperation()
      setStep("success")
    }, 1800)
  }

  const steps = isSupply
    ? ["Amount", "Review", "Approve", "Confirm"]
    : ["Amount", "Review", "Confirm"]
  const stepIndex =
    step === "amount"
      ? 0
      : step === "review"
        ? 1
        : step === "approval"
          ? 2
          : steps.length - 1
  const showInputError = touched && Boolean(amountError)

  const networkNotice = chainMismatch && (
    <div className="tx-network-warning callout callout-warning">
      <CircleAlert size={19} aria-hidden="true" />
      <div>
        <strong>Switch to {market.chain}</strong>
        <p>
          Your {forcedMismatch ? "simulated" : "demo"} wallet is on{" "}
          {currentChain}. This transaction stays on {market.chain}; it does not
          bridge assets.
        </p>
        <button
          type="button"
          className="btn btn-secondary tx-switch-button"
          onClick={switchNetwork}
          disabled={busy}
        >
          {operation === "network" ? (
            <>
              <LoaderCircle className="tx-spin" size={14} aria-hidden="true" />
              Switching...
            </>
          ) : (
            `Switch demo wallet to ${market.chain}`
          )}
        </button>
      </div>
    </div>
  )

  const quoteDetails = kind === "swap" && (
    <div className="tx-quote-details">
      <dl className="definition-list">
        <div>
          <dt>Sample exchange rate</dt>
          <dd>1 ETH = {quantity(SAMPLE_ETH_PRICE)} USDC</dd>
        </div>
        <div>
          <dt>Slippage tolerance</dt>
          <dd>0.50%</dd>
        </div>
        <div>
          <dt>Minimum received</dt>
          <dd>{quantity(minimumReceived)} USDC</dd>
        </div>
        <div>
          <dt>Quote expiry</dt>
          <dd className={quoteExpired ? "tx-danger-text" : ""}>
            <Clock3 size={13} aria-hidden="true" />
            {quoteExpired
              ? "Expired"
              : `${Math.floor(quoteSeconds / 60)}:${String(quoteSeconds % 60).padStart(2, "0")} remaining`}
          </dd>
        </div>
      </dl>
      <p>
        Illustrative fixed rate, not a live market quote. The demo credits{" "}
        {quantity(expectedReceived)} USDC after confirmation.
      </p>
      {quoteExpired && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            newQuote()
            setStep("review")
          }}
          disabled={busy}
        >
          Refresh sample quote
        </button>
      )}
    </div>
  )

  if (walletDialog)
    return <WalletModal onClose={() => setWalletDialog(false)} />

  return (
    <Modal
      title={
        step === "success"
          ? `${verb} complete`
          : step === "pending"
            ? "Confirming your transaction"
            : `${verb} ${kind === "swap" ? "ETH for USDC" : asset}`
      }
      eyebrow="Simulated transaction"
      onClose={onClose}
      busy={busy}
    >
      <div className="tx-flow">
        {step !== "success" && step !== "pending" && (
          <>
            <div className="tx-market">
              <div className="tx-market-name">
                {kind === "swap" ? (
                  <TokenIcon asset="ETH" />
                ) : (
                  <ProtocolIcon protocol={market.protocol} />
                )}
                <div>
                  <strong>
                    {kind === "swap" ? "Demo swap" : market.protocol}
                  </strong>
                  <span>
                    {kind === "swap"
                      ? "ETH to USDC"
                      : kind === "withdraw"
                        ? "Your supplied position"
                        : "Supply market"}
                  </span>
                </div>
              </div>
              <ChainBadge chain={market.chain} />
            </div>
            <ol className="tx-steps" aria-label="Transaction progress">
              {steps.map((label, index) => (
                <li
                  key={label}
                  className={`${index < stepIndex ? "is-done" : ""} ${index === stepIndex ? "is-current" : ""}`}
                  aria-current={index === stepIndex ? "step" : undefined}
                >
                  <span>
                    {index < stepIndex ? (
                      <Check size={12} aria-hidden="true" />
                    ) : (
                      index + 1
                    )}
                  </span>
                  {label}
                </li>
              ))}
            </ol>
          </>
        )}

        {step === "amount" && (
          <form
            className="tx-stage"
            onSubmit={(event) => {
              event.preventDefault()
              goReview()
            }}
            noValidate
          >
            <div
              className={`tx-amount-field ${showInputError ? "has-error" : ""}`}
            >
              <label htmlFor={`${id}-amount`}>Amount to {kind}</label>
              <div className="tx-amount-entry">
                <input
                  ref={inputRef}
                  id={`${id}-amount`}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={input}
                  maxLength={28}
                  onChange={(event) => {
                    setInput(event.target.value)
                    setTouched(true)
                    setError("")
                  }}
                  onBlur={() => setTouched(true)}
                  aria-invalid={showInputError}
                  aria-describedby={`${id}-available${showInputError ? ` ${id}-amount-error` : ""}`}
                />
                <span className="tx-asset-label">
                  <TokenIcon asset={asset} small />
                  {asset}
                </span>
              </div>
              <div className="tx-amount-bottom">
                <span>
                  {Number.isFinite(amount) && amount > 0
                    ? money(
                        kind === "swap" ? amount * SAMPLE_ETH_PRICE : amount
                      )
                    : "$0.00"}{" "}
                  <span className="tx-sample-inline">sample value</span>
                </span>
                <button
                  type="button"
                  className="tx-max"
                  onClick={() => {
                    setInput(toInput(available, precision))
                    setTouched(true)
                    setError("")
                  }}
                  disabled={!wallet || available <= 0}
                >
                  Max
                </button>
              </div>
            </div>
            <div className="tx-balance-row" id={`${id}-available`}>
              <span>
                {kind === "withdraw"
                  ? "Available in this position"
                  : "Demo wallet balance"}
              </span>
              <strong>
                {quantity(available, precision)} {asset}
              </strong>
            </div>
            {showInputError && (
              <p
                className="tx-field-error"
                id={`${id}-amount-error`}
                role="alert"
              >
                <CircleAlert size={15} aria-hidden="true" />
                {amountError}
              </p>
            )}
            {kind === "swap" && (
              <div className="tx-swap-receive">
                <ArrowDown size={16} aria-hidden="true" />
                <div>
                  <span>You receive, at the sample rate</span>
                  <strong>
                    {quantity(
                      Number.isFinite(expectedReceived) && expectedReceived > 0
                        ? expectedReceived
                        : 0
                    )}{" "}
                    USDC
                  </strong>
                </div>
                <TokenIcon asset="USDC" small />
              </div>
            )}
            {networkNotice}
            {unsupported && (
              <div className="callout callout-warning">
                This market is research-only. Demo supply is available for the
                supported Aave stablecoin markets.
              </div>
            )}
            <dl className="definition-list tx-preview-list">
              {isSupply && (
                <div>
                  <dt>Current sample supply APY</dt>
                  <dd>
                    {percent(market.apy)}{" "}
                    <span className="muted">Variable</span>
                  </dd>
                </div>
              )}
              <div>
                <dt>Estimated network fee</dt>
                <dd>
                  {money(fee)} <span className="muted">Sample</span>
                </dd>
              </div>
            </dl>
            <p className="tx-quiet-note">
              {kind === "withdraw"
                ? "Withdrawals return sample tokens to your demo wallet. They do not move real funds."
                : kind === "swap"
                  ? "Review the sample rate, slippage limit, and expiry before confirming. No live quote is requested."
                  : "You will review the details and approve only the exact amount before confirming in the demo wallet."}
            </p>
            {wallet ? (
              <button
                className="btn btn-primary tx-primary"
                type="submit"
                disabled={busy || unsupported}
              >
                Review {kind}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            ) : (
              <button
                className="btn btn-primary tx-primary"
                type="button"
                onClick={() => setWalletDialog(true)}
              >
                <Wallet size={17} aria-hidden="true" />
                Connect a demo wallet
              </button>
            )}
          </form>
        )}

        {step === "review" && (
          <section className="tx-stage" aria-labelledby={`${id}-stage`}>
            <h3 id={`${id}-stage`} tabIndex={-1} ref={stepHeadingRef}>
              Review your {kind}
            </h3>
            <div className="tx-review-amount">
              <TokenIcon asset={asset} />
              <div>
                <strong>
                  {quantity(amount, precision)} <span>{asset}</span>
                </strong>
                <span>
                  {kind === "swap"
                    ? `For ${quantity(expectedReceived)} USDC at the sample rate`
                    : kind === "withdraw"
                      ? `From your ${market.protocol} position`
                      : `To ${market.protocol} on ${market.chain}`}
                </span>
              </div>
            </div>
            <dl className="definition-list tx-receipt-list">
              <div>
                <dt>Wallet</dt>
                <dd>
                  {wallet ? shortAddress(wallet.address) : "Disconnected"}
                </dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>
                  <ChainBadge chain={market.chain} />
                </dd>
              </div>
              {isSupply && (
                <div>
                  <dt>Sample supply APY</dt>
                  <dd>
                    {percent(market.apy)}{" "}
                    <span className="muted">Variable</span>
                  </dd>
                </div>
              )}
              {kind === "withdraw" && (
                <div>
                  <dt>Position after withdrawal</dt>
                  <dd>
                    {quantity(Math.max(0, available - amount))} {asset}
                  </dd>
                </div>
              )}
              <div>
                <dt>Token approval</dt>
                <dd>
                  {isSupply ? (
                    approvalValid ? (
                      <span className="tx-positive-text">
                        <Check size={14} aria-hidden="true" />
                        Already approved
                      </span>
                    ) : (
                      `Exactly ${quantity(amount)} ${asset}`
                    )
                  ) : (
                    "Not required"
                  )}
                </dd>
              </div>
              <div>
                <dt>Estimated network fee</dt>
                <dd>
                  {money(fee)} <span className="muted">Sample only</span>
                </dd>
              </div>
            </dl>
            {quoteDetails}
            {networkNotice}
            <div className="tx-safety-note">
              <ShieldCheck size={18} aria-hidden="true" />
              <p>
                {isSupply
                  ? "Supply rates can change. Protocol and stablecoin risks still matter. In this demo, approvals and deposits are local simulations."
                  : kind === "swap"
                    ? "ETH is the native token, so no token spending approval is needed. Sample network fees are not deducted."
                    : "No new token approval is needed to withdraw. Sample network fees are not deducted."}
              </p>
            </div>
            <div className="tx-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setStep("amount")
                  setError("")
                }}
                disabled={busy}
              >
                Edit amount
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={goToWallet}
                disabled={busy || quoteExpired}
              >
                {isSupply && !approvalValid
                  ? "Continue to approval"
                  : "Continue to demo wallet"}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </section>
        )}

        {step === "approval" && (
          <section className="tx-stage" aria-labelledby={`${id}-stage`}>
            <h3 id={`${id}-stage`} tabIndex={-1} ref={stepHeadingRef}>
              Approve a limited allowance
            </h3>
            <p className="tx-stage-description">
              Give the demo adapter permission for this amount only. This step
              does not supply your tokens.
            </p>
            <div className="tx-allowance">
              <span className="tx-allowance-icon">
                <LockKeyhole size={23} aria-hidden="true" />
              </span>
              <div>
                <span>Exact token allowance</span>
                <strong>
                  {quantity(amount)} {asset}
                </strong>
                <span>No unlimited spending permission</span>
              </div>
            </div>
            <dl className="definition-list tx-receipt-list">
              <div>
                <dt>Demo spender</dt>
                <dd>{market.protocol} demo adapter</dd>
              </div>
              <div className="tx-spender-row">
                <dt>Local spender ID</dt>
                <dd>
                  <code>{spender}</code>
                </dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>
                  <ChainBadge chain={market.chain} />
                </dd>
              </div>
              <div>
                <dt>Approval amount</dt>
                <dd>
                  Exactly {quantity(amount)} {asset}
                </dd>
              </div>
              <div>
                <dt>Approval network fee</dt>
                <dd>
                  {money(fee)} <span className="muted">Sample only</span>
                </dd>
              </div>
            </dl>
            {networkNotice}
            <p className="tx-quiet-note">
              The spender ID is a demo identifier, not a contract address. No
              onchain approval, signature, or token transfer is sent.
            </p>
            <div className="tx-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setStep("review")
                  setError("")
                }}
                disabled={busy}
              >
                Back
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={approve}
                disabled={busy}
              >
                {operation === "approval" ? (
                  <>
                    <LoaderCircle
                      className="tx-spin"
                      size={16}
                      aria-hidden="true"
                    />
                    Approving demo allowance...
                  </>
                ) : (
                  `Approve exactly ${quantity(amount)} ${asset}`
                )}
              </button>
            </div>
            {operation === "approval" && (
              <p className="tx-operation-status" role="status">
                Recording your simulated token approval. Balances are unchanged.
              </p>
            )}
          </section>
        )}

        {step === "confirm" && (
          <section className="tx-stage" aria-labelledby={`${id}-stage`}>
            <h3 id={`${id}-stage`} tabIndex={-1} ref={stepHeadingRef}>
              Confirm in the demo wallet
            </h3>
            <p className="tx-stage-description">
              This is a simulated wallet prompt. No extension or external wallet
              will open.
            </p>
            <div className="tx-wallet-request">
              <div className="tx-wallet-request-heading">
                <Wallet size={21} aria-hidden="true" />
                <div>
                  <strong>{wallet?.name ?? "Demo wallet disconnected"}</strong>
                  <span>
                    {wallet
                      ? shortAddress(wallet.address)
                      : "Reconnect to continue"}
                  </span>
                </div>
                <SampleBadge label="Demo request" />
              </div>
              <div className="tx-wallet-request-body">
                <span>You {kind}</span>
                <strong>
                  {quantity(amount, precision)} {asset}
                </strong>
                <span>
                  {kind === "swap"
                    ? `Receive ${quantity(expectedReceived)} USDC`
                    : `${kind === "withdraw" ? "From" : "To"} ${market.protocol}`}
                </span>
              </div>
              <div className="tx-wallet-request-footer">
                <ChainBadge chain={market.chain} />
                <span>{money(fee)} sample fee</span>
              </div>
            </div>
            {isSupply && approvalValid && (
              <div className="tx-approval-saved">
                <CheckCircle2 size={17} aria-hidden="true" />
                <span>
                  {quantity(approval!.amount)} {asset} approved for the demo
                  adapter. Your approval is kept if you retry.
                </span>
              </div>
            )}
            {quoteDetails}
            {networkNotice}
            <div className="tx-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={reject}
                disabled={busy}
              >
                Reject request
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirm}
                disabled={busy || quoteExpired}
              >
                {error
                  ? "Retry simulated confirmation"
                  : `Confirm simulated ${kind}`}
              </button>
            </div>
            <button
              type="button"
              className="btn btn-ghost tx-back-review"
              onClick={() => {
                setStep("review")
                setError("")
              }}
              disabled={busy}
            >
              Back to review
            </button>
          </section>
        )}

        {step === "pending" && (
          <section
            className="tx-status-stage"
            aria-live="polite"
            aria-labelledby={`${id}-stage`}
          >
            <span className="tx-status-icon is-pending">
              <LoaderCircle className="tx-spin" size={34} aria-hidden="true" />
            </span>
            <h3 id={`${id}-stage`} tabIndex={-1} ref={stepHeadingRef}>
              Simulating confirmation
            </h3>
            <p>
              Your demo wallet approved the request. Waiting for the local
              confirmation result.
            </p>
            <div className="tx-pending-summary">
              <TokenIcon asset={asset} small />
              <strong>
                {quantity(amount, precision)} {asset}
              </strong>
              <ChainBadge chain={market.chain} />
            </div>
            <p className="tx-pending-footnote">
              Balances and positions stay unchanged until confirmation finishes.
              No transaction is sent to a network.
            </p>
          </section>
        )}

        {step === "success" && receipt && (
          <section
            className="tx-status-stage"
            aria-live="polite"
            aria-labelledby={`${id}-stage`}
          >
            <span className="tx-status-icon is-success">
              <Check size={33} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <SampleBadge label="Confirmed in demo" />
            <h3 id={`${id}-stage`} tabIndex={-1} ref={stepHeadingRef}>
              {kind === "swap"
                ? "Your sample swap is complete"
                : kind === "withdraw"
                  ? "Back in your demo wallet"
                  : "Your position is ready"}
            </h3>
            <p>
              {kind === "swap"
                ? `${quantity(receipt.amount, precision)} ETH was exchanged for ${quantity(receipt.received)} sample USDC.`
                : kind === "withdraw"
                  ? `${quantity(receipt.amount)} ${asset} was returned from ${market.protocol} to your demo wallet.`
                  : `${quantity(receipt.amount)} ${asset} was supplied to your demo ${market.protocol} position.`}
            </p>
            <dl className="definition-list tx-success-receipt">
              <div>
                <dt>
                  {kind === "swap"
                    ? "USDC received"
                    : kind === "withdraw"
                      ? "Amount withdrawn"
                      : "Amount supplied"}
                </dt>
                <dd>
                  {quantity(
                    kind === "swap" ? receipt.received : receipt.amount,
                    precision
                  )}{" "}
                  {kind === "swap" ? "USDC" : asset}
                </dd>
              </div>
              <div>
                <dt>Network</dt>
                <dd>
                  <ChainBadge chain={market.chain} />
                </dd>
              </div>
              {kind === "withdraw" && (
                <div>
                  <dt>Remaining in position</dt>
                  <dd>
                    {quantity(receipt.remaining)} {asset}
                  </dd>
                </div>
              )}
              <div>
                <dt>Activity record</dt>
                <dd>Saved in this browser</dd>
              </div>
            </dl>
            <button
              type="button"
              className="btn btn-primary tx-primary"
              onClick={onComplete}
            >
              View portfolio
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <p className="tx-pending-footnote">
              This is a local demo record, not an onchain transaction. No real
              funds moved.
            </p>
          </section>
        )}

        {error &&
          step !== "pending" &&
          step !== "success" &&
          !(step === "amount" && error === amountError && showInputError) && (
            <div className="tx-error" role="alert">
              <CircleAlert size={18} aria-hidden="true" />
              <p>{error}</p>
            </div>
          )}
        {step !== "pending" && step !== "success" && (
          <details className="tx-scenarios">
            <summary>
              <FlaskConical size={14} aria-hidden="true" />
              Demo scenarios
              <span>
                {scenario === "normal"
                  ? "Optional"
                  : scenarioUsed
                    ? "Tested"
                    : "Active"}
              </span>
            </summary>
            <div className="tx-scenarios-body">
              <label htmlFor={`${id}-scenario`}>Simulate an outcome</label>
              <select
                className="field"
                id={`${id}-scenario`}
                value={scenario}
                disabled={busy}
                onChange={(event) => {
                  setScenario(event.target.value as Scenario)
                  setScenarioUsed(false)
                  setError("")
                  setTouched(true)
                }}
              >
                <option value="normal">Successful transaction</option>
                <option value="rejection">Wallet rejection</option>
                <option value="insufficient">Insufficient funds</option>
                <option value="simulation">Simulation failure</option>
                <option value="wrong-network">Wrong network</option>
              </select>
              <p>
                {scenarioUsed
                  ? "Scenario tested. Your next attempt uses normal demo behavior. Completed approvals are preserved."
                  : "Each selected failure happens once. It never changes real funds or clears a completed demo approval."}
              </p>
              {scenario === "insufficient" && !scenarioUsed && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={busy}
                  onClick={() => {
                    setScenarioUsed(true)
                    setError("")
                  }}
                >
                  Use available demo balance
                </button>
              )}
            </div>
          </details>
        )}
      </div>
    </Modal>
  )
}
