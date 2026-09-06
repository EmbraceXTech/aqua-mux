// Secondary workspace screens share the research desk's restrained visual style.
// All connections, budgets, and provider earnings below are local simulations.
import { useEffect, useRef, useState } from "react"
import type { FormEvent } from "react"
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpFromLine,
  Check,
  CheckCheck,
  ChevronLeft,
  Clock3,
  Cpu,
  FileText,
  Fingerprint,
  History,
  Info,
  Laptop,
  LoaderCircle,
  LockKeyhole,
  Network,
  Plug,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  Unplug,
  Wallet,
} from "lucide-react"
import {
  marketById,
  money,
  percent,
  protocolUrl,
  SNAPSHOT,
  starters,
} from "@/lib/demo-data"
import type { Market } from "@/lib/demo-data"
import { useWorkspace } from "@/lib/workspace"
import type { Access, Activity, Position } from "@/lib/workspace"
import {
  ChainBadge,
  EmptyState,
  ExternalLink,
  Modal,
  ProtocolIcon,
  SampleBadge,
  Toggle,
  TokenIcon,
} from "./primitives"
import "./workspace-pages.css"

const REQUEST_PRICE = 0.04
const LOCAL_MODELS = {
  "Claude Code": ["Claude Opus", "Claude Sonnet"],
  Codex: ["Codex default"],
}
type LocalProvider = keyof typeof LOCAL_MODELS
const amountText = (value: number, digits = 2) =>
  new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: digits,
  }).format(value)
const roundMoney = (value: number) => Math.round(value * 100) / 100
function dateText(value: string, includeTime = true) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Time unavailable"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...(includeTime ? { hour: "numeric", minute: "2-digit" as const } : {}),
  }).format(date)
}
function parseBudget(value: string): number | null {
  if (!/^(?:\d+(?:\.\d{0,2})?|\.\d{1,2})$/.test(value.trim())) return null
  const amount = Number(value)
  if (
    !Number.isFinite(amount) ||
    !Number.isSafeInteger(Math.round(amount * 100))
  )
    return null
  return amount >= REQUEST_PRICE ? roundMoney(amount) : null
}
function modelsFor(access: Access): string[] {
  const options =
    access.mode === "local" && access.provider in LOCAL_MODELS
      ? LOCAL_MODELS[access.provider as LocalProvider]
      : LOCAL_MODELS["Claude Code"]
  return [...new Set([access.model, ...options])]
}

