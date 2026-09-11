import type { StrategyConfig, StrategyGroup } from "../lib/managed";
export const ownerA = "0x0000000000000000000000000000000000000001" as const;
export const ownerB = "0x0000000000000000000000000000000000000002" as const;
export const baseToken = {
  address: "0x0000000000000000000000000000000000000011" as const,
  decimals: 18,
  symbol: "BASE",
};
export const quoteToken = {
  address: "0x0000000000000000000000000000000000000012" as const,
  decimals: 6,
  symbol: "QUOTE",
};
export function configFixture(): StrategyConfig {
  const broker = <T>(value: T) => ({
    value,
    enforcedBy: "execution-broker" as const,
  });
  return {
    version: 1,
    family: "lp",
    recipeId: "wide-range-lp",
    recipeVersion: 1,
    chainId: 42161,
    maker: ownerA,
    pairs: [
      {
        baseToken,
        quoteToken,
        baseAmount: "1000000000000000000",
        quoteAmount: "2000000",
        feeBps: 30,
        openingPrice: {
          baseToken: baseToken.address,
          quoteToken: quoteToken.address,
          numerator: "2",
          denominator: "1",
        },
        range: { kind: "full" },
      },
    ],
    policy: {
      id: "policy-1",
      version: 1,
      intervalMs: broker(60000),
      cooldownMs: broker(60000),
      maxActions: broker(10),
      spendBudgets: broker([]),
      gasBudgetWei: broker("1000000"),
      allowedAssets: broker([baseToken.address, quoteToken.address]),
      allowedRoutes: broker([]),
      maxSlippageBps: broker(100),
      maxReferenceAgeMs: broker(30000),
      expiresAt: broker(9999999999999),
      allowedActions: broker(["hold", "fund-and-open", "close"]),
      triggers: broker({
        rangeExit: false,
        inventoryDriftBps: 500,
        upwardOnly: false,
      }),
    },
  };
}
export function groupFixture(id = "group-1"): StrategyGroup {
  return {
    id,
    owner: ownerA,
    maker: ownerA,
    chainId: 42161,
    config: configFixture(),
    state: "draft",
    inventory: [],
    createdAt: 1,
    updatedAt: 1,
  };
}
