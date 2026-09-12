"use client";
import { useEffect, useId, useMemo, useState } from "react";
import { Loader2, Minus, Plus, Scan } from "lucide-react";
import { errorMessage } from "@/lib/errors";
import { chartPeriods, type ChartPeriod } from "@/lib/model";
import type { Token } from "@/lib/config";
import {
  formatPrice,
  formatPct,
  type Bounds,
  type PricePoint,
} from "@/lib/price-range";
const W = 820;
const H = 220;
const VOLUME_H = 80;
const TOTAL_H = H + VOLUME_H;
function formatTick(time: number, period: ChartPeriod) {
  return new Date(time * 1000).toLocaleDateString("en-US", {
    month: "short",
    ...(period === "7d" || period === "1m"
      ? { day: "numeric" }
      : { year: "numeric" }),
  });
}
export function PriceRangeChart({
  chainId,
  base,
  paired,
  bounds,
  fullRange,
  onBoundsChange,
  onExitFullRange,
  openingPrice,
  onOpeningPriceChange,
  period,
  onPeriodChange,
  denomination,
  onDenominationChange,
}: {
  chainId: number;
  base: Token;
  paired: Token;
  bounds: Bounds;
  fullRange: boolean;
  onBoundsChange: (update: (prev: Bounds) => Bounds) => void;
  onExitFullRange: () => void;
  openingPrice?: number;
  onOpeningPriceChange: (price: number | undefined) => void;
  period: ChartPeriod;
  onPeriodChange: (period: ChartPeriod) => void;
  denomination: "base" | "paired";
  onDenominationChange: (denomination: "base" | "paired") => void;
}) {
  const [history, setHistory] = useState<{
    period: ChartPeriod;
    points: PricePoint[];
    marketPrice?: number;
    message?: string;
  }>();
  const [zoom, setZoom] = useState(1);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    width: number;
  } | null>(null);
  const [editingOpening, setEditingOpening] = useState<string | null>(null);
  const [drag, setDrag] = useState<{
    handle: "min" | "max";
    low: number;
    high: number;
  } | null>(null);
  const clipId = useId();
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chainId,
        token0: base.address,
        token1: paired.address,
        period,
      }),
      signal: controller.signal,
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Request failed.");
        if (!controller.signal.aborted)
          setHistory({
            period,
            points: j.data as PricePoint[],
            marketPrice: j.marketPrice,
          });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setHistory({ period, points: [], message: errorMessage(e) });
      });
    return () => controller.abort();
  }, [chainId, base.address, paired.address, period]);
  const points = useMemo(
    () => (history?.period === period ? history.points : []),
    [history, period],
  );
  const loading = history?.period !== period;
  const message = !loading ? history?.message : undefined;
  const market = history?.period === period ? history.marketPrice : undefined;
  const opening = openingPrice ?? market ?? points.at(-1)?.value ?? 1;
  const inverse = denomination === "base";
  const display = (price: number) => (inverse ? 1 / price : price);
  const unit = inverse ? base.symbol : paired.symbol;
  const displayOpening = display(opening);
  const rangeMinPrice = opening * (1 + bounds.minPct / 100);
  const rangeMaxPrice = opening * (1 + bounds.maxPct / 100);
  const scale = useMemo(() => {
    const convert = (price: number) => (inverse ? 1 / price : price);
    const values = points.map((p) => convert(p.value));
    const low =
      Math.min(
        ...values,
        convert(rangeMinPrice),
        convert(rangeMaxPrice),
        convert(opening),
      ) * 0.95;
    const high =
      Math.max(
        ...values,
        convert(rangeMinPrice),
        convert(rangeMaxPrice),
        convert(opening),
      ) * 1.05;
    const center = (low + high) / 2;
    const half = (high - low) / 2 / zoom;
    const visibleLow = Math.max(0, center - half);
    const visibleHigh = center + half;
    const t0 = points[0]?.time ?? 0;
    const t1 = points.at(-1)?.time ?? 1;
    return {
      low: visibleLow,
      high: visibleHigh,
      priceToY: (price: number) =>
        H - ((price - visibleLow) / (visibleHigh - visibleLow)) * H,
      timeToX: (time: number) =>
        points.length > 1 ? ((time - t0) / (t1 - t0 || 1)) * W : W / 2,
    };
  }, [points, inverse, rangeMinPrice, rangeMaxPrice, opening, zoom]);
  const linePath = points
    .map(
      (p, i) =>
        `${i ? "L" : "M"}${scale.timeToX(p.time).toFixed(1)},${scale.priceToY(display(p.value)).toFixed(1)}`,
    )
    .join(" ");
  const yOpen = scale.priceToY(displayOpening);
  const yMin = scale.priceToY(display(rangeMinPrice));
  const yMax = scale.priceToY(display(rangeMaxPrice));
  const clampY = (y: number) => Math.max(8, Math.min(H - 8, y));
  const labelCenter = (yMax + yMin) / 2;
  // Separate labels without moving the price handles, including when the pair is inverted.
  const maxLabel = clampY(
    inverse
      ? Math.max(yMax, labelCenter + 13)
      : Math.min(yMax, labelCenter - 13),
  );
  const minLabel = clampY(
    inverse
      ? Math.min(yMin, labelCenter - 13)
      : Math.max(yMin, labelCenter + 13),
  );
  function startDrag(handle: "min" | "max", e: React.PointerEvent) {
    e.preventDefault();
    (e.currentTarget as SVGRectElement).ownerSVGElement!.setPointerCapture(
      e.pointerId,
    );
    setDrag({ handle, low: scale.low, high: scale.high });
    setHover(null);
  }
  function onPointerMove(e: React.PointerEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    if (!drag) {
      setHover({ x, y: Math.max(0, e.clientY - rect.top), width: rect.width });
      return;
    }
    const y = Math.max(
      0,
      Math.min(H, ((e.clientY - rect.top) / rect.height) * TOTAL_H),
    );
    const { low, high } = drag;
    const shown = Math.max(Number.EPSILON, low + (1 - y / H) * (high - low));
    const price = inverse ? 1 / shown : shown;
    const pct = (price / opening - 1) * 100;
    onBoundsChange((prev) =>
      drag.handle === "min"
        ? {
            ...prev,
            minPct: Number(Math.max(-99.99, Math.min(-0.01, pct)).toFixed(2)),
          }
        : {
            ...prev,
            maxPct: Number(Math.max(0.01, Math.min(1000, pct)).toFixed(2)),
          },
    );
  }
  function endDrag(e: React.PointerEvent<SVGSVGElement>) {
    if (e.currentTarget.hasPointerCapture(e.pointerId))
      e.currentTarget.releasePointerCapture(e.pointerId);
    setDrag(null);
  }
  const nearest =
    hover && points.length
      ? points.reduce((best, p) =>
          Math.abs(scale.timeToX(p.time) - (hover.x / hover.width) * W) <
          Math.abs(scale.timeToX(best.time) - (hover.x / hover.width) * W)
            ? p
            : best,
        )
      : undefined;
  const tooltipWidth = hover ? Math.min(190, hover.width - 12) : 190;
  const tooltipLeft = hover
    ? Math.max(
        6,
        Math.min(
          hover.width - tooltipWidth - 6,
          hover.x + tooltipWidth + 12 > hover.width
            ? hover.x - tooltipWidth - 12
            : hover.x + 12,
        ),
      )
    : 0;
  const volumes = points.flatMap((p) =>
    p.volume === undefined ? [] : [p.volume],
  );
  const maxVolume = Math.max(...volumes, 1);
  const ticks =
    points.length > 1
      ? [points[0], points[Math.floor((points.length - 1) / 2)], points.at(-1)!]
      : [];
  const high = points.length
    ? Math.max(...points.map((p) => display(p.value)))
    : undefined;
  const low = points.length
    ? Math.min(...points.map((p) => display(p.value)))
    : undefined;
  function extreme(label: string, price: number | undefined) {
    return (
      <div className="price-range-extreme">
        {price !== undefined && (
          <>
            <span>{label}</span> {formatPrice(price)} {unit}{" "}
            <span className={price >= displayOpening ? "up" : "down"}>
              {formatPct((price / displayOpening - 1) * 100)}
            </span>
          </>
        )}
      </div>
    );
  }
  return (
    <div className="price-range-chart">
      <div className="price-range-opening-editor">
        <label htmlFor={`${clipId}-opening`}>
          Opening price{" "}
          <span>
            {unit} per {inverse ? paired.symbol : base.symbol}
          </span>
        </label>
        <div>
          <input
            id={`${clipId}-opening`}
            aria-label="Opening price"
            type="number"
            min="0"
            step="any"
            placeholder="Enter price"
            value={
              editingOpening ??
              (openingPrice !== undefined || market !== undefined
                ? Number(displayOpening.toPrecision(10)).toString()
                : "")
            }
            onFocus={(e) => setEditingOpening(e.target.value)}
            onChange={(e) => {
              setEditingOpening(e.target.value);
              const value = Number(e.target.value);
              if (Number.isFinite(value) && value > 0)
                onOpeningPriceChange(inverse ? 1 / value : value);
            }}
            onBlur={() => setEditingOpening(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          <button
            className="text-button"
            disabled={market === undefined}
            title={
              market === undefined
                ? "Current market price is unavailable"
                : "Use the current market price"
            }
            onClick={() => {
              setEditingOpening(null);
              onOpeningPriceChange(undefined);
            }}
          >
            Set to market
          </button>
        </div>
      </div>
      <div className="price-range-toolbar">
        <div className="price-range-tabs" aria-label="Price denomination">
          {(["base", "paired"] as const).map((d) => (
            <button
              key={d}
              aria-pressed={denomination === d}
              className={denomination === d ? "selected" : ""}
              onClick={() => {
                setEditingOpening(null);
                onDenominationChange(d);
              }}
            >
              {d === "base" ? base.symbol : paired.symbol}
            </button>
          ))}
          <button disabled title="USD price history is unavailable">
            USD
          </button>
        </div>
        <div className="price-range-tabs" aria-label="Chart period">
          {chartPeriods.map((p) => (
            <button
              key={p}
              aria-pressed={p === period}
              className={p === period ? "selected" : ""}
              onClick={() => {
                setHover(null);
                onPeriodChange(p);
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      {extreme("High", high)}
      <div className="price-range-plot">
        <svg
          role="img"
          aria-label={`${base.symbol} / ${paired.symbol} price history`}
          viewBox={`0 0 ${W} ${TOTAL_H}`}
          preserveAspectRatio="none"
          onPointerMove={onPointerMove}
          onPointerLeave={() => setHover(null)}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          <defs>
            <clipPath id={clipId}>
              <rect width={W} height={H} />
            </clipPath>
          </defs>
          <g clipPath={`url(#${clipId})`}>
            {linePath && (
              <path
                className="price-area"
                d={`${linePath} L${W},${H} L0,${H} Z`}
              />
            )}
            {linePath && <path className="price-line" d={linePath} />}
            {!fullRange && (
              <rect
                className="range-band"
                x={0}
                y={Math.min(yMin, yMax)}
                width={W}
                height={Math.max(2, Math.abs(yMin - yMax))}
              />
            )}
            <line
              className="opening-line"
              x1={0}
              x2={W}
              y1={yOpen}
              y2={yOpen}
            />
            {!fullRange &&
              (
                [
                  { handle: "max", y: yMax },
                  { handle: "min", y: yMin },
                ] as const
              ).map(({ handle, y }) => (
                <g key={handle} className="handle">
                  <line className="handle-line" x1={0} x2={W} y1={y} y2={y} />
                  <rect
                    className="handle-hit"
                    aria-label={`${handle === "max" ? "Maximum" : "Minimum"} price handle`}
                    role="slider"
                    tabIndex={0}
                    aria-valuemin={handle === "min" ? -99.99 : 0.01}
                    aria-valuemax={handle === "min" ? -0.01 : 1000}
                    aria-valuenow={
                      handle === "min" ? bounds.minPct : bounds.maxPct
                    }
                    x={0}
                    y={y - 8}
                    width={W}
                    height={16}
                    onPointerDown={(e) => startDrag(handle, e)}
                    onKeyDown={(e) => {
                      if (!["ArrowUp", "ArrowDown"].includes(e.key)) return;
                      e.preventDefault();
                      const delta =
                        (e.key === "ArrowUp" ? 1 : -1) * (inverse ? -1 : 1);
                      onBoundsChange((prev) =>
                        handle === "min"
                          ? {
                              ...prev,
                              minPct: Math.max(
                                -99.99,
                                Math.min(-0.01, prev.minPct + delta),
                              ),
                            }
                          : {
                              ...prev,
                              maxPct: Math.max(
                                0.01,
                                Math.min(1000, prev.maxPct + delta),
                              ),
                            },
                      );
                    }}
                  />
                </g>
              ))}
          </g>
          <line className="opening-line" x1={0} x2={W} y1={H + 8} y2={H + 8} />
          {points.map(
            (p, i) =>
              p.volume !== undefined && (
                <rect
                  key={`${p.time}-${i}`}
                  className="volume-bar"
                  x={Math.min(
                    W - 2,
                    Math.max(
                      0,
                      scale.timeToX(p.time) -
                        W / Math.max(points.length, 1) / 3,
                    ),
                  )}
                  y={TOTAL_H - (p.volume / maxVolume) * (VOLUME_H - 16)}
                  width={Math.max(1, (W / Math.max(points.length, 1)) * 0.65)}
                  height={(p.volume / maxVolume) * (VOLUME_H - 16)}
                />
              ),
          )}
          {nearest && hover && (
            <line
              className="price-crosshair"
              x1={(hover.x / hover.width) * W}
              x2={(hover.x / hover.width) * W}
              y1={0}
              y2={TOTAL_H}
            />
          )}
        </svg>
        <div className="price-range-zoom">
          <button
            aria-label="Zoom in"
            title="Zoom in"
            disabled={zoom >= 8}
            onClick={() => setZoom((z) => Math.min(8, z * 1.4))}
          >
            <Plus size={13} />
          </button>
          <button
            aria-label="Zoom out"
            title="Zoom out"
            disabled={zoom <= 0.25}
            onClick={() => setZoom((z) => Math.max(0.25, z / 1.4))}
          >
            <Minus size={13} />
          </button>
          <button
            aria-label="Auto scale"
            title="Auto scale"
            onClick={() => setZoom(1)}
          >
            <Scan size={13} />
          </button>
        </div>
        {!fullRange && (
          <>
            <div
              className="price-range-label max"
              style={{ top: `${(maxLabel / TOTAL_H) * 100}%` }}
            >
              <strong>
                {formatPrice(display(rangeMaxPrice))} {unit}
              </strong>
              <span>
                {formatPct((display(rangeMaxPrice) / displayOpening - 1) * 100)}
              </span>
            </div>
            <div
              className="price-range-label min"
              style={{ top: `${(minLabel / TOTAL_H) * 100}%` }}
            >
              <strong>
                {formatPrice(display(rangeMinPrice))} {unit}
              </strong>
              <span>
                {formatPct((display(rangeMinPrice) / displayOpening - 1) * 100)}
              </span>
            </div>
          </>
        )}
        {yOpen >= 0 && yOpen <= H && (
          <div
            className="price-range-opening"
            style={{ top: `${(yOpen / TOTAL_H) * 100}%` }}
          >
            Opening price
          </div>
        )}
        {!loading && !message && volumes.length === 0 && (
          <div className="price-range-volume-empty">Volume unavailable</div>
        )}
        {loading && (
          <div className="price-range-overlay">
            <Loader2 size={16} className="spin" />
          </div>
        )}
        {message && (
          <div className="price-range-overlay" role="status">
            {message}
          </div>
        )}
        {fullRange && !loading && !message && (
          <div className="price-range-overlay soft">
            Full range: always in position.
            <button onClick={onExitFullRange}>Customize range</button>
          </div>
        )}
        {nearest && hover && !loading && !message && (
          <div
            role="tooltip"
            className="price-range-tooltip"
            style={{
              left: tooltipLeft,
              top: Math.max(34, Math.min(hover.y - 38, 110)),
              width: tooltipWidth,
            }}
          >
            <strong>
              {formatPrice(display(nearest.value))} {unit}
            </strong>
            <span>
              {nearest.volume === undefined
                ? "Volume unavailable"
                : `Vol ${formatPrice(nearest.volume)} ${base.symbol}`}
            </span>
            <span>
              {new Date(nearest.time * 1000)
                .toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })
                .replace(",", "")}
            </span>
            <span>
              {new Date(nearest.time * 1000)
                .toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                })
                .replace(" ", "")
                .toLowerCase()}
            </span>
          </div>
        )}
      </div>
      {extreme("Low", low)}
      {ticks.length > 0 && (
        <div className="price-range-axis">
          {ticks.map((t, i) => (
            <span key={i}>{formatTick(t.time, period)}</span>
          ))}
        </div>
      )}
      {volumes.length > 0 && (
        <div className="price-range-volume-note">
          Volume: {base.symbol} across all pairs; recent candles may lag.
        </div>
      )}
    </div>
  );
}
