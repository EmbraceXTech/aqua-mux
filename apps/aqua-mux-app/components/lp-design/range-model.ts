export type PriceRange = { low: number; high: number };
export type RangeDomain = { min: number; max: number };
export type DragTarget = "low" | "high" | "band";

export function validRange({ low, high }: PriceRange) {
  return (
    Number.isFinite(low) && Number.isFinite(high) && low >= 0 && high > low
  );
}

export function rangeDomain(price: number, range: PriceRange): RangeDomain {
  const low = validRange(range) ? Math.min(range.low, price) : price;
  const high = validRange(range) ? Math.max(range.high, price) : price;
  const padding = Math.max(price * 0.1, (high - low) * 0.3);
  return { min: Math.max(0, low - padding), max: high + padding };
}

export function rangeStep(price: number) {
  return 10 ** (Math.floor(Math.log10(price)) - 4);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function moveRange(
  start: PriceRange,
  target: DragTarget,
  delta: number,
  domain: RangeDomain,
  step: number,
): PriceRange {
  const round = (value: number) =>
    Number((Math.round(value / step) * step).toPrecision(12));
  if (target === "band") {
    const shift = clamp(
      round(delta),
      domain.min - start.low,
      domain.max - start.high,
    );
    return {
      low: Number((start.low + shift).toPrecision(12)),
      high: Number((start.high + shift).toPrecision(12)),
    };
  }
  return target === "low"
    ? {
        ...start,
        low: clamp(round(start.low + delta), domain.min, start.high - step),
      }
    : {
        ...start,
        high: clamp(round(start.high + delta), start.low + step, domain.max),
      };
}

export function presetRange(price: number, percent: number): PriceRange {
  return {
    low: Number((price * (1 - percent / 100)).toPrecision(12)),
    high: Number((price * (1 + percent / 100)).toPrecision(12)),
  };
}

export function selectedPreset(price: number, range: PriceRange) {
  return [5, 10, 20].find((percent) => {
    const preset = presetRange(price, percent);
    return (
      Math.abs(range.low - preset.low) < price * 1e-9 &&
      Math.abs(range.high - preset.high) < price * 1e-9
    );
  });
}
