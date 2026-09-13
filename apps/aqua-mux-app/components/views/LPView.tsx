"use client";

import {
  ArrowDown,
  ArrowRight,
  ChevronDown,
  Info,
  Layers3,
  Plus,
  Settings2,
  X,
} from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { TradeOverlays } from "@/components/managed/trade-overlays";
import { TokenIcon } from "@/components/managed/token-icon";
import { TradeReviewAction } from "@/components/trade/trade-review-action";
import { LiquidityPriceRangeControl } from "@/components/liquidity/liquidity-price-range-control";
import { useLPWorkspace } from "@/hooks/useLPWorkspace";
import { evenWeights } from "@/lib/model";
import { compact } from "@/lib/utils/swap";
import { defaultPairChartState, pairChartKey } from "@/lib/price-range";
import styles from "@/components/lp-design/lp-design.module.css";
import live from "@/components/liquidity/live-lp.module.css";

const fees = [
  { bps: 1, label: "Stable pairs" },
  { bps: 5, label: "Low volatility" },
  { bps: 30, label: "Standard" },
  { bps: 100, label: "Long-tail" },
];

export function LPView() {
  const trade = useLPWorkspace();
  const { base, src, legs, catalog, amount, account, balances } = trade;
  function picker(index: number | "source") {
    trade.setSearch("");
    trade.setPicker(index);
  }
  function editRange(address: typeof base.address) {
    trade.setChartPair(address);
    requestAnimationFrame(() => {
      const editor = document.getElementById("live-lp-range");
      editor?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      editor?.focus({ preventScroll: true });
    });
  }
  return (
    <div className={`${styles.page} ${live.page}`}>
      <MainLayout activePage="liquidity">
        <div className={styles.container}>
          <div className={styles.intro}>
            <div className={styles.eyebrow}>MULTI-PAIR LIQUIDITY</div>
            <h1>
              One balance. <span>Many markets.</span>
            </h1>
            <p>
              Use the same base balance across several pairs. Set the fee pool
              and price range for each market.
            </p>
          </div>
          <div className={styles.workspace}>
            <section
              className={styles.composer}
              aria-label="Multi-pair liquidity builder"
            >
              <div className={styles.composerHeader}>
                <span>
                  <Layers3 size={17} /> Multi-LP
                </span>
                <button
                  className={styles.settings}
                  onClick={() => trade.setSettings(true)}
                >
                  <Settings2 size={14} /> Position settings
                </button>
              </div>
              <section className={styles.baseCard}>
                <div className={styles.fieldLabel}>
                  <label htmlFor="lp-base-amount">Your shared base</label>
                  <span>{trade.n.name}</span>
                </div>
                <div className={styles.baseValue}>
                  <input
                    id="lp-base-amount"
                    aria-label="Shared base amount"
                    value={amount}
                    inputMode="decimal"
                    placeholder="0"
                    onChange={(event) => {
                      trade.change();
                      trade.setAmount(event.target.value);
                    }}
                  />
                  <button
                    className={styles.baseToken}
                    onClick={() => picker("source")}
                    aria-label="Select shared base token"
                  >
                    <TokenIcon token={src} size={32} />
                    <strong>{src.symbol}</strong>
                    <ChevronDown size={15} />
                  </button>
                </div>
                <div className={styles.fieldFoot}>
                  {account ? (
                    <button
                      disabled={balances[trade.source] == null}
                      onClick={() => {
                        const balance = balances[trade.source];
                        if (balance != null) {
                          trade.change();
                          trade.setAmount(balance);
                        }
                      }}
                    >
                      Balance: {compact(balances[trade.source])} {src.symbol}
                    </button>
                  ) : (
                    <span>Wallet not connected</span>
                  )}
                  <span>Available to every selected pair</span>
                </div>
              </section>
              <div className={styles.divider}>
                <span />
                <i>
                  <ArrowDown size={16} />
                </i>
                <span />
              </div>
              <div className={styles.pairHeading}>
                <div>
                  <h2>Liquidity pairs</h2>
                  <p>
                    Each pair reuses{" "}
                    <strong>
                      {amount || "0"} {base.symbol}
                    </strong>{" "}
                    as its base side.
                  </p>
                </div>
                <span>{legs.length} selected</span>
              </div>
              <div className={styles.pairList}>
                {legs.map((leg, index) => {
                  const token = catalog.find(
                    (item) => item.address === leg.address,
                  )!;
                  const state =
                    trade.pairCharts[
                      pairChartKey(trade.chainId, base.address, leg.address)
                    ] ?? defaultPairChartState;
                  const fee = leg.feeBps ?? trade.feeBps;
                  return (
                    <article
                      key={leg.address}
                      className={`${styles.pairCard} ${trade.chartLeg.address === leg.address ? styles.activePair : ""}`}
                      onClick={() => trade.setChartPair(leg.address)}
                    >
                      <div className={styles.pairTop}>
                        <button
                          className={styles.pairToken}
                          onClick={() => picker(index)}
                          aria-label={`Select paired token ${token.symbol}`}
                        >
                          <span className={styles.pairMarks}>
                            <TokenIcon token={base} size={25} />
                            <TokenIcon token={token} size={25} />
                          </span>
                          <span>
                            <strong>
                              {base.symbol} / {token.symbol}
                            </strong>
                            <small>{token.name}</small>
                          </span>
                          <ChevronDown size={14} />
                        </button>
                        <div className={styles.pairAmount}>
                          <input
                            aria-label={`${token.symbol} paired amount`}
                            inputMode="decimal"
                            value={leg.amount}
                            onChange={(event) => {
                              trade.change();
                              trade.setLegs((old) =>
                                old.map((item, i) =>
                                  i === index
                                    ? { ...item, amount: event.target.value }
                                    : item,
                                ),
                              );
                            }}
                          />
                          {account ? (
                            <button
                              className={live.balance}
                              disabled={balances[token.address] == null}
                              onClick={() => {
                                const balance = balances[token.address];
                                if (balance != null) {
                                  trade.change();
                                  trade.setLegs((old) =>
                                    old.map((item, i) =>
                                      i === index
                                        ? { ...item, amount: balance }
                                        : item,
                                    ),
                                  );
                                }
                              }}
                            >
                              Balance: {compact(balances[token.address])}
                            </button>
                          ) : (
                            <small>{token.symbol} deposit</small>
                          )}
                        </div>
                        <button
                          className={styles.remove}
                          aria-label={`Remove ${token.symbol}`}
                          disabled={legs.length <= 2}
                          onClick={(event) => {
                            event.stopPropagation();
                            trade.change();
                            trade.setLegs((old) =>
                              old
                                .filter((_, i) => i !== index)
                                .map((item, i, items) => ({
                                  ...item,
                                  bps: evenWeights(items.length)[i],
                                })),
                            );
                          }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className={styles.poolRow}>
                        <div className={styles.poolCopy}>
                          <Settings2 size={13} />
                          <span>
                            <strong>Fee pool</strong>
                            <small>
                              {fees.find((item) => item.bps === fee)?.label ??
                                `${fee / 100}% custom`}{" "}
                              fee tier
                            </small>
                          </span>
                        </div>
                        <div
                          className={styles.feeOptions}
                          role="group"
                          aria-label={`${token.symbol} fee pool`}
                        >
                          {fees.map(({ bps }) => (
                            <button
                              key={bps}
                              aria-pressed={fee === bps}
                              className={fee === bps ? styles.activeFee : ""}
                              onClick={() => {
                                trade.change();
                                trade.setLegs((old) =>
                                  old.map((item, i) =>
                                    i === index
                                      ? { ...item, feeBps: bps }
                                      : item,
                                  ),
                                );
                              }}
                            >
                              {bps / 100}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className={styles.pairMeta}>
                        <span>
                          <Info size={12} />{" "}
                          {state.fullRange
                            ? "Full range"
                            : `${state.minPct}% to +${state.maxPct}% around reserve ratio`}
                        </span>
                        <button onClick={() => editRange(leg.address)}>
                          Edit range <ArrowRight size={12} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              <button
                className={styles.addPair}
                disabled={legs.length >= 6}
                onClick={() => picker(legs.length)}
              >
                <Plus size={15} /> Add liquidity pair{" "}
                <span>{legs.length} / 6</span>
              </button>
              <div className={styles.atomic}>
                <Layers3 size={13} /> One registration batch. Your assets remain
                in your wallet.
              </div>
              {trade.error && (
                <div role="alert" className="error-box">
                  {trade.error}
                </div>
              )}
              <TradeReviewAction
                trade={trade}
                reviewLabel="Review liquidity positions"
                reviewUnavailable={legs.some(
                  (leg) =>
                    !Number.isFinite(Number(leg.amount)) ||
                    Number(leg.amount) <= 0,
                )}
              />
              <p className={styles.noWallet}>
                Review token approvals and positions before signing.
              </p>
            </section>
            <aside className={styles.sidebar}>
              <section
                id="live-lp-range"
                tabIndex={-1}
                className={`${styles.rangeCard} ${live.range}`}
              >
                <div className={styles.rangeHeader}>
                  <div>
                    <span>PRICE RANGE</span>
                    <h2>
                      {base.symbol} / {trade.pairedToken.symbol}
                    </h2>
                  </div>
                </div>
                <div className={styles.pairTabs}>
                  {legs.map((leg) => {
                    const token = catalog.find(
                      (item) => item.address === leg.address,
                    )!;
                    return (
                      <button
                        key={leg.address}
                        aria-pressed={trade.chartLeg.address === leg.address}
                        className={
                          trade.chartLeg.address === leg.address
                            ? styles.activeTab
                            : ""
                        }
                        onClick={() => trade.setChartPair(leg.address)}
                      >
                        <TokenIcon token={token} size={20} />
                        {token.symbol}
                      </button>
                    );
                  })}
                </div>
                <LiquidityPriceRangeControl trade={trade} />
              </section>
              <section className={styles.positionNote}>
                <span>
                  <Layers3 size={15} />
                </span>
                <div>
                  <strong>Shared base, separate pools</strong>
                  <p>
                    Each paired token gets its own fee tier and range.{" "}
                    {base.symbol} is not split across pairs. Fills in one pair
                    change the backing available to the others.
                  </p>
                </div>
              </section>
              <button
                className="how-link"
                onClick={() => trade.setHowOpen(true)}
              >
                How shared liquidity works <ArrowRight size={13} />
              </button>
            </aside>
          </div>
        </div>
      </MainLayout>
      <TradeOverlays trade={trade} />
    </div>
  );
}
