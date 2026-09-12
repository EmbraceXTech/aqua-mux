import type { ChartPeriod } from "./model";
export type PricePoint = { time: number; value: number; volume?: number };
export type Bounds = { minPct: number; maxPct: number };
export type PairChartState = Bounds & {
  fullRange: boolean;
  period: ChartPeriod;
  denomination: "base" | "paired";
  openingPriceOverride?: number;
  useMarketPrice: boolean;
  customBounds?: Bounds;
  preset: "10" | "20" | "saved" | "custom" | "full";
};
export const defaultPairChartState: PairChartState = {
  fullRange: false,
  minPct: -20,
  maxPct: 20,
  period: "1m",
  denomination: "paired",
  useMarketPrice: false,
  preset: "20",
};
export function pairChartKey(chainId: number, base: string, paired: string) {
  // Bounds and opening prices are directional, so reversing a pair needs separate state.
  return `${chainId}:${base.toLowerCase()}:${paired.toLowerCase()}`;
}
export function formatPrice(value: number) {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: value >= 100 ? 2 : value >= 1 ? 4 : 8,
  });
}
export function formatPct(pct: number) {
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;
}
