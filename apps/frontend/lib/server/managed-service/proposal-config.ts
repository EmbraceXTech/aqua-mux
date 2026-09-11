import { strategyConfigSchema, type StrategyConfig } from "../../managed";
import { describeLPPrice } from "../../managed-compiler/lp";

/** Derive executable opening prices before presenting a proposal for owner review. */
export function normalizeProposalConfig(
  config: StrategyConfig,
): StrategyConfig {
  if (config.family !== "lp") return config;
  return strategyConfigSchema.parse({
    ...config,
    pairs: config.pairs.map((pair) => ({
      ...pair,
      openingPrice: describeLPPrice(pair),
    })),
  });
}
