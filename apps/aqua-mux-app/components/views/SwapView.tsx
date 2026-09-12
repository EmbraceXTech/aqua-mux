"use client";
import { errorMessage } from "@/lib/errors";
import { useCallback, useEffect, useRef, useState } from "react";
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
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { PriceRangeChart } from "../price-range-chart";
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
import { WalletModePicker } from "../wallet-mode-picker";
import { MainLayout } from "../layouts/MainLayout";
import { useSwapWorkspace } from "@/hooks/useSwapWorkspace";
import { TradeHeaderActions } from "../managed/trade-header-actions";
import { TradeOverlays } from "../managed/trade-overlays";

import { NetworkIcon, TokenIcon } from "../managed/token-icon";
import type { Health, Leg, TransactionRecord } from "@/types/swap";
import {
  api,
  compact,
  initialLegs,
  localDevelopmentLegs,
  palette,
  transactionState,
} from "@/lib/utils/swap";
export function SwapView() {
  const trade = useSwapWorkspace();
  const {
    account,
    amount,
    available,
    derivedOpening,
    balances,
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
  } = trade;

  const headerActions = <TradeHeaderActions trade={trade} />;
  return (
    <>
      <MainLayout activePage="swap" actions={headerActions}>
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
          <section className="composer" aria-label="Swap builder">
            <div className="composer-toolbar">
              <div className="mode-tabs">
                <span className="selected">
                  {mode === "swap" ? (
                    <ArrowDownUp size={15} />
                  ) : (
                    <Layers3 size={15} />
                  )}
                  {mode === "swap" ? "Multi-swap" : "Multi-LP"}
                </span>
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
                <label htmlFor="source-amount">You pay</label>
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
                <h2>Your token mix</h2>
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
              disabled={legs.length >= 6 || localDevelopmentWallet}
              onClick={() => {
                setSearch("");
                setPicker(legs.length);
              }}
            >
              <Plus size={16} />
              Add a token
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
                transactionState(unresolvedTransaction?.status) ===
                "unknown" ? (
                  "Check unresolved transaction"
                ) : (
                  "Transaction pending"
                )
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
                      {mode === "swap"
                        ? "Slippage tolerance"
                        : "Pricing engine"}
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
      </MainLayout>
      <TradeOverlays trade={trade} />
    </>
  );
}
