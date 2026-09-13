import { SlidersHorizontal } from "lucide-react";
import type { Address } from "viem";
import { PriceRangeChart } from "@/components/price-range-chart";
import type { TradeWorkspace } from "@/hooks/useTradeWorkspace";

export function LiquidityPriceRangeControl({
  trade,
}: {
  trade: TradeWorkspace;
}) {
  const {
    base,
    catalog,
    chainId,
    change,
    derivedOpening,
    feeBps,
    fullRange,
    legs,
    pairedToken,
    pairKey,
    pairState,
    rangeBounds,
    setChartPair,
    setSettings,
    updatePair,
  } = trade;

  return (
    <div className="range-control sidebar-range-control">
      <div>
        <span>Price range</span>
        <button className="text-button" onClick={() => setSettings(true)}>
          Default fee {feeBps / 100}% <SlidersHorizontal size={12} />
        </button>
      </div>
      <label className="range-pair-picker">
        Pair
        <select
          aria-label="Price range pair"
          value={pairedToken.address}
          onChange={(event) => setChartPair(event.target.value as Address)}
        >
          {legs.map((leg) => (
            <option key={leg.address} value={leg.address}>
              {base.symbol} /{" "}
              {catalog.find((token) => token.address === leg.address)!.symbol}
            </option>
          ))}
        </select>
      </label>
      <div className="range-options">
        {([10, 20] as const).map((range) => (
          <button
            key={range}
            className={pairState.preset === String(range) ? "selected" : ""}
            onClick={() => {
              change();
              updatePair((old) => ({
                ...old,
                fullRange: false,
                minPct: -range,
                maxPct: range,
                preset: range === 10 ? "10" : "20",
              }));
            }}
          >
            {`+/- ${range}%`}
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
        onPeriodChange={(period) => updatePair((old) => ({ ...old, period }))}
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
        Each pair has its own bounds around its reserve ratio. Opening price
        edits preview the chart; reserve amounts determine the registered
        position.
      </small>
    </div>
  );
}
