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
  Bell,
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
import { PriceRangeChart } from "./price-range-chart";
import { ManagedWorkspace } from "./managed/managed-workspace";
import { OwnerRecovery } from "./managed/owner-recovery";
import { useManagedSession } from "@/lib/managed-client/use-managed-session";
import { managedRequest } from "@/lib/managed-client/api";
import { useLegacyQuote } from "@/lib/managed-client/use-legacy-quote";
import { catalogTokenResolver } from "@/lib/managed-client/catalog-token";
import { useTokenSearch } from "@/lib/managed-client/use-token-search";
import {
  defaultPairChartState,
  pairChartKey,
  type PairChartState,
} from "@/lib/price-range";
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
  submitPlan,
  batchStatus,
  normalizeBatchStatus,
  type BatchStatus,
} from "@/lib/wallet";
type Leg = { address: Address; bps: number; amount: string };
type TransactionRecord = {
  id: string;
  chainId: number;
  account: Address;
  mode: string;
  submittedAt: number;
  read: boolean;
  status?: BatchStatus;
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
  if (!token.logo) return <span className="token-initial" style={{ width: size, height: size }} aria-label={`${token.symbol} icon`}>{token.symbol.slice(0, 2)}</span>;
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
function NetworkIcon({
  chainId,
  size = 23,
}: {
  chainId: number;
  size?: number;
}) {
  const net = network(chainId);
  const logo =
    "logo" in net
      ? net.logo
      : tokens(chainId).find((item) => item.address === NATIVE)!.logo;
  return (
    <Image
      className="network-icon"
      src={logo}
      alt={`${net.name} token logo`}
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
  const wallet = useManagedSession(chainId);
  const session = wallet.session?.mode === "external" ? wallet.session : undefined;
  const account = session?.owner;
  const [balances, setBalances] = useState<Record<string, string | null>>({}),
    [health, setHealth] = useState<Health>();
  const [picker, setPicker] = useState<"source" | number | null>(null),
    [search, setSearch] = useState(""),
    [chainPicker, setChainPicker] = useState(false),
    [settings, setSettings] = useState(false),
    [walletOpen, setWalletOpen] = useState(false),
    [howOpen, setHowOpen] = useState(false),
    [slippageBps, setSlippageBps] = useState(50),
    [feeBps, setFeeBps] = useState(5);
  const [pairCharts, setPairCharts] = useState<Record<string, PairChartState>>(
    {},
  );
  const [chartPair, setChartPair] = useState<Address>();
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
    [transactions, setTransactions] = useState<TransactionRecord[]>([]),
    [transactionsLoaded, setTransactionsLoaded] = useState(false),
    [activityOpen, setActivityOpen] = useState(false),
    [receiptOpen, setReceiptOpen] = useState(false),
    [copied, setCopied] = useState(false),
    [now, setNow] = useState(0),
    [revision, setRevision] = useState(0);
  const [selectedRegistryTokens, setSelectedRegistryTokens] = useState<Record<number, Token[]>>({});
  const registrySearch = useTokenSearch(chainId, search, picker !== null);
  const requestId = useRef(0),
    healthRequested = useRef(false);
  const n = network(chainId),
    catalog = [...tokens(chainId), ...(selectedRegistryTokens[chainId] ?? []).filter((item) => !tokens(chainId).some((known) => known.address === item.address))],
    src = catalog.find((t) => t.address === source)!,
    base = source === NATIVE ? wrapped(chainId) : src;
  const chartLeg = legs.find((leg) => leg.address === chartPair) ?? legs[0];
  const pairedToken = catalog.find((t) => t.address === chartLeg.address)!;
  const pairKey = pairChartKey(chainId, base.address, pairedToken.address);
  const pairState = pairCharts[pairKey] ?? defaultPairChartState;
  const { fullRange, minPct, maxPct } = pairState;
  const rangeBounds = { minPct, maxPct };
  const derivedOpening =
    Number(amount) > 0 && Number(chartLeg.amount) > 0
      ? Number(chartLeg.amount) / Number(amount)
      : undefined;
  function updatePair(update: (old: PairChartState) => PairChartState) {
    setPairCharts((old) => ({
      ...old,
      [pairKey]: update(old[pairKey] ?? defaultPairChartState),
    }));
  }
  const total = legs.reduce((s, l) => s + l.bps, 0),
    unreadTransactions = transactions.filter(
      (transaction) => !transaction.read,
    ).length,
    basket: Basket = {
      chainId,
      mode,
      source,
      amount,
      legs:
        mode === "liquidity"
          ? legs.map((leg) => {
              const state =
                pairCharts[pairChartKey(chainId, base.address, leg.address)] ??
                defaultPairChartState;
              return {
                ...leg,
                range: state.fullRange
                  ? ("full" as const)
                  : { minPct: state.minPct, maxPct: state.maxPct },
              };
            })
          : legs,
      slippageBps,
      feeBps,
      range: fullRange ? ("full" as const) : rangeBounds,
    };
  const serialized = JSON.stringify(basket);
  const serializedCatalog = JSON.stringify(catalog);
  const [managedOpen, setManagedOpen] = useState(false);
  const { quote, busy: quoteBusy, error: quoteError } = useLegacyQuote({
    enabled: !managedOpen && mode === "swap" && !!health?.swapApiConfigured,
    chainId, basket: serialized, catalog: serializedCatalog, session,
  });
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
    const changed = () => {
      requestId.current += 1;
      setReview(false);
      setPlan(undefined);
      setBalances({});
      setBusy(false);
    };
    const chainChanged = () => {
      requestId.current += 1;
      setPlan(undefined);
      setReview(false);
      setBusy(false);
    };
    p.on?.("accountsChanged", changed);
    p.on?.("chainChanged", chainChanged);
    return () => {
      p.removeListener?.("accountsChanged", changed);
      p.removeListener?.("chainChanged", chainChanged);
    };
  }, []);
  useEffect(() => {
    requestId.current += 1;
    const timer = setTimeout(() => {
      setPlan(undefined);
      setReview(false);
      setBalances({});
    }, 0);
    return () => clearTimeout(timer);
  }, [session]);
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
    const timer = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem("aquamux:transactions");
        const legacy = sessionStorage.getItem("aquamux:last-batch");
        const parsed = saved
          ? JSON.parse(saved)
          : legacy
            ? [JSON.parse(legacy)]
            : [];
        const valid = (Array.isArray(parsed) ? parsed : [])
          .filter((item) => {
            try {
              network(item.chainId);
              return (
                typeof item.id === "string" &&
                /^0x[0-9a-fA-F]{40}$/.test(item.account)
              );
            } catch {
              return false;
            }
          })
          .slice(0, 10)
          .map((item) => ({
            ...item,
            submittedAt: item.submittedAt || Date.now(),
            read: item.read ?? true,
            status: item.status ?? { status: 100 },
          })) as TransactionRecord[];
        setTransactions(valid);
        if (valid[0]) {
          setBatch(valid[0]);
          setStatus(valid[0].status);
        }
      } catch {
        /* Storage may be unavailable in private browser contexts. */
      } finally {
        setTransactionsLoaded(true);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!transactionsLoaded) return;
    try {
      sessionStorage.setItem(
        "aquamux:transactions",
        JSON.stringify(transactions),
      );
    } catch {
      /* The wallet still retains its activity. */
    }
  }, [transactions, transactionsLoaded]);
  useEffect(() => {
    if (!batch) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const s = await batchStatus(batch.id);
        if (!alive) return;
        const outcome = normalizeBatchStatus(s);
        if (outcome === "unknown")
          setError("The wallet response is incomplete. Execution is unknown; check wallet activity before retrying.");
        setStatus(s);
        setTransactions((old) =>
          old.map((transaction) =>
            transaction.id === batch.id
              ? { ...transaction, status: s }
              : transaction,
          ),
        );
        if (outcome === "pending" || outcome === "unknown") timer = setTimeout(poll, outcome === "unknown" ? 8000 : 2500);
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
    setSelectedRegistryTokens((old) => ({ ...old, [chainId]: [...(old[chainId] ?? []).filter((item) => item.address !== t.address), t] }));
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
      const connected = await wallet.connect("external");
      if (connected) setWalletOpen(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function reviewPlan() {
    if (!account || !session) {
      setWalletOpen(true);
      return;
    }
    const id = ++requestId.current;
    try {
      setError("");
      setBusy(true);
      validateBasket(basket, catalogTokenResolver(chainId, catalog));
      const p = await managedRequest<Plan>("/api/plan", session, { basket, account });
      if (id === requestId.current) {
        setPlan(p);
        setReview(true);
      }
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  async function execute() {
    if (!plan || !session || plan.account.toLowerCase() !== session.owner.toLowerCase() || session.expiresAt <= Date.now()) return;
    try {
      setError("");
      setBusy(true);
      if (!transactionsLoaded || transactions.some((transaction) =>
        ["pending", "unknown"].includes(normalizeBatchStatus(transaction.status)),
      )) throw new Error("An earlier transaction is unresolved. Check its status before submitting again.");
      const id = await submitPlan(plan);
      const transaction: TransactionRecord = {
        id,
        chainId: plan.chainId,
        account: plan.account,
        mode: plan.mode,
        submittedAt: Date.now(),
        read: false,
        status: { status: 100 },
      };
      setBatch(transaction);
      setTransactions((old) =>
        [transaction, ...old.filter((item) => item.id !== id)].slice(0, 10),
      );
      setStatus(transaction.status);
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
  const registryCandidates: Token[] = registrySearch.result ? registrySearch.result.items.map((item) => ({ address: item.address, symbol: item.symbol, name: item.name, decimals: item.decimals, logo: tokens(chainId).find((known) => known.address === item.address)?.logo ?? "", source: "1inch registry" })) : catalog;
  if (!registryCandidates.some((item) => item.address === NATIVE)) registryCandidates.unshift(tokens(chainId).find((item) => item.address === NATIVE)!);
  const available = registryCandidates.filter(
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
  const unresolvedTransaction = transactions.find((transaction) =>
    ["pending", "unknown"].includes(normalizeBatchStatus(transaction.status)),
  );
  const blocked = !transactionsLoaded || !!unresolvedTransaction;
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="AquaMux home">
          <Logo />
          <span>
            Aqua<span className="brand-light">Mux</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={!managedOpen && mode === "swap" ? "active" : ""}
            onClick={() => {
              change();
              setMode("swap");
              setManagedOpen(false);
            }}
          >
            Swap
          </button>
          <button
            className={!managedOpen && mode === "liquidity" ? "active" : ""}
            onClick={() => { setManagedOpen(false); selectLiquidity(); }}
          >
            Liquidity
          </button>
          <button className={managedOpen ? "active" : ""} onClick={() => setManagedOpen(true)}>Strategies</button>
        </nav>
        <div className={`header-actions${managedOpen ? " managed-header-hidden" : ""}`}>
          <div className="activity-popover">
            <button
              className="activity-button"
              aria-label={`Recent transactions${unreadTransactions ? `, ${unreadTransactions} unread` : ""}`}
              aria-expanded={activityOpen}
              onClick={() => {
                setActivityOpen((open) => !open);
                setTransactions((old) =>
                  old.map((transaction) => ({ ...transaction, read: true })),
                );
              }}
            >
              <Bell size={17} />
              {unreadTransactions > 0 && (
                <span className="activity-count">{unreadTransactions}</span>
              )}
            </button>
            {activityOpen && (
              <div
                className="activity-menu"
                role="dialog"
                aria-label="Recent transactions"
              >
                <strong>Recent transactions</strong>
                {transactions.length ? (
                  <div className="activity-list">
                    {transactions.map((transaction) => (
                      <button
                        key={transaction.id}
                        onClick={() => {
                          setBatch(transaction);
                          setStatus(transaction.status ?? { status: 100 });
                          setActivityOpen(false);
                          setReceiptOpen(true);
                        }}
                      >
                        <span>
                          <NetworkIcon
                            chainId={transaction.chainId}
                            size={24}
                          />
                          <span>
                            <strong>
                              {transaction.mode === "swap"
                                ? "Multi-swap"
                                : "Liquidity"}
                            </strong>
                            <small>
                              {network(transaction.chainId).name} ·{" "}
                              {new Date(
                                transaction.submittedAt,
                              ).toLocaleString()}
                            </small>
                          </span>
                        </span>
                        <small
                          className={`transaction-state state-${normalizeBatchStatus(transaction.status) === "confirmed" ? 200 : normalizeBatchStatus(transaction.status) === "pending" ? 100 : 500}`}
                        >
                          {normalizeBatchStatus(transaction.status) === "confirmed"
                            ? "Confirmed"
                            : normalizeBatchStatus(transaction.status) === "pending"
                              ? "Pending"
                              : "Check status"}
                        </small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p>No recent transactions.</p>
                )}
              </div>
            )}
          </div>
          <button
            className="network-button"
            onClick={() => setChainPicker(true)}
          >
            <NetworkIcon chainId={chainId} />
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
      <OwnerRecovery key={wallet.session?.owner ?? "anonymous"} session={wallet.session} />
      {managedOpen ? <ManagedWorkspace wallet={wallet} /> : <main className="app-main">
        <div className="intro">
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
                {account ? (
                  <button
                    className="balance-button"
                    disabled={balances[source] == null}
                    onClick={() => {
                      if (balances[source] == null) return;
                      change();
                      setAmount(balances[source]!);
                    }}
                  >
                    Balance: {compact(balances[source])}
                  </button>
                ) : (
                  <span>Wallet not connected</span>
                )}
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
                  <div
                    className={`output-row${
                      mode === "liquidity" ? " liquidity-pair" : ""
                    }${
                      mode === "liquidity" && chartLeg.address === leg.address
                        ? " selected"
                        : ""
                    }`}
                    key={leg.address}
                    onClick={
                      mode === "liquidity"
                        ? (event) => {
                            if (
                              event.target instanceof Element &&
                              event.target.closest("button, input")
                            )
                              return;
                            setChartPair(leg.address);
                          }
                        : undefined
                    }
                  >
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
                        <small>{t.name}</small>
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
                          {account ? (
                            <button
                              className="balance-button output-balance"
                              disabled={balances[t.address] == null}
                              onClick={() => {
                                if (balances[t.address] == null) return;
                                change();
                                setLegs((old) =>
                                  old.map((item, index) =>
                                    index === i
                                      ? {
                                          ...item,
                                          amount: balances[t.address]!,
                                        }
                                      : item,
                                  ),
                                );
                              }}
                            >
                              Balance: {compact(balances[t.address])}
                            </button>
                          ) : (
                            <small>Connect wallet</small>
                          )}
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
            {mode === "swap" && (
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
                normalizeBatchStatus(unresolvedTransaction?.status) === "unknown" ? "Check unresolved transaction" : "Transaction pending"
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
          </section>
          <aside className="sidebar">
            {mode === "liquidity" && (
              <div className="range-control sidebar-range-control">
                <div>
                  <span>Price range</span>
                  <button
                    className="text-button"
                    onClick={() => setSettings(true)}
                  >
                    Fee {feeBps / 100}% <SlidersHorizontal size={12} />
                  </button>
                </div>
                <label className="range-pair-picker">
                  Pair
                  <select
                    aria-label="Price range pair"
                    value={pairedToken.address}
                    onChange={(e) => setChartPair(e.target.value as Address)}
                  >
                    {legs.map((leg) => (
                      <option key={leg.address} value={leg.address}>
                        {base.symbol} /{" "}
                        {catalog.find((t) => t.address === leg.address)!.symbol}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="range-options">
                  {([10, 20] as const).map((r) => (
                    <button
                      key={r}
                      className={
                        pairState.preset === String(r) ? "selected" : ""
                      }
                      onClick={() => {
                        change();
                        updatePair((old) => ({
                          ...old,
                          fullRange: false,
                          minPct: -r,
                          maxPct: r,
                          preset: r === 10 ? "10" : "20",
                        }));
                      }}
                    >
                      {`+/- ${r}%`}
                    </button>
                  ))}
                  {pairState.customBounds && (
                    <button
                      className={pairState.preset === "saved" ? "selected" : ""}
                      onClick={() => {
                        change();
                        updatePair((old) => ({
                          ...old,
                          ...old.customBounds!,
                          fullRange: false,
                          preset: "saved",
                        }));
                      }}
                    >
                      {`+${pairState.customBounds.maxPct}%/${pairState.customBounds.minPct}%`}
                    </button>
                  )}
                  <button
                    className={fullRange ? "selected" : ""}
                    onClick={() => {
                      change();
                      updatePair((old) => ({
                        ...old,
                        fullRange: true,
                        preset: "full",
                      }));
                    }}
                  >
                    Full range
                  </button>
                  <button
                    className={pairState.preset === "custom" ? "selected" : ""}
                    onClick={() => {
                      change();
                      updatePair((old) => ({
                        ...old,
                        fullRange: false,
                        preset: "custom",
                      }));
                    }}
                  >
                    Custom
                  </button>
                </div>
                <PriceRangeChart
                  key={pairKey}
                  chainId={chainId}
                  base={base}
                  paired={pairedToken}
                  bounds={rangeBounds}
                  fullRange={fullRange}
                  period={pairState.period}
                  denomination={pairState.denomination}
                  onPeriodChange={(period) =>
                    updatePair((old) => ({ ...old, period }))
                  }
                  onDenominationChange={(denomination) =>
                    updatePair((old) => ({ ...old, denomination }))
                  }
                  onBoundsChange={(update) => {
                    change();
                    updatePair((old) => {
                      const bounds = update({
                        minPct: old.minPct,
                        maxPct: old.maxPct,
                      });
                      return {
                        ...old,
                        ...bounds,
                        customBounds: bounds,
                        fullRange: false,
                        preset: "custom",
                      };
                    });
                  }}
                  onExitFullRange={() => {
                    change();
                    updatePair((old) => ({
                      ...old,
                      fullRange: false,
                      preset: "custom",
                    }));
                  }}
                  openingPrice={
                    pairState.openingPriceOverride ??
                    (pairState.useMarketPrice ? undefined : derivedOpening)
                  }
                  onOpeningPriceChange={(openingPriceOverride) =>
                    updatePair((old) => ({
                      ...old,
                      openingPriceOverride,
                      useMarketPrice: openingPriceOverride === undefined,
                    }))
                  }
                />
                <small>
                  Each pair has its own bounds around its reserve ratio. Opening
                  price edits preview the chart; reserve amounts determine the
                  registered position.
                </small>
              </div>
            )}
            {mode === "swap" && (
              <section className="flow-card">
                <div className="section-kicker">
                  {mode === "swap" ? "PREVIEW" : "SHARED LIQUIDITY"}
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
            )}
            {mode === "swap" && (
              <section className="details-card">
                <h3>
                  {mode === "swap" ? "Transaction details" : "Position details"}
                </h3>
              <dl>
                <div>
                  <dt>Network</dt>
                  <dd>
                    <NetworkIcon chainId={chainId} size={12} />
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
              {mode === "swap" && health && !health.swapApiConfigured && (
                <p className="api-note">
                  Live quotes need a 1inch API key. Your basket is ready to
                  configure.
                </p>
              )}
              </section>
            )}
            <button className="how-link" onClick={() => setHowOpen(true)}>
              New to shared liquidity? See how it works{" "}
              <ArrowUpRight size={13} />
            </button>
          </aside>
        </div>
      </main>}
      <footer className="app-footer">
        <span>
          <span className="muted">© AquaMux 2026</span>
        </span>
        <div className="bottom-note">
          <Layers3 size={13} /> Powered by{" "}
          <a
            href="https://1inch.com/aqua/overview"
            target="_blank"
            rel="noreferrer"
          >
            <strong>1inch Aqua</strong>
          </a>
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
              <NetworkIcon chainId={net.id} size={30} />
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
        description={`1inch registry metadata for ${n.name}. Listing does not guarantee a usable route.`}
      >
        <input
          autoFocus
          className="search-input"
          aria-label="Search tokens"
          placeholder="Search name, symbol or address"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {registrySearch.error && <p role="alert">Registry unavailable. Showing bundled tokens. {registrySearch.error}</p>}
        <div className="picker-list token-picker">
          {available.map((t) => (
            <button key={t.address} disabled={registrySearch.result?.items.find((item) => item.address === t.address)?.selectable === false} onClick={() => choose(t)}>
              <TokenIcon token={t} />
              <span>
                <strong>{t.symbol}</strong>
                <small>{t.name}</small>
                <small className="managed-address">{t.address}</small>
                <small>{registrySearch.result?.items.find((item) => item.address === t.address)?.risk.replaceAll("_", " ") ?? "Bundled metadata"} / route not checked</small>
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
        description="Connect your Ethereum browser wallet and sign an authentication message to request quotes and plans. Transactions require a separate confirmation and atomic batch support."
      >
        {account ? (
          <>
            <div className="address-box">{account}</div>
            <Button variant="outline" onClick={() => { setWalletOpen(false); setManagedOpen(true); }}>Open managed liquidity</Button>
            <Button
              variant="outline"
              onClick={() => {
                void wallet.disconnect();
                requestId.current += 1;
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
            {busy || wallet.busy ? "Waiting for wallet" : "Connect browser wallet"}
          </Button>
        )}
        {(error || wallet.error) && (
          <p role="alert" className="error-box">
            {error || wallet.error}
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
          normalizeBatchStatus(status) === "confirmed"
            ? "Transaction confirmed"
            : normalizeBatchStatus(status) === "pending"
              ? "Transaction submitted"
              : "Check transaction status"
        }
        description={
          normalizeBatchStatus(status) === "confirmed"
            ? "Review the transaction receipt and its confirmation status."
            : normalizeBatchStatus(status) === "pending"
              ? "Your transaction is submitted. Waiting for confirmation."
              : "Check your wallet activity and transaction receipt."
        }
      >
        {batch && (
          <>
            <div className="receipt-status">
              {normalizeBatchStatus(status) === "confirmed" ? (
                <Check size={35} />
              ) : normalizeBatchStatus(status) === "pending" ? (
                <Loader2 className="spin" size={35} />
              ) : (
                <X size={35} />
              )}
              <p>
                {normalizeBatchStatus(status) === "confirmed"
                  ? "Your wallet reported successful execution."
                  : normalizeBatchStatus(status) === "pending"
                    ? "Waiting for on-chain confirmation."
                    : normalizeBatchStatus(status) === "reverted" ? "The wallet reported a reverted batch. Check the transaction receipt." : "Execution is unknown. The wallet response does not prove a complete atomic result. Check its activity before retrying."}
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
            <Button variant="outline" onClick={() => { setReceiptOpen(false); setManagedOpen(true); }}>Open managed liquidity</Button>
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
            fills, fees, or resolver discovery.
          </p>
        </div>
      </Modal>
    </div>
  );
}