export function AccessModal({
  onClose,
  onReady,
}: {
  onClose: () => void
  onReady: () => void
}) {
  const { state, setAccess } = useWorkspace()
  const [step, setStep] = useState<
    "choice" | "local" | "paid" | "verifying" | "ready"
  >("choice")
  const [provider, setProvider] = useState<LocalProvider>("Claude Code")
  const [model, setModel] = useState("Claude Opus")
  const [budget, setBudget] = useState(
    state.access?.mode === "paid" ? String(state.access.budget) : "1.00"
  )
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState("")
  const [verificationStage, setVerificationStage] = useState(0)
  const [readyMode, setReadyMode] = useState<"local" | "paid">("local")
  const timers = useRef<number[]>([])
  const previouslySpent = state.access?.mode === "paid" ? state.access.spent : 0
  const budgetAmount = parseBudget(budget)

  useEffect(() => () => timers.current.forEach(window.clearTimeout), [])

  function verifyLocal() {
    setStep("verifying")
    setVerificationStage(0)
    timers.current = [
      window.setTimeout(() => setVerificationStage(1), 600),
      window.setTimeout(() => setVerificationStage(2), 1200),
      window.setTimeout(() => {
        setAccess({
          mode: "local",
          provider,
          model,
          budget: 0,
          spent: 0,
          connected: true,
        })
        setReadyMode("local")
        setStep("ready")
      }, 1800),
    ]
  }

  function approveBudget(event: FormEvent) {
    event.preventDefault()
    if (budgetAmount === null) {
      setError(
        "Enter at least 0.04 USDC, using no more than two decimal places."
      )
      return
    }
    if (roundMoney(budgetAmount - previouslySpent) < REQUEST_PRICE) {
      setError(
        `The cap must cover the ${money(previouslySpent)} already metered and another $0.04 request.`
      )
      return
    }
    if (!approved) {
      setError("Approve the demo spending cap before continuing.")
      return
    }
    setAccess({
      mode: "paid",
      provider: "Cool Bar demo service",
      model: "Claude Opus",
      budget: budgetAmount,
      spent: previouslySpent,
      connected: true,
    })
    setReadyMode("paid")
    setStep("ready")
  }

  const titles = {
    choice: "How should your research run?",
    local: "Use your own subscription",
    paid: "Set your research budget",
    verifying: "Try the connection flow",
    ready:
      readyMode === "local"
        ? "Your demo connection is ready"
        : "Your demo budget is approved",
  }

  return (
    <Modal title={titles[step]} eyebrow="AI access" onClose={onClose}>
      <div className="wp-dialog-content">
        {step === "choice" && (
          <>
            <p className="wp-intro">
              Choose an access method before your first question. Your research
              draft stays right where you left it.
            </p>
            <div className="wp-access-choices">
              <button
                type="button"
                className="wp-access-choice"
                onClick={() => setStep("local")}
              >
                <span className="wp-choice-icon">
                  <Laptop size={23} aria-hidden="true" />
                </span>
                <span>
                  <strong>Use my subscription</strong>
                  <span>Connect through a local CLI on your own device.</span>
                  <small>Claude Code or Codex</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="wp-access-choice"
                onClick={() => setStep("paid")}
              >
                <span className="wp-choice-icon">
                  <Sparkles size={23} aria-hidden="true" />
                </span>
                <span>
                  <strong>Pay per request</strong>
                  <span>
                    Use a Cool Bar-operated research service with a spending
                    cap.
                  </span>
                  <small>Sample price: $0.04 per request</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="wp-trust-note">
              <ShieldCheck size={18} aria-hidden="true" />
              <p>
                This is a local prototype. Neither option connects to an AI
                provider, takes a payment, or requests credentials.
              </p>
            </div>
          </>
        )}

        {step === "local" && (
          <>
            <button
              type="button"
              className="btn btn-ghost wp-back"
              onClick={() => setStep("choice")}
            >
              <ChevronLeft size={15} aria-hidden="true" /> Access options
            </button>
            <div className="wp-form-grid">
              <label className="wp-field" htmlFor="wp-local-provider">
                Local CLI
                <select
                  id="wp-local-provider"
                  value={provider}
                  onChange={(event) => {
                    const next = event.target.value as LocalProvider
                    setProvider(next)
                    setModel(LOCAL_MODELS[next][0])
                  }}
                >
                  {Object.keys(LOCAL_MODELS).map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
              <label className="wp-field" htmlFor="wp-local-model">
                Example model
                <select
                  id="wp-local-model"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                >
                  {LOCAL_MODELS[provider].map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </label>
            </div>
            <ol className="wp-setup-steps">
              <li>
                <span className="wp-step-number">1</span>
                <div>
                  <strong>Connect a local runtime</strong>
                  <p>
                    A production connector would run on your device. No
                    installation command is available in this prototype.
                  </p>
                </div>
              </li>
              <li>
                <span className="wp-step-number">2</span>
                <div>
                  <strong>Verify with a harmless prompt</strong>
                  <p>
                    The example test asks the CLI to reply with READY. The demo
                    below only simulates that check.
                  </p>
                </div>
              </li>
              <li>
                <span className="wp-step-number">3</span>
                <div>
                  <strong>Confirm models and limits</strong>
                  <p>
                    A real connector must report available models,
                    authorization, and usage limits under your provider's terms.
                  </p>
                </div>
              </li>
            </ol>
            <div className="wp-trust-note">
              <LockKeyhole size={18} aria-hidden="true" />
              <p>
                Reusable credentials stay on your device. Cool Bar never asks
                you to paste an API key or session token.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary wp-full-button"
              onClick={verifyLocal}
            >
              <Plug size={17} aria-hidden="true" /> Simulate connection and
              verification
            </button>
            <p className="wp-footnote">
              No CLI is detected or contacted. The selected model is an example,
              not a claim about your account.
            </p>
          </>
        )}

        {step === "verifying" && (
          <>
            <SampleBadge label="Simulated verification" />
            <p className="wp-intro">
              Previewing the {provider} connection flow. No request leaves this
              browser.
            </p>
            <ol
              className="wp-setup-steps wp-verification"
              aria-live="polite"
              aria-atomic="true"
            >
              {[
                "Connect the demo bridge",
                "Simulate the harmless verification prompt",
                "Load the example model selection",
              ].map((label, index) => (
                <li
                  key={label}
                  className={
                    index < verificationStage ? "wp-step-complete" : ""
                  }
                >
                  <span className="wp-step-number">
                    {index < verificationStage ? (
                      <Check size={15} aria-hidden="true" />
                    ) : index === verificationStage ? (
                      <LoaderCircle
                        size={16}
                        className="wp-spinner"
                        aria-hidden="true"
                      />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <p>
                      {index < verificationStage
                        ? "Complete in simulation"
                        : index === verificationStage
                          ? "Preview in progress"
                          : "Waiting"}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <button
              type="button"
              className="btn btn-secondary wp-full-button"
              onClick={() => {
                timers.current.forEach(window.clearTimeout)
                setStep("local")
              }}
            >
              Cancel verification
            </button>
          </>
        )}

        {step === "paid" && (
          <>
            <button
              type="button"
              className="btn btn-ghost wp-back"
              onClick={() => setStep("choice")}
            >
              <ChevronLeft size={15} aria-hidden="true" /> Access options
            </button>
            <div className="wp-price-note">
              <span className="wp-choice-icon">
                <ReceiptText size={23} aria-hidden="true" />
              </span>
              <div>
                <strong>$0.04 per research request</strong>
                <p>Sample pricing for a Cool Bar-operated demo service.</p>
              </div>
              <SampleBadge />
            </div>
            <form className="wp-form" onSubmit={approveBudget} noValidate>
              <label className="wp-field" htmlFor="wp-access-budget">
                Maximum research budget in USDC
                <div className="wp-input-unit">
                  <input
                    id="wp-access-budget"
                    inputMode="decimal"
                    autoComplete="off"
                    value={budget}
                    aria-invalid={Boolean(error)}
                    aria-describedby="wp-budget-help wp-budget-error"
                    onChange={(event) => {
                      setBudget(event.target.value)
                      setApproved(false)
                      setError("")
                    }}
                  />
                  <span>USDC</span>
                </div>
              </label>
              <p className="wp-field-help" id="wp-budget-help">
                This is a total cap, not a deposit. Each completed demo request
                uses $0.04 of the approved allowance. Requests stop before they
                would exceed it.
              </p>
              {previouslySpent > 0 && (
                <p className="wp-field-help">
                  Already metered against this budget: {money(previouslySpent)}.
                </p>
              )}
              <div className="wp-trust-note">
                <Info size={18} aria-hidden="true" />
                <p>
                  Research costs are separate from network fees and protocol
                  transaction costs. A real paid service would settle a Hedera
                  x402 payment and return a receipt. This demo does neither.
                </p>
              </div>
              <label className="wp-checkbox-label">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(event) => setApproved(event.target.checked)}
                />
                <span>
                  I approve this demo spending cap. No funds will be charged or
                  moved.
                </span>
              </label>
              {error && (
                <p className="wp-error" role="alert" id="wp-budget-error">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="btn btn-primary wp-full-button"
                disabled={!approved}
              >
                Approve demo budget <ArrowRight size={17} aria-hidden="true" />
              </button>
            </form>
          </>
        )}

        {step === "ready" && (
          <>
            <div className="wp-ready-icon">
              <CheckCheck size={29} aria-hidden="true" />
            </div>
            <p className="wp-intro">
              {readyMode === "local"
                ? `${provider} and ${model} are selected for this demonstration. No real runtime has been connected.`
                : `Your ${money(state.access?.budget ?? 0)} sample allowance is ready. Each demo request is metered at $0.04. There is no real payment.`}
            </p>
            <div className="wp-trust-note">
              <ShieldCheck size={18} aria-hidden="true" />
              <p>
                You can change access in settings. Portfolio context stays off
                unless you explicitly include it in a request.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary wp-full-button"
              onClick={onReady}
            >
              Continue to research <ArrowRight size={17} aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </Modal>
  )
}

function BudgetDialog({ onClose }: { onClose: () => void }) {
  const { state, setState, toast } = useWorkspace()
  const [amount, setAmount] = useState("1.00")
  const [approved, setApproved] = useState(false)
  const [error, setError] = useState("")
  const addition = parseBudget(amount)
  const access = state.access
  if (!access || access.mode !== "paid") return null

  function confirm(event: FormEvent) {
    event.preventDefault()
    if (
      addition === null ||
      !Number.isSafeInteger(
        Math.round(((access?.budget ?? 0) + addition) * 100)
      )
    ) {
      setError(
        "Enter a valid amount of at least 0.04 USDC, using no more than two decimal places."
      )
      return
    }
    if (!approved) {
      setError("Approve the updated demo budget to continue.")
      return
    }
    setState((current) => ({
      ...current,
      access:
        current.access?.mode === "paid"
          ? {
              ...current.access,
              budget: roundMoney(current.access.budget + addition),
            }
          : current.access,
    }))
    toast("Demo budget increased. No funds were charged.")
    onClose()
  }

  return (
    <Modal
      title="Increase your demo budget"
      eyebrow="Spending controls"
      onClose={onClose}
    >
      <form className="wp-dialog-content" onSubmit={confirm} noValidate>
        <p className="wp-intro">
          Add to your approved allowance. Your metered research costs stay
          unchanged.
        </p>
        <label className="wp-field" htmlFor="wp-budget-add">
          Additional allowance in USDC
          <div className="wp-input-unit">
            <input
              id="wp-budget-add"
              inputMode="decimal"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                setApproved(false)
                setError("")
              }}
              aria-invalid={Boolean(error)}
            />
            <span>USDC</span>
          </div>
        </label>
        <dl className="wp-definition-list">
          <div>
            <dt>Current approved cap</dt>
            <dd>{money(access.budget)}</dd>
          </div>
          <div>
            <dt>New approved cap</dt>
            <dd>
              {addition === null
                ? "Enter an amount"
                : money(access.budget + addition)}
            </dd>
          </div>
          <div>
            <dt>Already metered</dt>
            <dd>{money(access.spent)}</dd>
          </div>
        </dl>
        <label className="wp-checkbox-label">
          <input
            type="checkbox"
            checked={approved}
            onChange={(event) => setApproved(event.target.checked)}
          />
          <span>
            I approve the new sample allowance. This does not transfer USDC.
          </span>
        </label>
        {error && (
          <p className="wp-error" role="alert">
            {error}
          </p>
        )}
        <div className="wp-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!approved}
          >
            Confirm allowance
          </button>
        </div>
      </form>
    </Modal>
  )
}

export function AccessPage({ onSetup }: { onSetup: () => void }) {
  const { state, setAccess, toast } = useWorkspace()
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [disconnectOpen, setDisconnectOpen] = useState(false)
  const access = state.access
  const requests = state.threads
    .flatMap((thread) =>
      thread.messages
        .filter((message) => message.complete)
        .toReversed()
        .map((message) => ({ ...message, thread: thread.title }))
    )
    .slice(0, 6)

  return (
    <div className="wp-page">
      <header className="page-heading wp-page-heading">
        <div>
          <span className="eyebrow">Your workspace</span>
          <h1 className="page-title">AI access</h1>
          <p className="wp-intro">
            Your subscription or a budget you control. The same research desk
            either way.
          </p>
        </div>
        <SampleBadge label="Demo connections" />
      </header>
      <div className="wp-settings-grid">
        <section className="panel wp-panel">
          <div className="wp-panel-heading">
            <div className="wp-title-with-icon">
              <span className="wp-choice-icon">
                {access?.mode === "paid" ? (
                  <Sparkles size={22} aria-hidden="true" />
                ) : (
                  <Laptop size={22} aria-hidden="true" />
                )}
              </span>
              <div>
                <h2>Research connection</h2>
                <p>
                  {access?.connected
                    ? "Ready for local demonstrations"
                    : "Choose how your research runs"}
                </p>
              </div>
            </div>
            <span
              className={`wp-status ${access?.connected ? "wp-status-positive" : ""}`}
            >
              {access?.connected ? "Demo ready" : "Disconnected"}
            </span>
          </div>
          {access?.connected ? (
            <>
              <dl className="wp-definition-list">
                <div>
                  <dt>Access method</dt>
                  <dd>
                    {access.mode === "local"
                      ? "Own subscription"
                      : "Pay per request"}
                  </dd>
                </div>
                <div>
                  <dt>{access.mode === "local" ? "Local CLI" : "Service"}</dt>
                  <dd>{access.provider}</dd>
                </div>
                <div>
                  <dt>Actual connection</dt>
                  <dd>None. Simulation only.</dd>
                </div>
              </dl>
              <label className="wp-field" htmlFor="wp-settings-model">
                Selected example model
                <select
                  id="wp-settings-model"
                  value={access.model}
                  onChange={(event) => {
                    setAccess({ ...access, model: event.target.value })
                    toast("Example model changed for future demo requests.")
                  }}
                >
                  {modelsFor(access).map((model) => (
                    <option key={model}>{model}</option>
                  ))}
                </select>
              </label>
              <p className="wp-field-help">
                Model names are examples. A production connection must report
                the models and limits available to your account.
              </p>
              <div className="wp-inline-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={onSetup}
                >
                  <ArrowLeftRight size={15} aria-hidden="true" /> Change access
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setDisconnectOpen(true)}
                >
                  <Unplug size={15} aria-hidden="true" /> Disconnect
                </button>
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Plug size={27} />}
              title="Give your questions a place to run"
              text="Try an owned CLI connection or approve a per-request demo budget. No provider account, credentials, or payment is needed for this prototype."
              action={
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onSetup}
                >
                  Set up AI access <ArrowRight size={16} aria-hidden="true" />
                </button>
              }
            />
          )}
        </section>
        <section className="panel wp-panel">
          <div className="wp-panel-heading">
            <div>
              <span className="eyebrow">You set the limits</span>
              <h2>
                {access?.mode === "paid"
                  ? "Research allowance"
                  : "Private by default"}
              </h2>
            </div>
            <ShieldCheck size={21} aria-hidden="true" />
          </div>
          {access?.mode === "paid" ? (
            <>
              <SampleBadge />
              <dl className="wp-definition-list wp-financial-list">
                <div>
                  <dt>Approved cap</dt>
                  <dd>{money(access.budget)}</dd>
                </div>
                <div>
                  <dt>Metered demo requests</dt>
                  <dd>{money(access.spent)}</dd>
                </div>
                <div>
                  <dt>Remaining allowance</dt>
                  <dd>
                    {money(
                      Math.max(0, roundMoney(access.budget - access.spent))
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Per-request sample price</dt>
                  <dd>$0.04</dd>
                </div>
              </dl>
              {roundMoney(access.budget - access.spent) < REQUEST_PRICE && (
                <p className="wp-limit-note">
                  Allowance used. Add at least $0.04 before your next paid demo
                  request.
                </p>
              )}
              <button
                type="button"
                className="btn btn-secondary wp-full-button"
                onClick={() => setBudgetOpen(true)}
              >
                <Plus size={16} aria-hidden="true" /> Increase demo budget
              </button>
              <p className="wp-footnote">
                No payment settles in this prototype. Research charges are
                separate from protocol and network costs.
              </p>
            </>
          ) : (
            <>
              <ul className="wp-assurance-list">
                <li>
                  <LockKeyhole size={17} aria-hidden="true" />
                  <div>
                    <strong>Credentials stay on your device</strong>
                    <p>
                      A real local bridge uses your authorized CLI session. Cool
                      Bar does not need the credential.
                    </p>
                  </div>
                </li>
                <li>
                  <Fingerprint size={17} aria-hidden="true" />
                  <div>
                    <strong>You choose the context</strong>
                    <p>
                      Wallet connection never includes your portfolio in a
                      research request by itself.
                    </p>
                  </div>
                </li>
              </ul>
              {access?.mode === "local" && (
                <dl className="wp-definition-list">
                  <div>
                    <dt>Provider usage limits</dt>
                    <dd>Not reported in this demo</dd>
                  </div>
                  <div>
                    <dt>Cool Bar research charge</dt>
                    <dd>None for own-access demos</dd>
                  </div>
                </dl>
              )}
            </>
          )}
        </section>
      </div>
      <section className="panel wp-panel">
        <div className="wp-panel-heading">
          <div>
            <h2>Recent research requests</h2>
            <p>Only requests you completed in this browser.</p>
          </div>
          <History size={20} aria-hidden="true" />
        </div>
        {requests.length ? (
          <ul className="wp-request-list">
            {requests.map((request) => (
              <li key={request.id}>
                <span className="wp-row-icon">
                  <Sparkles size={17} aria-hidden="true" />
                </span>
                <div>
                  <strong>{request.prompt}</strong>
                  <p>
                    {request.model} <span className="wp-text-divider">/</span>{" "}
                    {request.thread}
                  </p>
                </div>
                <span className="wp-request-cost">
                  {request.cost ? money(request.cost) : "No demo charge"}
                  <small>
                    {request.cost ? "Sample cost" : "Local demonstration"}
                  </small>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={<FileText size={24} />}
            title="No research requests yet"
            text="Completed questions will appear here with the example model and any metered demo cost."
          />
        )}
      </section>
      {budgetOpen && <BudgetDialog onClose={() => setBudgetOpen(false)} />}
      {disconnectOpen && (
        <Modal
          title="Disconnect this access method?"
          eyebrow="AI access"
          onClose={() => setDisconnectOpen(false)}
        >
          <div className="wp-dialog-content">
            <p className="wp-intro">
              New research will need access setup again. Your research history
              and metered demo budget will stay in this browser.
            </p>
            <div className="wp-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDisconnectOpen(false)}
              >
                Keep connection
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  if (access) setAccess({ ...access, connected: false })
                  setDisconnectOpen(false)
                  toast(
                    "Demo access disconnected. Your research history is unchanged."
                  )
                }}
              >
                Disconnect access
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

const REFRESH_KEY = "coolbar-position-refresh-v1"
function loadRefreshes(): Record<string, string> {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(REFRESH_KEY) ?? "null"
    )
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === "string"
        )
      )
    }
  } catch {
    /* Local tracking still works when browser storage is unavailable. */
  }
  return {}
}

export function PortfolioPage({
  onConnectWallet,
  onAction,
  onResearch,
}: {
  onConnectWallet: () => void
  onAction: (
    market: Market,
    kind?: "supply" | "withdraw" | "swap",
    positionId?: string
  ) => void
  onResearch: (prompt: string, includePortfolio?: boolean) => void
}) {
  const { state, setState, toast } = useWorkspace()
  const [chain, setChain] = useState("All chains")
  const [protocol, setProtocol] = useState("All protocols")
  const [refreshes, setRefreshes] = useState(loadRefreshes)
  const wallet = state.wallet
  const positions = state.positions.filter(
    (position) =>
      wallet && position.wallet.toLowerCase() === wallet.address.toLowerCase()
  )
  const rows = positions
    .map((position) => ({ position, market: marketById(position.marketId) }))
    .filter((row): row is { position: Position; market: Market } =>
      Boolean(row.market)
    )
  const filtered = rows.filter(
    ({ market }) =>
      (chain === "All chains" || market.chain === chain) &&
      (protocol === "All protocols" || market.protocol === protocol)
  )
  const protocols = [...new Set(rows.map(({ market }) => market.protocol))]
  const totals = rows.reduce<Record<string, number>>(
    (result, { position, market }) => ({
      ...result,
      [market.asset]: (result[market.asset] ?? 0) + position.amount,
    }),
    {}
  )
  const grouped = [
    ...new Set(
      filtered.map(({ market }) => `${market.protocol} / ${market.chain}`)
    ),
  ]

  useEffect(() => {
    try {
      localStorage.setItem(REFRESH_KEY, JSON.stringify(refreshes))
    } catch {
      /* Keep the timestamps for this visit. */
    }
  }, [refreshes])

  function refreshPositions() {
    const now = new Date().toISOString()
    setRefreshes((current) => ({
      ...current,
      ...Object.fromEntries(rows.map(({ position }) => [position.id, now])),
    }))
    toast(
      "Local positions checked against sample data. No on-chain request was made."
    )
  }

  const localNote = (
    <div className="wp-trust-note wp-local-note">
      <Laptop size={18} aria-hidden="true" />
      <p>
        <strong>Tracked in this browser.</strong> Clearing browser data removes
        positions, research history, and local activity. These records are
        simulated positions, not a reconciled on-chain portfolio.
      </p>
    </div>
  )

  return (
    <div className="wp-page">
      <header className="page-heading wp-page-heading">
        <div>
          <span className="eyebrow">Keep the context</span>
          <h1 className="page-title">Portfolio</h1>
          <p className="wp-intro">
            Follow the positions you create here. Decide what your next question
            can see.
          </p>
        </div>
        <SampleBadge />
      </header>
      {!wallet ? (
        <section className="panel wp-panel wp-privacy-panel">
          <EmptyState
            icon={<Wallet size={29} />}
            title="Your portfolio starts with your permission"
            text="Connect a demo wallet to continue. Connecting alone does not read positions or share portfolio context with the research agent."
            action={
              <div className="wp-empty-actions">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onConnectWallet}
                >
                  <Wallet size={17} aria-hidden="true" /> Connect demo wallet
                </button>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => onResearch(starters[0].text, false)}
                >
                  Research without a wallet{" "}
                  <ArrowRight size={15} aria-hidden="true" />
                </button>
              </div>
            }
          />
        </section>
      ) : !state.portfolioAllowed ? (
        <section className="panel wp-panel wp-privacy-panel">
          <div className="wp-permission-icon">
            <Fingerprint size={32} aria-hidden="true" />
          </div>
          <span className="eyebrow">
            Wallet connected. Positions still private.
          </span>
          <h2>Choose whether to read your portfolio</h2>
          <p className="wp-intro">
            Cool Bar can display positions tracked for this demo wallet. This
            does not give the research agent permission to use them.
          </p>
          <div className="wp-connected-wallet">
            <Wallet size={17} aria-hidden="true" />
            <span>{wallet.name}</span>
            <code>
              {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
            </code>
            <ChainBadge chain={wallet.chain} />
          </div>
          <div className="wp-empty-actions">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setState((current) => ({ ...current, portfolioAllowed: true }))
                toast(
                  "Local portfolio display allowed. Agent context is still off by default."
                )
              }}
            >
              Allow demo portfolio reading{" "}
              <ArrowRight size={16} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => onResearch(starters[0].text, false)}
            >
              Keep researching without positions
            </button>
          </div>
          <p className="wp-footnote">
            No actual wallet data is requested. You can revoke this display
            permission at any time.
          </p>
        </section>
      ) : (
        <>
          <div className="wp-consent-bar">
            <span>
              <ShieldCheck size={17} aria-hidden="true" /> Portfolio display
              allowed{" "}
              <span className="wp-consent-detail">
                / Agent context stays off by default
              </span>
            </span>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setState((current) => ({ ...current, portfolioAllowed: false }))
                toast(
                  "Portfolio reading permission revoked. Your local records are preserved."
                )
              }}
            >
              Revoke reading access
            </button>
          </div>
          {rows.length ? (
            <>
              <section className="panel wp-panel wp-portfolio-summary">
                <div>
                  <span className="eyebrow">Locally tracked balances</span>
                  <h2>
                    {rows.length}{" "}
                    {rows.length === 1 ? "active position" : "active positions"}
                  </h2>
                  <p>
                    Supplied principal only. No accrued interest or price
                    conversion is assumed.
                  </p>
                </div>
                <dl className="wp-balance-list">
                  {Object.entries(totals).map(([asset, amount]) => (
                    <div key={asset}>
                      <dt>
                        <TokenIcon asset={asset} small />
                        {asset}
                      </dt>
                      <dd>{amountText(amount)}</dd>
                    </div>
                  ))}
                </dl>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={refreshPositions}
                >
                  <RefreshCw size={15} aria-hidden="true" /> Refresh sample
                  status
                </button>
              </section>
              <div className="wp-filter-bar">
                <div className="wp-filter-controls">
                  <label className="wp-field" htmlFor="wp-portfolio-chain">
                    Chain
                    <select
                      id="wp-portfolio-chain"
                      value={chain}
                      onChange={(event) => setChain(event.target.value)}
                    >
                      {["All chains", "Ethereum", "Base", "Arbitrum"].map(
                        (value) => (
                          <option key={value}>{value}</option>
                        )
                      )}
                    </select>
                  </label>
                  <label className="wp-field" htmlFor="wp-portfolio-protocol">
                    Protocol
                    <select
                      id="wp-portfolio-protocol"
                      value={protocol}
                      onChange={(event) => setProtocol(event.target.value)}
                    >
                      {["All protocols", ...protocols].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <span className="small muted">
                  {filtered.length} of {rows.length} positions
                </span>
              </div>
              {grouped.map((group) => (
                <section key={group} className="wp-position-group">
                  <h2>{group}</h2>
                  <div className="wp-position-list">
                    {filtered
                      .filter(
                        ({ market }) =>
                          `${market.protocol} / ${market.chain}` === group
                      )
                      .map(({ position, market }) => {
                        const opening = state.activity.find(
                          (item) =>
                            item.type === "Supply" && item.id === position.id
                        )
                        return (
                          <article
                            className="panel wp-position"
                            key={position.id}
                          >
                            <header className="wp-position-heading">
                              <div className="wp-title-with-icon">
                                <TokenIcon asset={market.asset} />
                                <div>
                                  <h3>{market.asset} supply</h3>
                                  <span>
                                    <ProtocolIcon
                                      protocol={market.protocol}
                                      small
                                    />
                                    {market.protocol}
                                  </span>
                                </div>
                              </div>
                              <ChainBadge chain={market.chain} />
                              <span className="wp-status wp-status-positive">
                                {position.status} in demo
                              </span>
                            </header>
                            <dl className="wp-position-facts">
                              <div>
                                <dt>Currently supplied</dt>
                                <dd>
                                  {amountText(position.amount)} {market.asset}
                                </dd>
                              </div>
                              <div>
                                <dt>Amount at opening</dt>
                                <dd>
                                  {opening
                                    ? `${amountText(opening.amount)} ${market.asset}`
                                    : "Not recorded"}
                                </dd>
                              </div>
                              <div>
                                <dt>Current sample supply APY</dt>
                                <dd>{percent(market.apy)}</dd>
                              </div>
                            </dl>
                            <div className="wp-position-meta">
                              <span>
                                <Clock3 size={13} aria-hidden="true" /> Opened{" "}
                                {dateText(position.openedAt)}
                              </span>
                              <span>
                                Last local refresh:{" "}
                                {refreshes[position.id]
                                  ? dateText(refreshes[position.id])
                                  : "Not refreshed"}
                              </span>
                              <span>Sample rates observed {SNAPSHOT}</span>
                            </div>
                            <footer className="wp-position-footer">
                              <div>
                                <span className="wp-demo-reference">
                                  Demo reference <code>{position.tx}</code>
                                </span>
                                <ExternalLink
                                  href={protocolUrl(market.protocol)}
                                >
                                  Protocol website
                                </ExternalLink>
                              </div>
                              <div className="wp-inline-actions">
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  onClick={() =>
                                    onResearch(
                                      `Compare ${market.asset} supply on ${market.protocol} ${market.chain} with supported alternatives. Explain withdrawal liquidity, rate changes, and costs.`,
                                      false
                                    )
                                  }
                                >
                                  <Search size={14} aria-hidden="true" />{" "}
                                  Research market
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-secondary"
                                  disabled={!market.executable}
                                  onClick={() =>
                                    onAction(market, "withdraw", position.id)
                                  }
                                >
                                  Withdraw
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-primary"
                                  disabled={!market.executable}
                                  onClick={() => onAction(market, "supply")}
                                >
                                  <Plus size={14} aria-hidden="true" /> Supply
                                </button>
                              </div>
                            </footer>
                          </article>
                        )
                      })}
                  </div>
                </section>
              ))}
              {!filtered.length && (
                <section className="panel wp-panel">
                  <EmptyState
                    icon={<Search size={25} />}
                    title="No positions match these filters"
                    text="Your local positions are still tracked. Clear the filters to see them again."
                    action={
                      <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={() => {
                          setChain("All chains")
                          setProtocol("All protocols")
                        }}
                      >
                        Reset filters
                      </button>
                    }
                  />
                </section>
              )}
              <section className="wp-portfolio-research">
                <div>
                  <Sparkles size={22} aria-hidden="true" />
                  <div>
                    <h2>Ask with your positions in view</h2>
                    <p>
                      This request explicitly includes all {rows.length} locally
                      tracked {rows.length === 1 ? "position" : "positions"} for
                      this wallet, including positions hidden by filters.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() =>
                    onResearch(
                      "Review my tracked positions and compare their current supply rates with supported alternatives. Explain the risks and costs before suggesting any change.",
                      true
                    )
                  }
                >
                  Include positions in research{" "}
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
              </section>
            </>
          ) : (
            <section className="panel wp-panel">
              <EmptyState
                icon={<Wallet size={28} />}
                title="No tracked positions yet"
                text="A position appears here only after you complete a supported wallet simulation. We do not add example holdings to your portfolio."
                action={
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => onResearch(starters[0].text, false)}
                  >
                    Explore USDC opportunities{" "}
                    <ArrowRight size={16} aria-hidden="true" />
                  </button>
                }
              />
            </section>
          )}
          {positions.length > rows.length && (
            <p className="wp-limit-note">
              Some local records reference markets outside the current sample
              coverage. They are preserved, but excluded from totals and
              transaction controls.
            </p>
          )}
        </>
      )}
      {localNote}
    </div>
  )
}

