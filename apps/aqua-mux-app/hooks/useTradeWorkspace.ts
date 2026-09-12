"use client";

"use client";
import { errorMessage } from "@/lib/errors";
import { useCallback, useEffect, useRef, useState } from "react";
import { formatUnits, type Address } from "viem";
import { useManagedSession } from "@/lib/managed-client/use-managed-session";
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
import { evenWeights, validateBasket, type Basket } from "@/lib/model";
import {
  walletExecutor,
  type PreparedWalletPlan,
  type WalletExecutionStatus,
  type WalletMode,
} from "@/lib/managed-client/wallet-execution";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import type { Health, Leg, TransactionRecord } from "@/types/swap";
import {
  api,
  compact,
  initialLegs,
  localDevelopmentLegs,
  palette,
  transactionState,
} from "@/lib/utils/swap";
export function useTradeWorkspace(initialMode: "swap" | "liquidity") {
  const [chainId, setChainId] = useState<ChainId>(42161),
    mode = initialMode,
    [source, setSource] = useState<Address>(NATIVE),
    [amount, setAmount] = useState("1"),
    [legs, setLegs] = useState<Leg[]>(() => initialLegs(42161));
  const wallet = useManagedSession(chainId);
  const session = wallet.session;
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
    [reviewed, setReviewed] = useState<PreparedWalletPlan>(),
    [review, setReview] = useState(false),
    [batch, setBatch] = useState<{
      id: string;
      chainId: number;
      account: Address;
      mode: string;
      walletMode: WalletMode;
    }>(),
    [status, setStatus] = useState<WalletExecutionStatus>(),
    [activityOpen, setActivityOpen] = useState(false),
    [receiptOpen, setReceiptOpen] = useState(false),
    [copied, setCopied] = useState(false),
    [now, setNow] = useState(0),
    [revision, setRevision] = useState(0);
  const [selectedRegistryTokens, setSelectedRegistryTokens] = useState<
    Record<number, Token[]>
  >({});
  const plan = reviewed?.plan;
  const onInitialTransaction = useCallback((transaction: TransactionRecord) => {
    setBatch(transaction);
    setStatus(transaction.status ?? { state: "pending" });
  }, []);
  const {
    transactions,
    setTransactions,
    loaded: transactionsLoaded,
  } = useTransactionHistory({ onInitialTransaction });
  const registrySearch = useTokenSearch(chainId, search, picker !== null);
  const requestId = useRef(0),
    healthRequested = useRef(false);
  const n = network(chainId),
    catalog = [
      ...tokens(chainId),
      ...(selectedRegistryTokens[chainId] ?? []).filter(
        (item) =>
          !tokens(chainId).some((known) => known.address === item.address),
      ),
    ],
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
  const {
    quote,
    busy: quoteBusy,
    error: quoteError,
  } = useLegacyQuote({
    enabled: mode === "swap" && !!health?.swapApiConfigured,
    chainId,
    basket: serialized,
    catalog: serializedCatalog,
    session,
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
    if (!session || !walletExecutor(session.mode).observesBrowserWallet) return;
    const provider = window.ethereum;
    if (!provider) return;
    const changed = () => {
      requestId.current += 1;
      setReview(false);
      setReviewed(undefined);
      setBalances({});
      setBusy(false);
    };
    const chainChanged = () => {
      requestId.current += 1;
      setReviewed(undefined);
      setReview(false);
      setBusy(false);
    };
    provider.on?.("accountsChanged", changed);
    provider.on?.("chainChanged", chainChanged);
    return () => {
      provider.removeListener?.("accountsChanged", changed);
      provider.removeListener?.("chainChanged", chainChanged);
    };
  }, [session]);
  useEffect(() => {
    requestId.current += 1;
    const timer = setTimeout(() => {
      setReviewed(undefined);
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
    if (!batch || !session || session.mode !== batch.walletMode) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const next = await walletExecutor(batch.walletMode).status(
          session,
          batch.id,
        );
        if (!alive) return;
        if (next.state === "unknown")
          setError(
            "The wallet response is incomplete. Execution is unknown; check wallet activity before retrying.",
          );
        setStatus(next);
        setTransactions((old) =>
          old.map((transaction) =>
            transaction.id === batch.id
              ? { ...transaction, status: next }
              : transaction,
          ),
        );
        if (next.state === "pending" || next.state === "unknown")
          timer = setTimeout(poll, next.state === "unknown" ? 8000 : 2500);
        else setRevision((value) => value + 1);
      } catch {
        if (alive) {
          setError(
            "Transaction status is unavailable. Check wallet activity before submitting again.",
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
  }, [batch, session]);
  function change() {
    requestId.current++;
    setReviewed(undefined);
    setError("");
    setReview(false);
  }
  function setNetwork(id: ChainId) {
    change();
    setChainId(id);
    setSource(NATIVE);
    setLegs(
      session?.mode === "local-development" && mode === "swap"
        ? localDevelopmentLegs(id)
        : initialLegs(id),
    );
    setBalances({});
    setChainPicker(false);
  }
  function choose(t: Token) {
    setSelectedRegistryTokens((old) => ({
      ...old,
      [chainId]: [
        ...(old[chainId] ?? []).filter((item) => item.address !== t.address),
        t,
      ],
    }));
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
  async function connect(walletMode: WalletMode) {
    try {
      setError("");
      setBusy(true);
      const connected = await wallet.connect(walletMode);
      if (connected) {
        if (connected.mode === "local-development" && mode === "swap") {
          change();
          setSource(NATIVE);
          setLegs(localDevelopmentLegs(chainId));
        }
        setWalletOpen(false);
      }
    } catch (error) {
      setError(errorMessage(error));
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
      const prepared = await walletExecutor(session.mode).prepare(
        session,
        basket,
      );
      if (id === requestId.current) {
        setReviewed(prepared);
        setReview(true);
      }
    } catch (e) {
      if (id === requestId.current) setError(errorMessage(e));
    } finally {
      if (id === requestId.current) setBusy(false);
    }
  }
  async function execute() {
    if (
      !reviewed ||
      !plan ||
      !session ||
      plan.account.toLowerCase() !== session.owner.toLowerCase() ||
      session.expiresAt <= Date.now()
    )
      return;
    try {
      setError("");
      setBusy(true);
      if (
        !transactionsLoaded ||
        transactions.some((transaction) =>
          ["pending", "unknown"].includes(transactionState(transaction.status)),
        )
      )
        throw new Error(
          "An earlier transaction is unresolved. Check its status before submitting again.",
        );
      const submitted = await walletExecutor(session.mode).submit(
        session,
        reviewed,
      );
      const transaction: TransactionRecord = {
        id: submitted.id,
        chainId: plan.chainId,
        account: plan.account,
        mode: plan.mode,
        walletMode: session.mode,
        submittedAt: Date.now(),
        read: false,
        status: submitted.status,
      };
      setBatch(transaction);
      setTransactions((old) =>
        [transaction, ...old.filter((item) => item.id !== submitted.id)].slice(
          0,
          10,
        ),
      );
      setStatus(transaction.status);
      setReview(false);
      setReceiptOpen(true);
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  const selectedPicker =
    typeof picker === "number" ? legs[picker]?.address : undefined;
  const registryCandidates: Token[] = registrySearch.result
    ? registrySearch.result.items.map((item) => ({
        address: item.address,
        symbol: item.symbol,
        name: item.name,
        decimals: item.decimals,
        logo:
          tokens(chainId).find((known) => known.address === item.address)
            ?.logo ?? "",
        source: "1inch registry",
      }))
    : catalog;
  if (!registryCandidates.some((item) => item.address === NATIVE))
    registryCandidates.unshift(
      tokens(chainId).find((item) => item.address === NATIVE)!,
    );
  const localDevelopmentWallet =
    session?.mode === "local-development" && mode === "swap";
  const available = registryCandidates.filter(
    (t) =>
      (!localDevelopmentWallet ||
        (picker === "source"
          ? t.address === NATIVE || t.address === wrapped(chainId).address
          : localDevelopmentLegs(chainId).some(
              (leg) => leg.address === t.address,
            ))) &&
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
    ["pending", "unknown"].includes(transactionState(transaction.status)),
  );
  const blocked = !transactionsLoaded || !!unresolvedTransaction;

  return {
    account,
    amount,
    available,
    balances,
    derivedOpening,
    base,
    batch,
    blocked,
    busy,
    catalog,
    chainId,
    chainPicker,
    change,
    chartLeg,
    choose,
    connect,
    copied,
    error,
    execute,
    feeBps,
    fullRange,
    health,
    howOpen,
    legs,
    localDevelopmentWallet,
    mode,
    n,
    now,
    pairedToken,
    pairKey,
    pairState,
    picker,
    plan,
    quote,
    quoteBusy,
    quoteError,
    rangeBounds,
    receiptOpen,
    registryCandidates,
    registrySearch,
    review,
    reviewed,
    search,
    session,
    settings,
    setAmount,
    setBalances,
    setBatch,
    setChainId,
    setChainPicker,
    setChartPair,
    setCopied,
    setError,
    setFeeBps,
    setHowOpen,
    setLegs,
    setPicker,
    setReceiptOpen,
    setReview,
    setReviewed,
    setSearch,
    setSettings,
    setSlippageBps,
    setSource,
    setNetwork,
    setStatus,
    setTransactions,
    setWalletOpen,
    slippageBps,
    source,
    src,
    status,
    total,
    transactions,
    transactionsLoaded,
    unreadTransactions,
    unresolvedTransaction,
    updatePair,
    wallet,
    walletOpen,
    reviewPlan,
    requestId,
    activityOpen,
    setActivityOpen,
  };
}

export type TradeWorkspace = ReturnType<typeof useTradeWorkspace>;
