import { ManagedError } from "./errors";
import type { StrategyGroup } from "../../managed";
import { quoteVerifiedRoute } from "../route-policy";
import { verifiedToken, type WalletSnapshot } from "./snapshot";

/** Size-specific reference data is read-only and never carries signing authority. */
export async function attachActiveRouteObservations(
  snapshot: WalletSnapshot,
  group: StrategyGroup,
) {
  if (group.config.family !== "lp")
    throw new ManagedError(
      "recipe_unavailable",
      "Market-making review is unavailable.",
    );
  const observations = await Promise.all(
    group.config.pairs.map(async (pair) => {
      const source = `verified-pair:${pair.baseToken.address}:${pair.quoteToken.address}`;
      try {
        const route = await quoteVerifiedRoute({
          chainId: group.chainId,
          maker: group.maker,
          source: pair.baseToken.address,
          destination: pair.quoteToken.address,
          amountIn: pair.baseAmount,
          minimumAmountOut: "1",
          slippageBps: group.config.policy.maxSlippageBps.value,
        });
        return {
          quote: {
            source,
            fromToken: verifiedToken(
              group.chainId,
              pair.baseToken.address,
              snapshot.tokenMetadata,
            ),
            toToken: verifiedToken(
              group.chainId,
              pair.quoteToken.address,
              snapshot.tokenMetadata,
            ),
            amountIn: route.amountIn,
            amountOut: route.amountOut,
            observedAt: route.quotedAt,
            expiresAt: route.expiresAt,
          },
          coverage: {
            source,
            observedAt: route.quotedAt,
            status: "complete" as const,
            detail:
              "Current output for the configured base amount, including size-dependent price impact; not a spot price or signing authorization.",
          },
        };
      } catch {
        return {
          quote: null,
          coverage: {
            source,
            observedAt: Date.now(),
            status: "unavailable" as const,
            detail:
              "A current source-attested pair quote is unavailable; no market value was inferred.",
          },
        };
      }
    }),
  );
  snapshot.routeQuotes = observations.flatMap((entry) =>
    entry.quote ? [entry.quote] : [],
  );
  snapshot.coverage.push(...observations.map((entry) => entry.coverage));
}
