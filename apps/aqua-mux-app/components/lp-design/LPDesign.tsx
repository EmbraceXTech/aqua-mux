"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Popover } from "@base-ui/react/popover";
import Link from "next/link";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronDown,
  FlaskConical,
  Info,
  Layers3,
  Plus,
  Settings2,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import styles from "./lp-design.module.css";
import { RangeChart } from "./RangeChart";
import { presetRange, selectedPreset, validRange } from "./range-model";

type Pair = {
  symbol: string;
  name: string;
  mark: string;
  color: string;
  amount: string;
  fee: "0.01" | "0.05" | "0.3" | "1";
  low: number;
  high: number;
  price: number;
  fullRange?: boolean;
};

const tokenChoices = [
  { symbol: "USDC", name: "USD Coin", mark: "$", color: "#2775ca" },
  { symbol: "ARB", name: "Arbitrum", mark: "A", color: "#2c80c9" },
  { symbol: "wstETH", name: "Wrapped stETH", mark: "S", color: "#00a3ff" },
  { symbol: "GMX", name: "GMX", mark: "G", color: "#4c81df" },
];

const startingPairs: Pair[] = tokenChoices.slice(0, 2).map((token, index) => ({
  ...token,
  amount: index === 0 ? "1,825" : "1,140",
  fee: index === 0 ? "0.05" : "0.3",
  low: index === 0 ? 1.051 : 0.00036,
  high: index === 0 ? 1.118 : 0.00048,
  price: index === 0 ? 1.0845 : 0.00042,
}));

function TokenMark({
  mark,
  color,
  small = false,
}: {
  mark: string;
  color: string;
  small?: boolean;
}) {
  return (
    <span
      className={`${styles.tokenMark} ${small ? styles.smallMark : ""}`}
      style={{ background: color }}
    >
      {mark}
    </span>
  );
}

function feeCopy(fee: Pair["fee"]) {
  return fee === "0.01"
    ? "Stable pairs"
    : fee === "0.05"
      ? "Low volatility"
      : fee === "0.3"
        ? "Standard"
        : "Long-tail";
}

function formatPairPrice(price: number) {
  return price.toLocaleString("en-US", { maximumFractionDigits: 8 });
}

