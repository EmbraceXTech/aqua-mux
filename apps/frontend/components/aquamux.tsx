"use client";
import { errorMessage } from "@/lib/errors";
import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  Layers3,
  Loader2,
  Plus,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Wallet,
  X,
} from "lucide-react";
import { formatUnits, type Address } from "viem";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";
import {
  networks,
  network,
  tokens,
  wrapped,
  NATIVE,
  type Token,
  type ChainId,
} from "@/lib/config";
import {
  evenWeights,
  validateBasket,
  type Basket,
  type Plan,
} from "@/lib/model";
import {
  connectWallet,
  submitPlan,
  batchStatus,
  type BatchStatus,
} from "@/lib/wallet";
type Leg = { address: Address; bps: number; amount: string };
type Quote = {
  legs: { address: string; amountOut: string; minAmountOut: string }[];
  quotedAt: number;
  expiresAt: number;
};
type Health = {
  networks: {
    id: number;
    online: boolean;
    aqua: boolean;
    swapVm: boolean;
    block?: string;
  }[];
  swapApiConfigured: boolean;
};
const palette = [
  "#356cff",
  "#8b68e8",
  "#21ad91",
  "#ecae44",
  "#dd709a",
  "#69a8d9",
];
function TokenIcon({ token, size = 36 }: { token: Token; size?: number }) {
  return (
    <Image
      className="token-icon"
      src={token.logo}
      alt={`${token.symbol} icon`}
      width={size}
      height={size}
    />
  );
}
function Logo() {
  return (
    <span className="brand-symbol">
      <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <path
          d="M5 25 14 7a2 2 0 0 1 4 0l9 18M10 17h12M16 7v18"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
        <circle cx="5" cy="25" r="3" fill="currentColor" />
        <circle cx="16" cy="25" r="3" fill="currentColor" />
        <circle cx="27" cy="25" r="3" fill="currentColor" />
      </svg>
    </span>
  );
}
const compact = (value: string | undefined | null) =>
  value == null
    ? "Unavailable"
    : Number(value).toLocaleString("en-US", { maximumFractionDigits: 6 });
