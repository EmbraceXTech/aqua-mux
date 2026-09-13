"use client";

import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  clamp,
  moveRange,
  rangeDomain,
  rangeStep,
  validRange,
  type DragTarget,
  type PriceRange,
  type RangeDomain,
} from "./range-model";
import styles from "./lp-design.module.css";

const format = (price: number) =>
  price.toLocaleString("en-US", { maximumFractionDigits: 8 });

type Drag = {
  target: DragTarget;
  y: number;
  height: number;
  range: PriceRange;
  domain: RangeDomain;
  pointerId: number;
};

export function RangeChart({
  price,
  low,
  high,
  symbol,
  onChange,
  renderDetails,
}: PriceRange & {
  price: number;
  symbol: string;
  onChange: (range: PriceRange) => void;
  renderDetails: (children: ReactNode, dragging: boolean) => ReactNode;
}) {
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [dragging, setDragging] = useState(false);
  const [domain, setDomain] = useState(() => rangeDomain(price, { low, high }));
  const valid = validRange({ low, high });
  if (!dragging && valid && (low < domain.min || high > domain.max)) {
    setDomain(rangeDomain(price, { low, high }));
  }
  const step = valid
    ? Math.min(rangeStep(price), (high - low) / 2)
    : rangeStep(price);
  const y = (value: number) =>
    clamp(((domain.max - value) / (domain.max - domain.min)) * 100, 0, 100);
  const upper = y(high);
  const lower = y(low);

  function start(event: PointerEvent<HTMLButtonElement>, target: DragTarget) {
    if (!valid || !event.isPrimary || event.button !== 0 || drag.current)
      return;
    const bounds = canvas.current!.getBoundingClientRect();
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      target,
      y: event.clientY,
      height: bounds.height,
      range: { low, high },
      domain,
      pointerId: event.pointerId,
    };
    setDragging(true);
  }

  function move(event: PointerEvent<HTMLButtonElement>) {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const delta =
      ((start.y - event.clientY) / start.height) *
      (start.domain.max - start.domain.min);
    onChange(moveRange(start.range, start.target, delta, start.domain, step));
  }

  function finish(event: PointerEvent<HTMLButtonElement>, cancel = false) {
    if (!drag.current || event.pointerId !== drag.current.pointerId) return;
    if (cancel) onChange(drag.current.range);
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function keyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    target: DragTarget,
  ) {
    if (event.key === "Escape" && drag.current) {
      onChange(drag.current.range);
      drag.current = null;
      setDragging(false);
      event.preventDefault();
      return;
    }
    if (!valid) return;
    const direction = ["ArrowUp", "ArrowRight", "PageUp"].includes(event.key)
      ? 1
      : ["ArrowDown", "ArrowLeft", "PageDown"].includes(event.key)
        ? -1
        : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const amount =
      direction *
      step *
      (event.shiftKey || event.key.startsWith("Page") ? 10 : 1);
    const delta =
      event.key === "Home"
        ? target === "high"
          ? low + step - high
          : domain.min - low
        : event.key === "End"
          ? target === "low"
            ? high - step - low
            : domain.max - high
          : amount;
    onChange(moveRange({ low, high }, target, delta, domain, step));
  }

  return (
    <div className={styles.rangeChart}>
      <div className={styles.chartLegend}>
        <span>Sample price chart</span>
        <span>{symbol} / ETH</span>
      </div>
      <div
        ref={canvas}
        className={styles.chartCanvas}
        data-dragging={dragging}
        role="group"
        aria-label={`Select LP price range for ETH / ${symbol}`}
      >
        {renderDetails(
          <svg
            className={styles.pricePlot}
            viewBox="0 0 320 200"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            {[25, 50, 75].map((percent) => (
              <path
                key={percent}
                d={`M0 ${percent * 2}H320`}
                stroke="#e5eaf3"
                strokeDasharray="3 5"
              />
            ))}
            <polyline
              points={[
                -8, -6, -9, -4, -5, -2, -4, 0, -1, 3, 2, 5, 3, 6, 4, 7, 5, 4, 6,
                3, 2, 4, 1, 0,
              ]
                .map(
                  (change, index, points) =>
                    `${(index * 320) / (points.length - 1)},${y(price * (1 + change / 100)) * 2}`,
                )
                .join(" ")}
              fill="none"
              stroke="#93a6c9"
              strokeWidth="1.5"
            />
          </svg>,
          dragging,
        )}
        <div className={styles.marketLine} style={{ top: `${y(price)}%` }}>
          <span>Market {format(price)}</span>
        </div>
        {valid && (
          <>
            <button
              type="button"
              className={styles.rangeBand}
              style={{ top: `${upper}%`, height: `${lower - upper}%` }}
              aria-label="Move selected price range"
              aria-describedby="range-drag-help"
              onPointerDown={(event) => start(event, "band")}
              onPointerMove={move}
              onPointerUp={(event) => finish(event)}
              onPointerCancel={(event) => finish(event, true)}
              onLostPointerCapture={(event) => finish(event, true)}
              onKeyDown={(event) => keyboard(event, "band")}
            />
            {(["high", "low"] as const).map((target) => {
              const value = target === "high" ? high : low;
              return (
                <button
                  key={target}
                  type="button"
                  role="slider"
                  aria-label={
                    target === "high" ? "Maximum LP price" : "Minimum LP price"
                  }
                  aria-orientation="vertical"
                  aria-valuemin={target === "high" ? low + step : domain.min}
                  aria-valuemax={target === "low" ? high - step : domain.max}
                  aria-valuenow={value}
                  aria-valuetext={`${format(value)} ${symbol} per ETH`}
                  aria-describedby="range-drag-help"
                  className={styles.rangeHandle}
                  data-bound={target}
                  style={{ top: `${y(value)}%` }}
                  onPointerDown={(event) => start(event, target)}
                  onPointerMove={move}
                  onPointerUp={(event) => finish(event)}
                  onPointerCancel={(event) => finish(event, true)}
                  onLostPointerCapture={(event) => finish(event, true)}
                  onKeyDown={(event) => keyboard(event, target)}
                >
                  <span className={styles.handleGrip}>≡</span>
                  <span className={styles.handleValue}>
                    {target === "high" ? "Max" : "Min"} {format(value)}
                  </span>
                </button>
              );
            })}
          </>
        )}
      </div>
      <div className={styles.chartAxis}>
        <span>Illustrative history</span>
        <span>Now</span>
      </div>
      <p id="range-drag-help" className={styles.chartHint}>
        Drag a boundary to resize, or the blue area to move the range. Use arrow
        keys for fine adjustments.
      </p>
      <div className={styles.chartControls}>
        <span>
          {valid
            ? `${(((high - low) / price) * 100).toFixed(2)}% range width`
            : "Enter a valid range below"}
        </span>
        <button
          type="button"
          onClick={() => setDomain(rangeDomain(price, { low, high }))}
        >
          Fit range
        </button>
      </div>
    </div>
  );
}