function RangePopover({
  pair,
  children,
  chart = false,
  disabled = false,
  onEdit,
}: {
  pair: Pair;
  children: ReactNode;
  chart?: boolean;
  disabled?: boolean;
  onEdit: () => void;
}) {
  const [inverse, setInverse] = useState(false);
  const [open, setOpen] = useState(false);
  if (disabled && open) setOpen(false);
  const valid =
    pair.low >= 0 && pair.high > pair.low && Number.isFinite(pair.high);
  const inRange =
    pair.fullRange ||
    (valid && pair.price >= pair.low && pair.price <= pair.high);
  const unit = inverse ? `ETH / ${pair.symbol}` : `${pair.symbol} / ETH`;
  function price(value: number) {
    const converted = inverse ? 1 / value : value;
    return Number.isFinite(converted) ? formatPairPrice(converted) : "∞";
  }
  function distance(value: number) {
    const percent = inverse
      ? ((1 / value - 1 / pair.price) / (1 / pair.price)) * 100
      : ((value - pair.price) / pair.price) * 100;
    if (!Number.isFinite(percent)) return "∞";
    return `${percent > 0 ? "+" : ""}${percent.toFixed(2)}%`;
  }
  const low = pair.fullRange ? 0 : pair.low;
  const high = pair.fullRange ? Infinity : pair.high;

  return (
    <Popover.Root open={open && !disabled} onOpenChange={setOpen}>
      <Popover.Trigger
        openOnHover
        delay={120}
        closeDelay={180}
        className={chart ? styles.chartTrigger : styles.rangeTrigger}
        aria-label={`Price range details for ETH / ${pair.symbol}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Positioner
          side={chart ? "bottom" : "top"}
          align="start"
          sideOffset={8}
          className={styles.popoverPositioner}
        >
          <Popover.Popup
            className={styles.rangePopover}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.popoverHeader}>
              <Popover.Title>ETH / {pair.symbol}</Popover.Title>
              <Popover.Close aria-label="Close price range details">
                <X size={14} />
              </Popover.Close>
            </div>
            <Popover.Description className={styles.popoverDescription}>
              Sample prices · {pair.fullRange ? "Full range" : "Custom range"}
            </Popover.Description>
            <div className={styles.popoverPrice}>
              <small>Current price</small>
              <strong>
                {price(pair.price)} <span>{unit}</span>
              </strong>
              <em data-active={inRange}>
                {!valid && !pair.fullRange
                  ? "Invalid range"
                  : inRange
                    ? "In range"
                    : "Out of range"}
              </em>
            </div>
            <dl className={styles.popoverDetails}>
              <div>
                <dt>Min price</dt>
                <dd>{price(inverse ? high : low)}</dd>
              </div>
              <div>
                <dt>Max price</dt>
                <dd>{price(inverse ? low : high)}</dd>
              </div>
              {!pair.fullRange && valid && (
                <>
                  <div>
                    <dt>Lower vs. current</dt>
                    <dd>{distance(inverse ? pair.high : pair.low)}</dd>
                  </div>
                  <div>
                    <dt>Upper vs. current</dt>
                    <dd>{distance(inverse ? pair.low : pair.high)}</dd>
                  </div>
                </>
              )}
              <div>
                <dt>Fee tier</dt>
                <dd>
                  {pair.fee}% · {feeCopy(pair.fee)}
                </dd>
              </div>
            </dl>
            <p className={styles.popoverDescription}>
              {pair.fullRange
                ? "Liquidity is active at every price."
                : !valid
                  ? "Set a maximum price greater than the minimum."
                  : "Liquidity is active only while the price stays within these limits."}
            </p>
            <div className={styles.popoverActions}>
              <button
                type="button"
                aria-pressed={inverse}
                onClick={() => setInverse(!inverse)}
              >
                Invert price
              </button>
              <Popover.Close onClick={onEdit}>
                Edit range <ArrowRight size={12} />
              </Popover.Close>
            </div>
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}

export function LPDesign() {
  const [pairs, setPairs] = useState(startingPairs);
  const [activePair, setActivePair] = useState(0);
  const [baseAmount, setBaseAmount] = useState("1.00");
  const fullRange = pairs[activePair]?.fullRange ?? false;
  function setFullRange(value: boolean) {
    updatePair(activePair, { fullRange: value });
  }
  function editRange(index: number) {
    setActivePair(index);
    requestAnimationFrame(() => {
      document
        .getElementById("lp-range-editor")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      document
        .getElementById("lp-range-editor")
        ?.focus({ preventScroll: true });
    });
  }
  const [reviewing, setReviewing] = useState(false);
  const current = pairs[activePair];
  const baseEach = useMemo(
    () => (Number(baseAmount) || 0).toFixed(2),
    [baseAmount],
  );

  function updatePair(index: number, patch: Partial<Pair>) {
    setPairs((old) =>
      old.map((pair, i) => (i === index ? { ...pair, ...patch } : pair)),
    );
  }

  function addPair() {
    const token = tokenChoices.find(
      (candidate) => !pairs.some((pair) => pair.symbol === candidate.symbol),
    );
    if (!token) return;
    setPairs((old) => [
      ...old,
      { ...token, amount: "0", fee: "0.3", low: 1, high: 1.2, price: 1.1 },
    ]);
    setActivePair(pairs.length);
  }

  return (
    <div className={styles.page}>
      <MainLayout activePage="liquidity">
        <div className={styles.container}>
          <div className={styles.prototypeBar}>
            <span>
              <FlaskConical size={13} /> Interactive design <b>/</b> Sample
              balances and prices. No live positions.
            </span>
            <Link href="/lp">
              Back to live liquidity <ArrowRight size={12} />
            </Link>
          </div>
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
                <button className={styles.settings}>
                  <Settings2 size={14} /> Position settings
                </button>
              </div>
              <section className={styles.baseCard}>
                <div className={styles.fieldLabel}>
                  <span>Your shared base</span>
                  <button>Balance: 4.82 ETH</button>
                </div>
                <div className={styles.baseValue}>
                  <input
                    aria-label="Shared ETH balance"
                    value={baseAmount}
                    onChange={(event) => setBaseAmount(event.target.value)}
                    inputMode="decimal"
                  />
                  <button className={styles.baseToken}>
                    <TokenMark mark="Ξ" color="#627eea" />
                    <strong>ETH</strong>
                    <ChevronDown size={15} />
                  </button>
                </div>
                <div className={styles.fieldFoot}>
                  <span>≈ $3,486.20</span>
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
                    Each pair reuses <strong>{baseEach} ETH</strong> as its base
                    side.
                  </p>
                </div>
                <span>{pairs.length} active</span>
              </div>
              <div className={styles.pairList}>
                {pairs.map((pair, index) => (
                  <article
                    key={pair.symbol}
                    className={`${styles.pairCard} ${activePair === index ? styles.activePair : ""}`}
                    onClick={() => setActivePair(index)}
                  >
                    <div className={styles.pairTop}>
                      <button
                        className={styles.pairToken}
                        aria-label={`Select paired token ${pair.symbol}`}
                      >
                        <span className={styles.pairMarks}>
                          <TokenMark mark="Ξ" color="#627eea" small />
                          <TokenMark
                            mark={pair.mark}
                            color={pair.color}
                            small
                          />
                        </span>
                        <span>
                          <strong>ETH / {pair.symbol}</strong>
                          <small>{pair.name}</small>
                        </span>
                        <ChevronDown size={14} />
                      </button>
                      <div className={styles.pairAmount}>
                        <input
                          aria-label={`${pair.symbol} amount`}
                          value={pair.amount}
                          onChange={(event) =>
                            updatePair(index, { amount: event.target.value })
                          }
                          inputMode="decimal"
                        />
                        <small>≈ $1,825.00</small>
                      </div>
                      <button
                        className={styles.remove}
                        aria-label={`Remove ${pair.symbol}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setPairs((old) => old.filter((_, i) => i !== index));
                          setActivePair(0);
                        }}
                        disabled={pairs.length <= 2}
                      >
                        <X size={14} />
                      </button>
                    </div>
                    <div className={styles.poolRow}>
                      <div className={styles.poolCopy}>
                        <Settings2 size={13} />
                        <span>
                          <strong>Fee pool</strong>
                          <small>{feeCopy(pair.fee)} fee tier</small>
                        </span>
                      </div>
                      <div
                        className={styles.feeOptions}
                        role="group"
                        aria-label={`${pair.symbol} fee pool`}
                      >
                        {(["0.01", "0.05", "0.3", "1"] as const).map((fee) => (
                          <button
                            key={fee}
                            className={pair.fee === fee ? styles.activeFee : ""}
                            aria-pressed={pair.fee === fee}
                            onClick={(event) => {
                              event.stopPropagation();
                              updatePair(index, { fee });
                            }}
                          >
                            {fee}%
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className={styles.pairMeta}>
                      <RangePopover pair={pair} onEdit={() => editRange(index)}>
                        <Info size={12} />
                        <span>
                          {pair.fullRange
                            ? "Full range"
                            : `Range ${formatPairPrice(pair.low)} to ${formatPairPrice(pair.high)}`}{" "}
                          {pair.symbol} / ETH
                        </span>
                      </RangePopover>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          editRange(index);
                        }}
                      >
                        Edit range <ArrowRight size={12} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <button
                className={styles.addPair}
                disabled={pairs.length === tokenChoices.length}
                onClick={addPair}
              >
                <Plus size={15} /> Add liquidity pair{" "}
                <span>
                  {pairs.length} / {tokenChoices.length}
                </span>
              </button>
              <div className={styles.atomic}>
                <Layers3 size={13} /> One registration batch. Your assets remain
                in your wallet.<i>Preview</i>
              </div>
              <button
                className={styles.primaryButton}
                disabled={pairs.some(
                  (pair) => !pair.fullRange && !validRange(pair),
                )}
                onClick={() => setReviewing(true)}
              >
                Review liquidity positions <ArrowRight size={17} />
              </button>
              <p className={styles.noWallet}>
                Preview only. No wallet connection or signature needed.
              </p>
            </section>
            <aside className={styles.sidebar}>
              {current && (
                <section
                  className={styles.rangeCard}
                  id="lp-range-editor"
                  tabIndex={-1}
                >
                  <div className={styles.rangeHeader}>
                    <div>
                      <span>PRICE RANGE</span>
                      <h2>ETH / {current.symbol}</h2>
                    </div>
                    <button>
                      <SlidersHorizontal size={14} /> Advanced
                    </button>
                  </div>
                  <div className={styles.pairTabs}>
                    {pairs.map((pair, index) => (
                      <button
                        key={pair.symbol}
                        className={activePair === index ? styles.activeTab : ""}
                        onClick={() => setActivePair(index)}
                      >
                        <TokenMark mark={pair.mark} color={pair.color} small />{" "}
                        {pair.symbol}
                      </button>
                    ))}
                  </div>
                  <div className={styles.priceSummary}>
                    <div>
                      <small>Current price</small>
                      <strong>
                        {formatPairPrice(current.price)} {current.symbol}
                        <em
                          data-inactive={
                            !fullRange &&
                            (current.price < current.low ||
                              current.price > current.high ||
                              !validRange(current))
                          }
                        >
                          {fullRange ||
                          (current.price >= current.low &&
                            current.price <= current.high)
                            ? "In range"
                            : "Out of range"}
                        </em>
                      </strong>
                    </div>
                    <button
                      onClick={() => setFullRange(!fullRange)}
                      className={fullRange ? styles.fullSelected : ""}
                    >
                      Full range
                    </button>
                  </div>
                  {fullRange ? (
                    <div className={styles.fullState}>
                      <Layers3 size={18} />
                      <strong>Always active</strong>
                      <span>
                        Liquidity is available at every price. Fees depend on
                        trades.
                      </span>
                      <button onClick={() => setFullRange(false)}>
                        Use a custom range
                      </button>
                    </div>
                  ) : (
                    <>
                      <RangeChart
                        key={current.symbol}
                        price={current.price}
                        low={current.low}
                        high={current.high}
                        symbol={current.symbol}
                        onChange={(range) => updatePair(activePair, range)}
                        renderDetails={(children, dragging) => (
                          <RangePopover
                            pair={current}
                            chart
                            disabled={dragging}
                            onEdit={() =>
                              document.getElementById("lp-min-price")?.focus()
                            }
                          >
                            {children}
                          </RangePopover>
                        )}
                      />
                      <div className={styles.rangeInputs}>
                        <label>
                          Min price
                          <input
                            id="lp-min-price"
                            type="number"
                            min="0"
                            step="any"
                            aria-invalid={!validRange(current)}
                            aria-describedby={
                              !validRange(current)
                                ? "range-validation"
                                : undefined
                            }
                            value={current.low}
                            inputMode="decimal"
                            onChange={(event) =>
                              updatePair(activePair, {
                                low: Number(event.target.value) || 0,
                              })
                            }
                          />
                        </label>
                        <span>to</span>
                        <label>
                          Max price
                          <input
                            type="number"
                            min="0"
                            step="any"
                            aria-invalid={!validRange(current)}
                            aria-describedby={
                              !validRange(current)
                                ? "range-validation"
                                : undefined
                            }
                            value={current.high}
                            inputMode="decimal"
                            onChange={(event) =>
                              updatePair(activePair, {
                                high: Number(event.target.value) || 0,
                              })
                            }
                          />
                        </label>
                      </div>
                      {!validRange(current) ? (
                        <p
                          id="range-validation"
                          role="alert"
                          className={styles.rangeWarning}
                        >
                          Minimum must be nonnegative and maximum must be
                          greater than minimum.
                        </p>
                      ) : (
                        (current.price < current.low ||
                          current.price > current.high) && (
                          <p className={styles.rangeWarning}>
                            Outside the market price. This preview range would
                            not earn fees until the price enters it.
                          </p>
                        )
                      )}
                      <div className={styles.rangePresets}>
                        {[5, 10, 20].map((percent) => (
                          <button
                            key={percent}
                            aria-pressed={
                              selectedPreset(current.price, current) === percent
                            }
                            className={
                              selectedPreset(current.price, current) === percent
                                ? styles.selectedPreset
                                : ""
                            }
                            onClick={() =>
                              updatePair(
                                activePair,
                                presetRange(current.price, percent),
                              )
                            }
                          >
                            ± {percent}%
                          </button>
                        ))}
                        <button
                          aria-pressed={
                            selectedPreset(current.price, current) === undefined
                          }
                          className={
                            selectedPreset(current.price, current) === undefined
                              ? styles.selectedPreset
                              : ""
                          }
                          onClick={() =>
                            document.getElementById("lp-min-price")?.focus()
                          }
                        >
                          Custom
                        </button>
                      </div>
                    </>
                  )}
                  <div className={styles.rangeFoot}>
                    <Info size={13} />
                    <p>
                      Price range and fee pool apply only to{" "}
                      <strong>ETH / {current.symbol}</strong>.
                    </p>
                  </div>
                </section>
              )}
              <section className={styles.positionNote}>
                <span>
                  <Layers3 size={15} />
                </span>
                <div>
                  <strong>Shared base, separate pools</strong>
                  <p>
                    Each paired token gets its own fee tier and range. ETH is
                    not split across pairs.
                  </p>
                </div>
              </section>
            </aside>
          </div>
        </div>
      </MainLayout>
      {reviewing && (
        <div
          className={styles.reviewShade}
          role="dialog"
          aria-modal="true"
          aria-label="Review liquidity positions"
        >
          <div className={styles.review}>
            <button
              className={styles.closeReview}
              aria-label="Close review"
              onClick={() => setReviewing(false)}
            >
              <X size={17} />
            </button>
            <span className={styles.reviewIcon}>
              <Check size={22} />
            </span>
            <h2>Review your liquidity</h2>
            <p>
              {baseEach} ETH backs {pairs.length} fee pools. Each pool has its
              own price range.
            </p>
            {pairs.map((pair) => (
              <div className={styles.reviewPair} key={pair.symbol}>
                <span>
                  <TokenMark mark="Ξ" color="#627eea" small />
                  <TokenMark mark={pair.mark} color={pair.color} small />
                </span>
                <strong>ETH / {pair.symbol}</strong>
                <small>
                  {pair.fee}% fee ·{" "}
                  {pair.fullRange
                    ? "Full range"
                    : `${pair.low} to ${pair.high}`}
                </small>
              </div>
            ))}
            <button
              className={styles.primaryButton}
              onClick={() => setReviewing(false)}
            >
              Back to builder <ArrowLeft size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
