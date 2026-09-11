import { NATIVE, wrapped } from "../../../frontend/lib/config";
import {
  strategyConfigSchema,
  type LPStrategyConfig,
} from "../../../frontend/lib/managed/config";
import {
  compileLP,
  describeLPPrice,
} from "../../../frontend/lib/managed-compiler/lp";
import type { ReviewRequest } from "./contract";

/** Arithmetic and compiler preview only; signing still requires a fresh whole-batch simulation. */
export function proposalPreview(request: ReviewRequest) {
  const { intent, snapshot, policyTemplate } = request;
  if (!intent || !policyTemplate)
    return {
      available: false,
      reason: "An initial funding intent is required.",
    };
  const baseAddress =
    intent.fundingToken === NATIVE
      ? wrapped(intent.chainId).address
      : intent.fundingToken;
  const base = snapshot.balances.find(
    (row) => row.token.address === baseAddress,
  )?.token;
  const destinations = intent.permittedAssets.filter(
    (address) => address !== intent.fundingToken && address !== baseAddress,
  );
  if (!base || !destinations.length)
    return {
      available: false,
      reason: "Verified base and paired token metadata are required.",
    };
  let spending = 0n;
  const pairs: LPStrategyConfig["pairs"] = [];
  for (const address of destinations) {
    const quote = snapshot.routeQuotes?.find(
      (row) =>
        row.fromToken.address === intent.fundingToken &&
        row.toToken.address === address,
    );
    if (!quote || quote.expiresAt <= Date.now())
      return {
        available: false,
        reason:
          "Every paired asset needs a fresh amount-specific funding quote.",
      };
    spending += BigInt(quote.amountIn);
    const pairedAmount =
      (BigInt(quote.amountOut) *
        BigInt(10000 - policyTemplate.maxSlippageBps.value)) /
      10000n;
    if (pairedAmount <= 0n)
      return {
        available: false,
        reason: "The conservative receipt rounds to zero.",
      };
    const reserves = {
      baseToken: base,
      quoteToken: quote.toToken,
      baseAmount: quote.amountIn,
      quoteAmount: pairedAmount.toString(),
    };
    const openingPrice = describeLPPrice({
      ...reserves,
      feeBps: 5,
      range: { kind: "full" },
      openingPrice: {
        baseToken: base.address,
        quoteToken: quote.toToken.address,
        numerator: "1",
        denominator: "1",
      },
    });
    const bound = (bps: number) => ({
      ...openingPrice,
      numerator: (BigInt(openingPrice.numerator) * BigInt(bps)).toString(),
      denominator: (BigInt(openingPrice.denominator) * 10000n).toString(),
    });
    pairs.push({
      ...reserves,
      openingPrice,
      feeBps: 5,
      range:
        intent.recipeId === "wide-range-lp"
          ? { kind: "full" }
          : { kind: "bounded", lower: bound(8000), upper: bound(12000) },
      programExpiresAt:
        Math.floor(policyTemplate.expiresAt.value / 1000) * 1000,
    });
  }
  for (const pair of pairs) pair.openingPrice = describeLPPrice(pair);
  const retained = BigInt(intent.budget) - spending;
  if (
    retained <= 0n ||
    pairs.some((pair) => BigInt(pair.baseAmount) > retained)
  )
    return {
      available: false,
      reason: "Funding would consume the shared base reserve.",
    };
  const config = strategyConfigSchema.parse(request.config ?? {
    version: 1,
    recipeVersion: 1,
    family: "lp",
    recipeId: intent.recipeId,
    chainId: intent.chainId,
    maker: intent.maker,
    policy: policyTemplate,
    pairs,
  });
  if (config.family !== "lp") return {available:false,reason:"Only LP previews are supported."};
  if (config.pairs.some((pair) => {
    const observed = pairs.find((candidate) => candidate.baseToken.address === pair.baseToken.address && candidate.quoteToken.address === pair.quoteToken.address);
    return !observed || BigInt(pair.baseAmount) > retained || BigInt(pair.quoteAmount) > BigInt(observed.quoteAmount);
  })) return {available:false,reason:"The edited reserves exceed this fresh conservative funding preview. Reduce the amounts or obtain a new allocation."};
  const registrations = compileLP(config, `0x${"00".repeat(32)}`, Date.now());
  return {
    available: true,
    config,
    sourceSpend: spending.toString(),
    retainedSharedBase: retained.toString(),
    gasReserveWei: intent.gasReserveWei,
    compiled: registrations.map(({ pair, encodedBounds }) => ({
      pair,
      encodedBounds,
    })),
    simulation: "not-performed",
    limitations: [
      "A starting 5-basis-point fee and 20-percent bounds are editable recipe parameters, not an inferred optimal strategy.",
      "The preview uses exact observed quote amounts and conservative receipts; fresh routes and whole-batch simulation are mandatory before signing.",
      "Resolver discovery, future fills, gas estimates and returns remain unknown.",
    ],
  };
}
