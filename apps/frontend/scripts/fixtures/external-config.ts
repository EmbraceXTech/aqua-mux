import { parseEther, type Address } from "viem";
import { NATIVE } from "../../lib/config";
import type { LPStrategyConfig, Token } from "../../lib/managed";
import { routePolicyTargets } from "../../lib/server/route-policy/route-calls";

export function createExternalConfig({
  chainId,
  maker,
  base,
  quotes,
  amountIn,
  initial,
}: {
  chainId: number;
  maker: Address;
  base: Token;
  quotes: Token[];
  amountIn: string;
  initial: { minimumAmountOut: string }[];
}): LPStrategyConfig {
  const broker = <T>(value: T) => ({
    value,
    enforcedBy: "execution-broker" as const,
  });
  const config: LPStrategyConfig = {
    version: 1,
    family: "lp",
    recipeId: "wide-range-lp",
    recipeVersion: 1,
    chainId,
    maker,
    pairs: quotes.map((quote, index) => ({
      baseToken: base,
      quoteToken: quote,
      baseAmount: amountIn,
      quoteAmount: initial[index].minimumAmountOut,
      feeBps: 5,
      openingPrice: {
        baseToken: base.address,
        quoteToken: quote.address,
        numerator: String(BigInt(initial[index].minimumAmountOut) * 10n ** 18n),
        denominator: String(BigInt(amountIn) * 10n ** BigInt(quote.decimals)),
      },
      range: { kind: "full" },
    })),
    policy: {
      id: "fork-policy",
      version: 1,
      intervalMs: broker(60000),
      cooldownMs: broker(0),
      maxActions: broker(10),
      spendBudgets: broker([]),
      gasBudgetWei: broker(parseEther("0.1").toString()),
      allowedAssets: broker([
        NATIVE,
        base.address,
        ...quotes.map((t) => t.address),
      ]),
      allowedRoutes: broker(routePolicyTargets(chainId)),
      maxSlippageBps: broker(100),
      maxReferenceAgeMs: broker(30000),
      expiresAt: broker(Date.now() + 3600000),
      allowedActions: broker([
        "fund-and-open",
        "replace",
        "close",
        "propose-conversion",
      ]),
      triggers: broker({
        rangeExit: false,
        inventoryDriftBps: 500,
        upwardOnly: false,
      }),
    },
  };
  return config;
}