async function api<T>(url: string, body?: unknown): Promise<T> {
  const r = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const j = await r.json();
  if (!r.ok) throw new Error(j.error ?? "Request failed.");
  return j;
}
function initialLegs(id: number): Leg[] {
  const list = tokens(id);
  const syms =
    id === 4663
      ? ["USDG", "AAPL", "TSLA"]
      : ["USDC", id === 56 ? "BTCB" : "WBTC", "LINK"];
  const chosen = syms
    .map((s) => list.find((t) => t.symbol === s))
    .filter((t): t is Token => !!t);
  if (chosen.length < 3) {
    const t = list.find(
      (t) =>
        t.address !== NATIVE &&
        !chosen.includes(t) &&
        !t.symbol.startsWith("W"),
    );
    if (t) chosen.push(t);
  }
  return chosen.map((t, i) => ({
    address: t.address,
    bps: [5000, 3000, 2000][i],
    amount: "0",
  }));
}
export function AquaMux() {
  const [chainId, setChainId] = useState<ChainId>(42161),
    [mode, setMode] = useState<"swap" | "liquidity">("swap"),
    [source, setSource] = useState<Address>(NATIVE),
    [amount, setAmount] = useState("1"),
    [legs, setLegs] = useState<Leg[]>(() => initialLegs(42161));
  const [account, setAccount] = useState<Address>(),
    [balances, setBalances] = useState<Record<string, string | null>>({}),
    [health, setHealth] = useState<Health>(),
    [quote, setQuote] = useState<Quote>(),
    [quoteBusy, setQuoteBusy] = useState(false),
    [quoteError, setQuoteError] = useState("");
  const [picker, setPicker] = useState<"source" | number | null>(null),
    [search, setSearch] = useState(""),
    [chainPicker, setChainPicker] = useState(false),
    [settings, setSettings] = useState(false),
    [walletOpen, setWalletOpen] = useState(false),
    [howOpen, setHowOpen] = useState(false),
    [slippageBps, setSlippageBps] = useState(50),
    [feeBps, setFeeBps] = useState(5),
    [range, setRange] = useState<0 | 10 | 20 | 50>(20);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [plan, setPlan] = useState<Plan>(),
    [review, setReview] = useState(false),
    [batch, setBatch] = useState<{
      id: string;
      chainId: number;
      account: Address;
      mode: string;
    }>(),
    [status, setStatus] = useState<BatchStatus>(),
    [receiptOpen, setReceiptOpen] = useState(false),
    [copied, setCopied] = useState(false),
    [now, setNow] = useState(0),
    [revision, setRevision] = useState(0);
  const requestId = useRef(0),
    healthRequested = useRef(false);
  const n = network(chainId),
    catalog = tokens(chainId),
    src = catalog.find((t) => t.address === source)!,
    base = source === NATIVE ? wrapped(chainId) : src;
  const total = legs.reduce((s, l) => s + l.bps, 0),
    ready = health?.networks.find((x) => x.id === chainId),
    basket: Basket = {
      chainId,
      mode,
      source,
      amount,
      legs,
      slippageBps,
      feeBps,
      range,
    };
  const serialized = JSON.stringify(basket);
  const portfolio = `https://1inch.com/portfolio/overview/address/${account ?? "0xCDBDE4F92af8Be2117AFAE94F4eF3F5d3B3b39d8"}`;
  useEffect(() => {
    if (healthRequested.current) return;
    healthRequested.current = true;
    api<Health>("/api/networks")
      .then(setHealth)
      .catch(() =>
        setError("Could not check network availability. Refresh to retry."),
      );
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(timer);
      healthRequested.current = false;
    };
  }, []);
  useEffect(() => {
    const p = window.ethereum;
    if (!p) return;
    const changed = (value: unknown) => {
      const a = value as Address[];
      setAccount(a[0]);
      setReview(false);
      setPlan(undefined);
      setBalances({});
    };
    const chainChanged = () => {
      setPlan(undefined);
      setReview(false);
    };
    p.on?.("accountsChanged", changed);
    p.on?.("chainChanged", chainChanged);
    return () => {
      p.removeListener?.("accountsChanged", changed);
      p.removeListener?.("chainChanged", chainChanged);
    };
  }, []);
  useEffect(() => {
    if (!account) return;
    let alive = true;
    api<{ balances: Record<string, string | null> }>(
      `/api/balances?chainId=${chainId}&address=${account}`,
    )
      .then((r) => {
        if (alive) setBalances(r.balances);
      })
      .catch(() => {
        if (alive) setError("Balances could not be loaded.");
      });
    return () => {
      alive = false;
    };
  }, [account, chainId, revision]);
  useEffect(() => {
    let alive = true;
    if (mode !== "swap" || !health?.swapApiConfigured) return;
    const timer = setTimeout(async () => {
      try {
        const b = validateBasket(JSON.parse(serialized));
        setQuoteBusy(true);
        const q = await api<Quote>("/api/quote", b);
        if (alive) setQuote(q);
      } catch (e) {
        if (alive) setQuoteError(errorMessage(e));
      } finally {
        if (alive) setQuoteBusy(false);
      }
    }, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [serialized, health?.swapApiConfigured, mode]);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem("aquamux:last-batch");
        if (!saved) return;
        const parsed = JSON.parse(saved);
        if (
          typeof parsed.id !== "string" ||
          !/^0x[0-9a-fA-F]{40}$/.test(parsed.account)
        )
          return;
        network(parsed.chainId);
        setBatch(parsed);
        setStatus({ status: 100 });
      } catch {
        /* Storage may be unavailable in private browser contexts. */
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!batch) return;
    try {
      sessionStorage.setItem("aquamux:last-batch", JSON.stringify(batch));
    } catch {
      /* The wallet still retains its activity. */
    }
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const s = await batchStatus(batch.id);
        if (!alive) return;
        if (
          s.status === 200 &&
          (s.atomic === false || s.receipts?.some((r) => r.status !== "0x1"))
        ) {
          setStatus({ ...s, status: 500 });
          setError(
            "The wallet returned an inconsistent receipt. Check its activity before retrying.",
          );
          return;
        }
        setStatus(s);
        if (s.status === 100) timer = setTimeout(poll, 2500);
        else setRevision((v) => v + 1);
      } catch {
        if (alive) {
          setError(
            "Batch status is unavailable. Check wallet activity before submitting again.",
          );
          timer = setTimeout(poll, 8000);
        }
      }
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [batch]);
  function change() {
    requestId.current++;
    setQuoteBusy(false);
    setQuoteError("");
    setQuote(undefined);
    setPlan(undefined);
    setError("");
    setReview(false);
  }
  function selectLiquidity() {
    change();
    setMode("liquidity");
    setLegs((old) => {
      const valid = old.filter(
        (l) => l.address !== base.address && l.address !== NATIVE,
      );
      while (valid.length < 2) {
        const next = catalog.find(
          (t) =>
            t.address !== base.address &&
            t.address !== NATIVE &&
            !valid.some((l) => l.address === t.address),
        );
        if (!next) break;
        valid.push({ address: next.address, bps: 0, amount: "0" });
      }
      return valid.map((l, i) => ({ ...l, bps: evenWeights(valid.length)[i] }));
    });
  }
  function setNetwork(id: ChainId) {
    change();
    setChainId(id);
    setSource(NATIVE);
    setLegs(initialLegs(id));
    setBalances({});
    setChainPicker(false);
  }
  function choose(t: Token) {
    change();
    if (picker === "source") {
      setSource(t.address);
      setLegs((old) => {
        const valid = old.filter(
          (l) =>
            l.address !== t.address &&
            !(
              mode === "liquidity" &&
              t.address === NATIVE &&
              l.address === wrapped(chainId).address
            ),
        );
        if (valid.length < 2) {
          const extra = catalog.find(
            (x) =>
              x.address !== t.address &&
              x.address !== NATIVE &&
              x.address !== wrapped(chainId).address &&
              !valid.some((l) => l.address === x.address),
          );
          if (extra)
            valid.push({ address: extra.address, bps: 0, amount: "0" });
        }
        return valid.map((l, i) => ({
          ...l,
          bps: evenWeights(valid.length)[i],
        }));
      });
    } else if (typeof picker === "number") {
      setLegs((old) =>
        picker === old.length
          ? [...old, { address: t.address, bps: 0, amount: "0" }].map(
              (l, i, a) => ({ ...l, bps: evenWeights(a.length)[i] }),
            )
          : old.map((l, i) =>
              i === picker ? { ...l, address: t.address, amount: "0" } : l,
            ),
      );
    }
    setPicker(null);
    setSearch("");
  }
  async function connect() {
    try {
      setError("");
      setBusy(true);
      setAccount(await connectWallet());
      setWalletOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function reviewPlan() {
    if (!account) {
      setWalletOpen(true);
      return;
    }
    const id = ++requestId.current;
    try {
      setError("");
      setBusy(true);
      validateBasket(basket);
      const p = await api<Plan>("/api/plan", { basket, account });
      if (id === requestId.current) {
        setPlan(p);
        setReview(true);
      }
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function execute() {
    if (!plan) return;
    try {
      setError("");
      setBusy(true);
      const id = await submitPlan(plan);
      setBatch({
        id,
        chainId: plan.chainId,
        account: plan.account,
        mode: plan.mode,
      });
      setStatus({ status: 100 });
      setReview(false);
      setReceiptOpen(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const selectedPicker =
    typeof picker === "number" ? legs[picker]?.address : undefined;
  const available = catalog.filter(
    (t) =>
      (picker === "source" ||
        (t.address !== source &&
          !legs.some(
            (l) => l.address === t.address && t.address !== selectedPicker,
          ))) &&
      (mode === "swap" ||
        picker === "source" ||
        (t.address !== NATIVE && t.address !== base.address)) &&
      `${t.symbol} ${t.name} ${t.address}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const blocked = !!batch && status?.status === 100;
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="AquaMux home">
          <Logo />
          <span>
            Aqua<span className="brand-light">Mux</span>
          </span>
          <span className="beta">BETA</span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={mode === "swap" ? "active" : ""}
            onClick={() => {
              change();
              setMode("swap");
            }}
          >
            Swap
          </button>
          <button
            className={mode === "liquidity" ? "active" : ""}
            onClick={selectLiquidity}
          >
            Liquidity
          </button>
          <a href={portfolio} target="_blank" rel="noreferrer">
            Portfolio <ArrowUpRight size={13} />
          </a>
        </nav>
        <div className="header-actions">
          <button
            className="network-button"
            onClick={() => setChainPicker(true)}
          >
            <span
              className="network-icon"
              style={{
                background: n.color,
                color: chainId === 4663 ? "#172700" : "white",
              }}
            >
              {n.mark}
            </span>
            <span>{n.name}</span>
            <ChevronDown size={14} />
          </button>
          <Button
            onClick={() => setWalletOpen(true)}
            variant="outline"
            className="wallet-button"
          >
            <Wallet size={15} />
            {account
              ? `${account.slice(0, 6)}...${account.slice(-4)}`
              : "Connect wallet"}
          </Button>
        </div>
      </header>
      <main>
        <div className="intro">
          <div className="eyebrow">
            <span className="live-dot" /> BUILT ON 1INCH AQUA
          </div>
          <h1>
            One token.
            <br className="mobile-break" /> <span>Many possibilities.</span>
          </h1>
          <p>
            {mode === "swap"
              ? "Build your basket with one transaction. You choose the mix."
              : "One shared balance. Multiple pairs. Liquidity that stays in your wallet."}
          </p>
        </div>
        <div className="workspace">
          <section
            className="composer"
            aria-label={mode === "swap" ? "Swap builder" : "Liquidity builder"}
          >
            <div className="composer-toolbar">
              <div className="mode-tabs">
                <button
                  className={mode === "swap" ? "selected" : ""}
                  onClick={() => {
                    change();
                    setMode("swap");
                  }}
                >
                  <ArrowDownUp size={15} />
                  Multi-swap
                </button>
                <button
                  className={mode === "liquidity" ? "selected" : ""}
                  onClick={selectLiquidity}
                >
                  <Layers3 size={15} />
                  Multi-LP
                </button>
              </div>
              <button
                className="icon-button ghost-button"
                onClick={() => setSettings(true)}
                aria-label="Transaction settings"
              >
                <Settings2 size={18} />
              </button>
            </div>
            <div className="input-panel">
              <div className="field-top">
                <label htmlFor="source-amount">
                  {mode === "swap" ? "You pay" : "Your shared base"}
                </label>
                <span>on {n.name}</span>
              </div>
              <div className="input-main">
                <input
                  id="source-amount"
                  aria-label="Input amount"
                  value={amount}
                  inputMode="decimal"
                  placeholder="0"
                  onChange={(e) => {
                    change();
                    setAmount(e.target.value);
                  }}
                />
                <button
                  className="token-select"
                  onClick={() => {
                    setSearch("");
                    setPicker("source");
                  }}
                >
                  <TokenIcon token={src} size={32} />
                  {src.symbol}
                  <ChevronDown size={16} />
                </button>
              </div>
              <div className="field-bottom">
                <span>
                  {mode === "liquidity"
                    ? `Shared across ${legs.length} pairs`
                    : "Enter the total to split"}
                </span>
                <span>
                  {account
                    ? `Balance: ${compact(balances[source])}`
                    : "Wallet not connected"}
                </span>
              </div>
            </div>
            <div className="split-divider">
              <span />
              <div>
                <ArrowDown size={17} />
              </div>
              <span />
            </div>
            <div className="outputs-heading">
              <div>
                <h2>
                  {mode === "swap" ? "Your token mix" : "Your liquidity pairs"}
                </h2>
                <span>
                  {mode === "swap"
                    ? "Choose tokens and set your allocation"
                    : "Pair each token with the same base balance"}
                </span>
              </div>
              {mode === "swap" && (
                <button
                  className="text-button"
                  onClick={() => {
                    change();
                    setLegs((old) =>
                      old.map((l, i) => ({
                        ...l,
                        bps: evenWeights(old.length)[i],
                      })),
                    );
                  }}
                >
                  Split equally
                </button>
              )}
            </div>
            <div className="output-list">
              {legs.map((leg, i) => {
                const t = catalog.find((t) => t.address === leg.address)!;
                const q =
                  quote && quote.expiresAt > now
                    ? quote.legs.find((q) => q.address === leg.address)
                    : undefined;
                return (
                  <div className="output-row" key={leg.address}>
                    <div
                      className="row-color"
                      style={{ background: palette[i] }}
                    />
                    <button
                      className="output-token"
                      onClick={() => {
                        setSearch("");
                        setPicker(i);
                      }}
                    >
                      <TokenIcon token={t} />
                      <span>
                        <strong>
                          {mode === "liquidity"
                            ? `${base.symbol} / ${t.symbol}`
                            : t.symbol}
                        </strong>
                        <small>
                          {mode === "liquidity"
                            ? `Balance: ${account ? compact(balances[t.address]) : "Connect wallet"}`
                            : t.name}
                        </small>
                      </span>
                      <ChevronDown size={13} />
                    </button>
                    <div className="output-value">
                      {mode === "swap" ? (
                        <>
                          <strong>
                            {quoteBusy ? (
                              <Loader2 size={16} className="spin" />
                            ) : q ? (
                              compact(
                                formatUnits(BigInt(q.amountOut), t.decimals),
                              )
                            ) : (
                              "--"
                            )}
                          </strong>
                          <small>
                            {q ? "Estimated output" : "Awaiting quote"}
                          </small>
                        </>
                      ) : (
                        <>
                          <input
                            aria-label={`${t.symbol} paired amount`}
                            inputMode="decimal"
                            value={leg.amount}
                            onChange={(e) => {
                              change();
                              setLegs((old) =>
                                old.map((l, j) =>
                                  i === j
                                    ? { ...l, amount: e.target.value }
                                    : l,
                                ),
                              );
                            }}
                          />
                          <small>{t.symbol} in your wallet</small>
                        </>
                      )}
                    </div>
                    {mode === "swap" && (
                      <label className="weight">
                        <input
                          aria-label={`${t.symbol} allocation percent`}
                          type="number"
                          min="0.01"
                          max="100"
                          step="0.01"
                          value={leg.bps / 100}
                          onChange={(e) => {
                            change();
                            setLegs((old) =>
                              old.map((l, j) =>
                                i === j
                                  ? {
                                      ...l,
                                      bps: Math.round(
                                        Number(e.target.value) * 100,
                                      ),
                                    }
                                  : l,
                              ),
                            );
                          }}
                        />
                        <span>%</span>
                      </label>
                    )}
                    <button
                      className="remove-token"
                      disabled={legs.length <= 2}
                      aria-label={`Remove ${t.symbol}`}
                      onClick={() => {
                        change();
                        setLegs((old) =>
                          old
                            .filter((_, j) => j !== i)
                            .map((l, j, a) => ({
                              ...l,
                              bps: evenWeights(a.length)[j],
                            })),
                        );
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              className="add-token"
              disabled={legs.length >= 6}
              onClick={() => {
                setSearch("");
                setPicker(legs.length);
              }}
            >
              <Plus size={16} />
              {mode === "swap" ? "Add a token" : "Add a pair"}
              <span>{legs.length} / 6</span>
            </button>
            {mode === "swap" ? (
              <div className="allocation">
                <div className="allocation-bar">
                  {legs.map((l, i) => (
                    <span
                      key={l.address}
                      style={{
                        width: `${(l.bps / (total || 1)) * 100}%`,
                        background: palette[i],
                      }}
                    />
                  ))}
                </div>
                <div className="allocation-caption">
                  <span>Total allocation</span>
                  <strong className={total === 10000 ? "good" : "bad"}>
                    {total / 100}% {total === 10000 && <Check size={13} />}
                  </strong>
                </div>
              </div>
            ) : (
              <div className="range-control">
                <div>
                  <span>Price range</span>
                  <button
                    className="text-button"
                    onClick={() => setSettings(true)}
                  >
                    Fee {feeBps / 100}% <SlidersHorizontal size={12} />
                  </button>
                </div>
                <div className="range-options">
                  {([10, 20, 50, 0] as const).map((r) => (
                    <button
                      key={r}
                      className={range === r ? "selected" : ""}
                      onClick={() => {
                        change();
                        setRange(r);
                      }}
                    >
                      {r ? `+/- ${r}%` : "Full range"}
                    </button>
                  ))}
                </div>
                <small>
                  Relative to your reserve ratio, not a live market price.
                </small>
              </div>
            )}
            <div className="execution-note">
              <ShieldCheck size={16} />
              <span>
                {mode === "swap"
                  ? "All swaps in one atomic transaction"
                  : "Your assets stay in your wallet after registration"}
              </span>
              <button
                aria-label="How AquaMux works"
                onClick={() => setHowOpen(true)}
              >
                i
              </button>
            </div>
            {batch && (
              <button
                className="activity-link"
                onClick={() => setReceiptOpen(true)}
              >
                View latest transaction <ArrowUpRight size={12} />
              </button>
            )}
            {error && (
              <div role="alert" className="error-box">
                {error}
              </div>
            )}
            {quoteError && <div className="error-box">{quoteError}</div>}
            <Button
              className="main-action"
              onClick={reviewPlan}
              disabled={
                busy ||
                blocked ||
                total !== 10000 ||
                !amount ||
                Number(amount) <= 0 ||
                (!!account && mode === "swap" && !health?.swapApiConfigured)
              }
            >
              {busy ? (
                <>
                  <Loader2 size={18} className="spin" />
                  Preparing transaction
                </>
              ) : blocked ? (
                "Transaction pending"
              ) : account ? (
                mode === "swap" ? (
                  "Review multi-swap"
                ) : (
                  "Review liquidity positions"
                )
              ) : (
                "Connect wallet"
              )}
              {!busy && !blocked && <ArrowRight size={17} />}
            </Button>
            <div className="composer-foot">
              {mode === "swap"
                ? `Slippage tolerance ${slippageBps / 100}%`
                : "Approvals and positions are included in the batch"}
              <span className="dot-separator" />
              {legs.length} {mode === "swap" ? "outputs" : "pairs"}
            </div>
          </section>
          <aside className="sidebar">
            <section className="flow-card">
              <div className="section-kicker">
                {mode === "swap" ? "THE BIG PICTURE" : "SHARED LIQUIDITY"}
              </div>
              <h2>
                {mode === "swap"
                  ? "One in. Your mix out."
                  : "Put your balance to work."}
              </h2>
              <p>
                {mode === "swap"
                  ? "Split a single payment across the tokens you choose."
                  : "The same base tokens can back every pair through Aqua."}
              </p>
              <div className="flow-map">
                <div className="flow-source">
                  <TokenIcon token={src} size={34} />
                  <strong>
                    {amount || "0"} {src.symbol}
                  </strong>
                  <small>
                    {mode === "swap" ? "One input" : "One shared balance"}
                  </small>
                </div>
                <div className="flow-trunk" />
                <div
                  className="flow-branches"
                  style={{ "--count": legs.length } as React.CSSProperties}
                >
                  {legs.map((l, i) => {
                    const t = catalog.find((t) => t.address === l.address)!;
                    return (
                      <div className="flow-target" key={t.address}>
                        <div className="branch-line" />
                        <div
                          className="flow-token-ring"
                          style={{ borderColor: palette[i] + "40" }}
                        >
                          <TokenIcon token={t} size={27} />
                        </div>
                        <strong>{t.symbol}</strong>
                        <small style={{ color: palette[i] }}>
                          {mode === "swap"
                            ? `${l.bps / 100}%`
                            : `${base.symbol} pair`}
                        </small>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flow-bottom">
                <Layers3 size={15} />
                <span>
                  {legs.length} {mode === "swap" ? "swaps" : "positions"}
                </span>
                <ArrowRight size={14} />
                <strong>1 transaction</strong>
              </div>
            </section>
            <section className="details-card">
              <h3>
                {mode === "swap" ? "Transaction details" : "Position details"}
              </h3>
              <dl>
                <div>
                  <dt>Network</dt>
                  <dd>
                    <span
                      className="mini-network"
                      style={{ background: n.color }}
                    />
                    {n.name}
                  </dd>
                </div>
                <div>
                  <dt>
                    {mode === "swap" ? "Execution" : "Liquidity protocol"}
                  </dt>
                  <dd>
                    {mode === "swap" ? "1inch Swap" : "1inch Aqua"}
                    <ArrowUpRight size={12} />
                  </dd>
                </div>
                <div>
                  <dt>
                    {mode === "swap" ? "Slippage tolerance" : "Pricing engine"}
                  </dt>
                  <dd>
                    {mode === "swap" ? `${slippageBps / 100}%` : "SwapVM"}
                  </dd>
                </div>
                <div>
                  <dt>{mode === "swap" ? "Network fee" : "Swap fee"}</dt>
                  <dd>
                    {mode === "swap"
                      ? "Calculated by wallet"
                      : `${feeBps / 100}%`}
                  </dd>
                </div>
              </dl>
              <div className="status-note">
                <span
                  className={`live-dot ${ready?.online ? "" : "offline"}`}
                />
                {!health
                  ? "Checking network"
                  : ready?.online && ready.aqua && ready.swapVm
                    ? "Aqua & SwapVM verified on chain"
                    : "Network verification unavailable"}
              </div>
              {mode === "swap" && health && !health.swapApiConfigured && (
                <p className="api-note">
                  Live quotes need a 1inch API key. Your basket is ready to
                  configure.
                </p>
              )}
            </section>
            <a
              className="portfolio-card"
              href={portfolio}
              target="_blank"
              rel="noreferrer"
            >
              <span className="portfolio-icon">
                <ArrowUpRight size={21} />
              </span>
              <div>
                <strong>Your positions, in one place</strong>
                <p>
                  {account
                    ? "Track your portfolio on 1inch"
                    : "Explore the example portfolio on 1inch"}
                </p>
              </div>
              <ExternalLink size={14} />
            </a>
            <button className="how-link" onClick={() => setHowOpen(true)}>
              New to shared liquidity? See how it works{" "}
              <ArrowUpRight size={13} />
            </button>
          </aside>
        </div>
        <div className="bottom-note">
          <Layers3 size={13} /> Powered by <strong>1inch Aqua</strong>
          <span className="dot-separator" />
          Atomic wallet batching.
        </div>
      </main>
      <footer>
        <span>
          AquaMux{" "}
          <span className="muted">/ An independent hackathon project</span>
        </span>
        <div>
          <a
            href="https://business.1inch.com/portal/documentation/aqua/overview"
            target="_blank"
            rel="noreferrer"
          >
            Aqua docs <ArrowUpRight size={12} />
          </a>
          <button onClick={() => setHowOpen(true)}>How it works</button>
        </div>
      </footer>
      <Modal
        open={chainPicker}
        onOpenChange={setChainPicker}
        title="Choose a network"
        description="Every basket executes on one chain."
      >
        <div className="picker-list">
          {networks.map((net) => (
            <button key={net.id} onClick={() => setNetwork(net.id)}>
              <span className="network-icon" style={{ background: net.color }}>
                {net.mark}
              </span>
              <span>
                <strong>{net.name}</strong>
                <small>
                  {health?.networks.find((x) => x.id === net.id)?.online
                    ? "RPC connected"
                    : "Connection unverified"}
                </small>
              </span>
              {net.id === chainId && <Check size={18} />}
            </button>
          ))}
        </div>
      </Modal>
      <Modal
        open={picker !== null}
        onOpenChange={(o) => {
          if (!o) setPicker(null);
        }}
        title={
          picker === "source"
            ? "Choose your input token"
            : "Choose a paired token"
        }
        description={`Verified 1inch token list for ${n.name}.`}
      >
        <input
          autoFocus
          className="search-input"
          aria-label="Search tokens"
          placeholder="Search name, symbol or address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="picker-list token-picker">
          {available.map((t) => (
            <button key={t.address} onClick={() => choose(t)}>
              <TokenIcon token={t} />
              <span>
                <strong>{t.symbol}</strong>
                <small>{t.name}</small>
              </span>
              <small>
                {account
                  ? compact(balances[t.address])
                  : `${t.address.slice(0, 6)}...${t.address.slice(-4)}`}
              </small>
            </button>
          ))}
          {!available.length && <p>No matching tokens on this network.</p>}
        </div>
      </Modal>
      <Modal
        open={settings}
        onOpenChange={setSettings}
        title="Transaction settings"
        description="These values become part of the transaction you review."
      >
        <label className="setting-label">
          Slippage tolerance
          <div className="setting-options">
            {[10, 50, 100].map((v) => (
              <button
                className={slippageBps === v ? "selected" : ""}
                key={v}
                onClick={() => {
                  change();
                  setSlippageBps(v);
                }}
              >
                {v / 100}%
              </button>
            ))}
          </div>
        </label>
        <label className="setting-label">
          LP swap fee
          <div className="setting-options">
            {[5, 30, 100].map((v) => (
              <button
                className={feeBps === v ? "selected" : ""}
                key={v}
                onClick={() => {
                  change();
                  setFeeBps(v);
                }}
              >
                {v / 100}%
              </button>
            ))}
          </div>
        </label>
        <p className="muted small">
          The swap fee is encoded in each SwapVM strategy. Fees are earned only
          when trades fill.
        </p>
      </Modal>
      <Modal
        open={walletOpen}
        onOpenChange={setWalletOpen}
        title={account ? "Your wallet" : "Connect your wallet"}
        description="Use an Ethereum browser wallet. One-transaction execution requires atomic batch support."
      >
        {account ? (
          <>
            <div className="address-box">{account}</div>
            <a
              className="primary-link"
              href={portfolio}
              target="_blank"
              rel="noreferrer"
            >
              View portfolio on 1inch <ArrowUpRight size={16} />
            </a>
            <Button
              variant="outline"
              onClick={() => {
                setAccount(undefined);
                setBalances({});
                setPlan(undefined);
                setWalletOpen(false);
              }}
            >
              Disconnect from AquaMux
            </Button>
          </>
        ) : (
          <Button className="main-action" onClick={connect} disabled={busy}>
            <Wallet size={18} />
            {busy ? "Waiting for wallet" : "Connect browser wallet"}
          </Button>
        )}
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
      </Modal>
      <Modal
        open={review}
        onOpenChange={(o) => {
          if (!busy) setReview(o);
        }}
        title={
          plan?.mode === "swap"
            ? "Review your multi-swap"
            : "Review your Aqua positions"
        }
        description={`${n.name}. All calls execute atomically from your wallet.`}
      >
        {plan && (
          <>
            <div className="review-summary">
              {plan.summary.map((s) => (
                <p key={s}>{s}</p>
              ))}
            </div>
            <ol className="call-list">
              {plan.calls.map((call, i) => (
                <li key={i}>
                  <span>{i + 1}</span>
                  <div>
                    <strong>{call.label}</strong>
                    <small>{call.to}</small>
                  </div>
                </li>
              ))}
            </ol>
            <div className="muted small">
              Review expires in{" "}
              {Math.max(
                0,
                Math.ceil((plan.expiresAt - (now || plan.createdAt)) / 1000),
              )}
              s. Your wallet calculates gas and simulates the batch.
            </div>
            {error && (
              <p role="alert" className="error-box">
                {error}
              </p>
            )}
            <Button
              className="main-action"
              disabled={busy || now > plan.expiresAt}
              onClick={execute}
            >
              {busy ? (
                <Loader2 className="spin" size={18} />
              ) : (
                "Confirm in wallet"
              )}
              <ArrowRight size={16} />
            </Button>
          </>
        )}
      </Modal>
      <Modal
        open={receiptOpen}
        onOpenChange={setReceiptOpen}
        title={
          status?.status === 200
            ? "Transaction confirmed"
            : status?.status === 100
              ? "Transaction submitted"
              : "Check transaction status"
        }
        description={
          status?.status === 200
            ? "View the transaction receipt or open your portfolio."
            : status?.status === 100
              ? "Your transaction is submitted. Waiting for confirmation."
              : "Check your wallet activity and transaction receipt."
        }
      >
        {batch && (
          <>
            <div className="receipt-status">
              {status?.status === 200 ? (
                <Check size={35} />
              ) : status?.status === 100 ? (
                <Loader2 className="spin" size={35} />
              ) : (
                <X size={35} />
              )}
              <p>
                {status?.status === 200
                  ? "Your wallet reported successful execution."
                  : status?.status === 100
                    ? "Waiting for on-chain confirmation."
                    : "The wallet reported a failed or incomplete batch. Check its activity before retrying."}
              </p>
            </div>
            <button
              className="copy-id"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(batch.id);
                  setCopied(true);
                } catch {
                  setError("Could not copy the batch ID.");
                }
              }}
            >
              <Copy size={14} />
              {copied ? "Copied batch ID" : "Copy batch ID"}
            </button>
            {status?.receipts?.map((r) => (
              <a
                className="primary-link"
                key={r.transactionHash}
                href={`${network(batch.chainId).explorer}/tx/${r.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View transaction <ExternalLink size={14} />
              </a>
            ))}
            <a
              className="primary-link"
              href={`https://1inch.com/portfolio/overview/address/${batch.account}`}
              target="_blank"
              rel="noreferrer"
            >
              Track on 1inch <ArrowUpRight size={15} />
            </a>
          </>
        )}
      </Modal>
      <Modal
        open={howOpen}
        onOpenChange={setHowOpen}
        title="How AquaMux works"
        description="A multiplexer for swaps and wallet-backed liquidity."
      >
        <div className="explanation">
          <h3>Multi-swap</h3>
          <p>
            Split an input amount by percentage. AquaMux requests a 1inch route
            for each output and asks your wallet to execute the calls
            atomically. If a leg fails, the whole transaction reverts. SwapVM is
            used for LP pricing; basket swaps use the 1inch Swap API.
          </p>
          <h3>Multi-LP</h3>
          <p>
            Choose a base balance and amounts of paired tokens you already own.
            AquaMux builds one SwapVM strategy per pair and registers them with
            Aqua. Native ETH or BNB is wrapped first. The same base balance
            backs all pairs.
          </p>
          <p>
            Shared allocations are not extra capital. A fill reduces the real
            inventory available to other pairs. Tokens remain in your wallet
            after registration, under an allowance to Aqua.
          </p>
          <h3>One transaction requires wallet support</h3>
          <p>
            AquaMux checks EIP-5792 atomic capability before sending. Wallets
            without it cannot execute this batch. Strategies use 1inch&apos;s
            resolver access check. Registration does not guarantee routing,
            fills, fees, or immediate portfolio indexing.
          </p>
        </div>
      </Modal>
    </div>
  );
}
