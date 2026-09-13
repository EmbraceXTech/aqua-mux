export const quoteTokens = ["USDC", "ARB", "wstETH", "GMX"] as const;
export type QuoteToken = (typeof quoteTokens)[number];
export type CustomSettings = {
  markets: { symbol: QuoteToken; weight: number }[];
  rangeExit: boolean;
  inventoryDrift: boolean;
  driftPercent: number;
  cooldown: string;
};

export function newCustomSettings(): CustomSettings {
  return {
    markets: [
      { symbol: "USDC", weight: 60 },
      { symbol: "ARB", weight: 40 },
    ],
    rangeExit: true,
    inventoryDrift: false,
    driftPercent: 10,
    cooldown: "30",
  };
}

export function allocationTotal(settings: CustomSettings) {
  return settings.markets.reduce((sum, market) => sum + market.weight, 0);
}

export function customValidation(settings: CustomSettings): string | null {
  if (!settings.markets.length) return "Choose at least one market.";
  if (settings.markets.length > quoteTokens.length)
    return "Choose no more than four markets.";
  if (
    new Set(settings.markets.map((market) => market.symbol)).size !==
    settings.markets.length
  )
    return "Each market can only be selected once.";
  if (
    settings.markets.some(
      (market) =>
        !quoteTokens.includes(market.symbol) ||
        !Number.isFinite(market.weight) ||
        market.weight <= 0 ||
        market.weight > 100,
    )
  )
    return "Give every selected market an allocation greater than 0% and no more than 100%.";
  if (Math.abs(allocationTotal(settings) - 100) > 0.001)
    return "Allocations must add up to 100%. Adjust the weights or split equally.";
  return null;
}

export function splitEqually(
  markets: CustomSettings["markets"],
): CustomSettings["markets"] {
  const share = Math.floor(100 / markets.length);
  return markets.map((market, i) => ({
    ...market,
    weight: i === markets.length - 1 ? 100 - share * i : share,
  }));
}

export function triggerLabel(settings: CustomSettings) {
  return (
    [
      settings.rangeExit && "Range exit",
      settings.inventoryDrift && `Inventory drift ≥ ${settings.driftPercent}%`,
    ]
      .filter(Boolean)
      .join(" · ") || "Scheduled checks only"
  );
}
