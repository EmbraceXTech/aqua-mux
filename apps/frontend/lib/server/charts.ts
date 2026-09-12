import { type Address } from "viem";
import type { ChartPeriod } from "../model";
import type { PricePoint } from "../price-range";
const periods: Record<ChartPeriod, { days?: number; seconds: number }> = {
  "7d": { days: 7, seconds: 3600 },
  "1m": { days: 30, seconds: 14400 },
  "3m": { days: 90, seconds: 86400 },
  "6m": { days: 180, seconds: 86400 },
  All: { seconds: 604800 },
};
export async function priceHistory(
  chainId: number,
  token0: Address,
  token1: Address,
  period: ChartPeriod,
): Promise<PricePoint[]> {
  const key = process.env.ONEINCH_API_KEY;
  if (!key)
    throw new Error(
      "Price history needs a 1inch API key. Add ONEINCH_API_KEY to AquaMux .env.",
    );
  const { days, seconds } = periods[period];
  const to = Math.floor(Date.now() / 1000);
  // The provider treats a zero timestamp as a missing query parameter.
  const from = days ? to - days * 86400 : 1;
  const query = new URLSearchParams({
    fromTimestamp: String(from),
    toTimestamp: String(to),
    orderBy: "asc",
  });
  const r = await fetch(
    `https://api.1inch.com/charts/v1.0/chart/tradingview/${token0}/${token1}/${seconds}/${chainId}?${query}`,
    {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    },
  );
  if (!r.ok)
    throw new Error(
      `1inch could not provide price history (${r.status}). Try another pair.`,
    );
  const j = await r.json();
  if (!Array.isArray(j.data))
    throw new Error("1inch returned unexpected chart data.");
  const points: PricePoint[] = j.data
    .map((p: { timestamp: number; close: number; volume0?: number }) => ({
      time: p.timestamp,
      value: p.close,
      volume:
        typeof p.volume0 === "number" &&
        Number.isFinite(p.volume0) &&
        p.volume0 >= 0
          ? p.volume0
          : undefined,
    }))
    .filter(
      (p: PricePoint) =>
        Number.isFinite(p.time) &&
        Number.isFinite(p.value) &&
        p.value > 0 &&
        p.time >= from &&
        p.time <= to,
    )
    .sort((a: PricePoint, b: PricePoint) => a.time - b.time);
  if (points.length === 0)
    throw new Error("No price history is available for this pair.");
  return points;
}
export async function currentPrice(
  chainId: number,
  token0: Address,
  token1: Address,
): Promise<number | undefined> {
  const key = process.env.ONEINCH_API_KEY;
  if (!key) return undefined;
  try {
    const r = await fetch(
      `https://api.1inch.com/charts/v1.0/chart/tradingview/${token0}/${token1}/3600/${chainId}/current`,
      {
        headers: { Authorization: `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
        cache: "no-store",
      },
    );
    if (!r.ok) return undefined;
    const j = await r.json();
    const price = j.data?.result?.price;
    return typeof price === "number" && Number.isFinite(price) && price > 0
      ? price
      : undefined;
  } catch {
    return undefined;
  }
}