type ConceptInvocation = {
  id: string
  time: string
  model: string
  amount: number
}
const INVOCATIONS_KEY = "coolbar-sharing-invocations-v1"
function loadInvocations(): ConceptInvocation[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(INVOCATIONS_KEY) ?? "[]"
    )
    if (Array.isArray(value))
      return value.filter((item): item is ConceptInvocation =>
        Boolean(
          item &&
          typeof item.id === "string" &&
          typeof item.time === "string" &&
          !Number.isNaN(Date.parse(item.time)) &&
          typeof item.model === "string" &&
          typeof item.amount === "number" &&
          Number.isFinite(item.amount) &&
          item.amount >= 0
        )
      )
  } catch {
    /* Concept interactions still work without browser storage. */
  }
  return []
}

export function SharingPage() {
  const { state, setState, toast } = useWorkspace()
  const [invocations, setInvocations] = useState(loadInvocations)
  const [limit, setLimit] = useState(String(state.sharing.dailyLimit))
  const [limitError, setLimitError] = useState("")
  const [consentOpen, setConsentOpen] = useState(false)
  const [consent, setConsent] = useState(false)
  const [today, setToday] = useState(() =>
    new Date().toISOString().slice(0, 10)
  )
  const [visibleCount, setVisibleCount] = useState(10)
  const sharing = state.sharing
  const todayCount = invocations.filter((item) =>
    item.time.startsWith(today)
  ).length
  const capReached = todayCount >= sharing.dailyLimit

  useEffect(() => {
    try {
      localStorage.setItem(INVOCATIONS_KEY, JSON.stringify(invocations))
    } catch {
      /* Keep the current visit's ledger available. */
    }
  }, [invocations])
  useEffect(() => {
    const timer = window.setInterval(
      () => setToday(new Date().toISOString().slice(0, 10)),
      30000
    )
    return () => window.clearInterval(timer)
  }, [])

  function changeAvailability(next: boolean) {
    if (next) {
      setConsent(false)
      setConsentOpen(true)
      return
    }
    setState((current) => ({
      ...current,
      sharing: { ...current.sharing, enabled: false },
    }))
    toast(
      "Concept sharing stopped. Existing local earnings records are preserved."
    )
  }
  function saveLimit(event: FormEvent) {
    event.preventDefault()
    const value = Number(limit)
    if (
      !/^\d+$/.test(limit.trim()) ||
      !Number.isSafeInteger(value) ||
      value < 1
    ) {
      setLimitError("Enter a whole-number request cap of at least 1.")
      return
    }
    setState((current) => ({
      ...current,
      sharing: { ...current.sharing, dailyLimit: value },
    }))
    setLimitError("")
    toast("Daily cap updated for this local concept.")
  }
  function simulateInvocation() {
    const now = new Date().toISOString()
    const usedToday = invocations.filter((item) =>
      item.time.startsWith(now.slice(0, 10))
    ).length
    if (!sharing.enabled || usedToday >= sharing.dailyLimit) return
    const invocation = {
      id: crypto.randomUUID(),
      time: now,
      model: "Provider-approved research model",
      amount: REQUEST_PRICE,
    }
    setInvocations((current) => [invocation, ...current])
    setState((current) => ({
      ...current,
      sharing: {
        ...current.sharing,
        requests: current.sharing.requests + 1,
        earned: roundMoney(current.sharing.earned + REQUEST_PRICE),
      },
    }))
    toast(
      "Concept invocation recorded with $0.04 in illustrative earnings. No actual request or payment occurred."
    )
  }

  return (
    <div className="wp-page">
      <header className="page-heading wp-page-heading">
        <div>
          <span className="eyebrow">A future access network</span>
          <h1 className="page-title">Shared AI access</h1>
          <p className="wp-intro">
            Explore how provider-approved capacity could be offered with clear
            limits and metering.
          </p>
        </div>
        <SampleBadge label="Architecture concept" />
      </header>
      <div className="wp-concept-notice">
        <Info size={20} aria-hidden="true" />
        <div>
          <strong>
            Provider-approved endpoints only. No subscription resale.
          </strong>
          <p>
            This is a local architecture concept, not an available marketplace.
            It does not share Claude Code or Codex subscriptions, connect a
            runtime, or send paid requests. Provider permission and terms must
            be checked before any real service exists.
          </p>
        </div>
      </div>
      <div className="wp-settings-grid">
        <section className="panel wp-panel">
          <div className="wp-panel-heading">
            <div className="wp-title-with-icon">
              <span className="wp-choice-icon">
                <Network size={23} aria-hidden="true" />
              </span>
              <div>
                <h2>Provider-approved endpoint</h2>
                <p>Example capacity, controlled by its provider</p>
              </div>
            </div>
          </div>
          <div className="wp-sharing-control">
            <div>
              <strong>Accept concept invocations</strong>
              <p>
                {sharing.enabled
                  ? "The local simulator is accepting requests."
                  : "Off. No new concept requests are accepted."}
              </p>
            </div>
            <Toggle
              label="Accept concept invocations"
              checked={sharing.enabled}
              onChange={changeAvailability}
            />
          </div>
          <dl className="wp-definition-list">
            <div>
              <dt>Runtime connection</dt>
              <dd>None. Architecture concept.</dd>
            </div>
            <div>
              <dt>Permitted model</dt>
              <dd>Provider-approved research model</dd>
            </div>
            <div>
              <dt>Availability</dt>
              <dd>
                <span
                  className={`wp-status ${sharing.enabled && !capReached ? "wp-status-positive" : ""}`}
                >
                  {!sharing.enabled
                    ? "Stopped"
                    : capReached
                      ? "Daily demo cap reached"
                      : "Accepting simulated requests"}
                </span>
              </dd>
            </div>
            <div>
              <dt>Settlement</dt>
              <dd>Local record only. No payment.</dd>
            </div>
          </dl>
          <form className="wp-cap-form" onSubmit={saveLimit} noValidate>
            <label className="wp-field" htmlFor="wp-sharing-cap">
              Daily request cap
              <input
                id="wp-sharing-cap"
                inputMode="numeric"
                value={limit}
                onChange={(event) => {
                  setLimit(event.target.value)
                  setLimitError("")
                }}
                aria-invalid={Boolean(limitError)}
                aria-describedby="wp-cap-help"
              />
            </label>
            <button type="submit" className="btn btn-secondary">
              Save cap
            </button>
          </form>
          <p className="wp-field-help" id="wp-cap-help">
            {todayCount} recorded today, out of {sharing.dailyLimit} allowed.
            The local counter uses UTC days. Lowering the cap never removes
            completed records.
          </p>
          {limitError && (
            <p className="wp-error" role="alert">
              {limitError}
            </p>
          )}
          <div className="wp-trust-note">
            <ShieldCheck size={18} aria-hidden="true" />
            <p>
              Stopping rejects new work. Demo invocations finish immediately, so
              there are no in-flight requests to cancel. A production service
              must define cancellation and settlement for work already accepted.
            </p>
          </div>
        </section>
        <section className="panel wp-panel">
          <div className="wp-panel-heading">
            <div>
              <span className="eyebrow">Try the flow</span>
              <h2>Concept metering</h2>
            </div>
            <SampleBadge />
          </div>
          <dl className="wp-definition-list wp-financial-list">
            <div>
              <dt>Recorded invocations</dt>
              <dd>{sharing.requests}</dd>
            </div>
            <div>
              <dt>Illustrative earnings</dt>
              <dd>{money(sharing.earned)}</dd>
            </div>
            <div>
              <dt>Sample earnings per invocation</dt>
              <dd>$0.04</dd>
            </div>
          </dl>
          <button
            type="button"
            className="btn btn-primary wp-full-button"
            disabled={!sharing.enabled || capReached}
            onClick={simulateInvocation}
          >
            <Cpu size={17} aria-hidden="true" /> Simulate invocation
          </button>
          <p className="wp-field-help" aria-live="polite">
            {!sharing.enabled
              ? "Turn on concept invocations to try the metering flow."
              : capReached
                ? "Daily demo cap reached. Increase the cap or wait for the next UTC day."
                : "Adds one local record and $0.04 of sample earnings. No model runs and no payment settles."}
          </p>
          <div className="wp-rule-divider" />
          <h3>What this does not prove</h3>
          <p className="wp-footnote">
            Encryption or trusted execution alone cannot establish provider
            consent, permitted use, billing accountability, or credential
            security. None of those guarantees is implemented here.
          </p>
        </section>
      </div>
      <section className="panel wp-panel">
        <div className="wp-panel-heading">
          <div>
            <h2>Local earnings records</h2>
            <p>Entries appear only when you simulate an invocation.</p>
          </div>
          <ReceiptText size={20} aria-hidden="true" />
        </div>
        {invocations.length ? (
          <>
            <div className="table-scroll wp-table-scroll">
              <table className="wp-table">
                <caption className="wp-sr-only">
                  Simulated provider invocations and illustrative earnings
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Invocation</th>
                    <th scope="col">Recorded</th>
                    <th scope="col">Sample earnings</th>
                    <th scope="col">Settlement</th>
                  </tr>
                </thead>
                <tbody>
                  {invocations.slice(0, visibleCount).map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>Research request</strong>
                        <small className="wp-table-subline">{item.model}</small>
                        <code className="wp-table-subline">
                          concept-{item.id.slice(0, 8)}
                        </code>
                      </td>
                      <td>{dateText(item.time)}</td>
                      <td className="wp-numeric">{money(item.amount)}</td>
                      <td>
                        <span className="wp-status">Simulated only</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {visibleCount < invocations.length && (
              <button
                type="button"
                className="btn btn-secondary wp-load-more"
                onClick={() => setVisibleCount((current) => current + 10)}
              >
                Show more local records
              </button>
            )}
          </>
        ) : (
          <EmptyState
            icon={<ReceiptText size={25} />}
            title="No concept invocations yet"
            text="Opt in above and simulate an invocation to see metering and a local earnings record. No payments or credentials are involved."
          />
        )}
      </section>
      {consentOpen && (
        <Modal
          title="Enable the sharing concept?"
          eyebrow="Architecture concept"
          onClose={() => setConsentOpen(false)}
        >
          <div className="wp-dialog-content">
            <p className="wp-intro">
              This switch only enables local example invocations. It does not
              publish an endpoint, share a subscription, or give anyone access
              to your device.
            </p>
            <label className="wp-checkbox-label">
              <input
                type="checkbox"
                checked={consent}
                onChange={(event) => setConsent(event.target.checked)}
              />
              <span>
                I understand this is a demonstration of provider-approved
                capacity, not consumer subscription resale.
              </span>
            </label>
            <div className="wp-dialog-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConsentOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!consent}
                onClick={() => {
                  setState((current) => ({
                    ...current,
                    sharing: { ...current.sharing, enabled: true },
                  }))
                  setConsentOpen(false)
                  toast(
                    "Sharing concept enabled. No runtime or subscription is connected."
                  )
                }}
              >
                Enable concept
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ActivityIcon({ type }: { type: Activity["type"] }) {
  const Icon = {
    Supply: ArrowDownToLine,
    Withdraw: ArrowUpFromLine,
    Swap: ArrowLeftRight,
    Research: Sparkles,
  }[type]
  return <Icon size={18} aria-hidden="true" />
}

export function ActivityPage() {
  const { state } = useWorkspace()
  const [filter, setFilter] = useState("All activity")
  const [search, setSearch] = useState("")
  const [selected, setSelected] = useState<Activity | null>(null)
  const query = search.trim().toLowerCase()
  const items = state.activity
    .filter(
      (item) =>
        (filter === "All activity" || item.type === filter) &&
        [item.title, item.type, item.chain, item.asset, item.tx].some((value) =>
          value.toLowerCase().includes(query)
        )
    )
    .toSorted((a, b) => Date.parse(b.time) - Date.parse(a.time))

  return (
    <div className="wp-page">
      <header className="page-heading wp-page-heading">
        <div>
          <span className="eyebrow">Your local record</span>
          <h1 className="page-title">Activity</h1>
          <p className="wp-intro">
            Review your research and wallet simulations, without mistaking them
            for on-chain receipts.
          </p>
        </div>
        <SampleBadge label="Simulated activity" />
      </header>
      <div className="wp-activity-toolbar">
        <label className="wp-search-field" htmlFor="wp-activity-search">
          <Search size={17} aria-hidden="true" />
          <span className="wp-sr-only">
            Search activity by title, asset, chain, or reference
          </span>
          <input
            id="wp-activity-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search activity"
          />
        </label>
        <label
          className="wp-field wp-activity-filter"
          htmlFor="wp-activity-filter"
        >
          <span className="wp-sr-only">Activity type</span>
          <select
            id="wp-activity-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            {["All activity", "Research", "Supply", "Withdraw", "Swap"].map(
              (value) => (
                <option key={value}>{value}</option>
              )
            )}
          </select>
        </label>
      </div>
      <section className="panel wp-activity-panel">
        <div className="wp-activity-section-heading">
          <h2>
            {filter === "All activity" ? "All activity" : `${filter} activity`}
          </h2>
          <span className="small muted">
            {items.length} {items.length === 1 ? "record" : "records"}
          </span>
        </div>
        {items.length ? (
          <div className="table-scroll wp-table-scroll">
            <table className="wp-table wp-activity-table">
              <caption className="wp-sr-only">
                Local demo activity. All entries are simulated.
              </caption>
              <thead>
                <tr>
                  <th scope="col">Activity</th>
                  <th scope="col">
                    {filter === "Research"
                      ? "Sample research cost"
                      : "Amount or research cost"}
                  </th>
                  <th scope="col">Chain</th>
                  <th scope="col">Recorded</th>
                  <th scope="col">
                    <span className="wp-sr-only">Inspect record</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="wp-activity-title">
                        <span className="wp-row-icon">
                          <ActivityIcon type={item.type} />
                        </span>
                        <div>
                          <strong>{item.title}</strong>
                          <small className="wp-table-subline">
                            {item.type} simulation
                          </small>
                        </div>
                      </div>
                    </td>
                    <td className="wp-numeric">
                      {amountText(item.amount, item.asset === "ETH" ? 6 : 2)}{" "}
                      <span className="muted">{item.asset}</span>
                    </td>
                    <td>
                      <ChainBadge chain={item.chain} />
                    </td>
                    <td>{dateText(item.time)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        aria-label={`Inspect ${item.title} from ${dateText(item.time)}`}
                        onClick={() => setSelected(item)}
                      >
                        Details <ArrowRight size={14} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            icon={
              state.activity.length ? (
                <Search size={26} />
              ) : (
                <History size={26} />
              )
            }
            title={
              state.activity.length
                ? "No matching activity"
                : "Your activity starts here"
            }
            text={
              state.activity.length
                ? "Try a different search or activity type. Your records have not been removed."
                : "Complete a research request or a wallet simulation. Its local record will appear here, with no invented transaction history."
            }
            action={
              state.activity.length ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setSearch("")
                    setFilter("All activity")
                  }}
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        )}
      </section>
      <div className="wp-trust-note">
        <Laptop size={18} aria-hidden="true" />
        <p>
          This activity is stored in your browser. Clearing browser data removes
          it. Simulated references cannot be looked up on a block explorer.
        </p>
      </div>
      {selected && (
        <Modal
          title={selected.title}
          eyebrow="Local activity record"
          onClose={() => setSelected(null)}
        >
          <div className="wp-dialog-content">
            <SampleBadge label="Simulated record" />
            <dl className="wp-definition-list">
              <div>
                <dt>Activity type</dt>
                <dd>{selected.type}</dd>
              </div>
              <div>
                <dt>
                  {selected.type === "Research"
                    ? "Sample research cost"
                    : "Simulated amount"}
                </dt>
                <dd>
                  {amountText(
                    selected.amount,
                    selected.asset === "ETH" ? 6 : 2
                  )}{" "}
                  {selected.asset}
                </dd>
              </div>
              <div>
                <dt>Chain context</dt>
                <dd>
                  <ChainBadge chain={selected.chain} />
                </dd>
              </div>
              <div>
                <dt>Recorded locally</dt>
                <dd>{dateText(selected.time)}</dd>
              </div>
              <div>
                <dt>Demo reference</dt>
                <dd>
                  <code className="wp-break-reference">
                    {selected.tx || selected.id}
                  </code>
                </dd>
              </div>
            </dl>
            <div className="wp-trust-note">
              <Info size={18} aria-hidden="true" />
              <p>
                {selected.type === "Research"
                  ? "This is a record of a demonstration request. No AI provider or payment service was contacted."
                  : "This is not an on-chain transaction receipt. No tokens moved and no wallet signature was submitted."}{" "}
                There is no explorer link for a simulated reference.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-secondary wp-full-button"
              onClick={() => setSelected(null)}
            >
              Close record
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
