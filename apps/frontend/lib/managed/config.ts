import { z } from "zod";
import {
  addressSchema,
  chainIdSchema,
  comparePrices,
  denominatedPriceSchema,
  integerAmountSchema,
  timestampSchema,
  tokenSchema,
} from "./primitives";
import { managementPolicySchema } from "./policy";

export const lpRangeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("full") }),
  z.strictObject({
    kind: z.literal("bounded"),
    lower: denominatedPriceSchema,
    upper: denominatedPriceSchema,
  }),
]);
export const lpPairSchema = z
  .strictObject({
    baseToken: tokenSchema,
    quoteToken: tokenSchema,
    baseAmount: integerAmountSchema,
    quoteAmount: integerAmountSchema,
    feeBps: z.number().int().min(0).max(100),
    openingPrice: denominatedPriceSchema,
    range: lpRangeSchema,
    programExpiresAt: timestampSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (
      !integerAmountSchema.safeParse(v.baseAmount).success ||
      !integerAmountSchema.safeParse(v.quoteAmount).success ||
      !denominatedPriceSchema.safeParse(v.openingPrice).success
    )
      return;
    if (
      v.range.kind === "bounded" &&
      (!denominatedPriceSchema.safeParse(v.range.lower).success ||
        !denominatedPriceSchema.safeParse(v.range.upper).success)
    )
      return;
    const matches = (p: z.infer<typeof denominatedPriceSchema>) =>
      p.baseToken === v.baseToken.address &&
      p.quoteToken === v.quoteToken.address;
    if (
      v.baseToken.address === v.quoteToken.address ||
      !matches(v.openingPrice)
    )
      ctx.addIssue({
        code: "custom",
        message: "Price denomination must match two different pair tokens.",
      });
    if (BigInt(v.baseAmount) === 0n || BigInt(v.quoteAmount) === 0n)
      ctx.addIssue({
        code: "custom",
        message: "LP requires positive inventory on both sides.",
      });
    if (v.range.kind === "bounded") {
      if (!matches(v.range.lower) || !matches(v.range.upper))
        ctx.addIssue({
          code: "custom",
          message: "Range denomination must match pair.",
        });
      else if (
        matches(v.openingPrice) &&
        (comparePrices(v.range.lower, v.openingPrice) >= 0 ||
          comparePrices(v.openingPrice, v.range.upper) >= 0)
      )
        ctx.addIssue({
          code: "custom",
          message: "Opening price must be strictly inside the range.",
        });
    }
  });
const common = {
  version: z.literal(1),
  recipeVersion: z.literal(1),
  chainId: chainIdSchema,
  maker: addressSchema,
  policy: managementPolicySchema,
};
export const lpStrategyConfigSchema = z.strictObject({
  ...common,
  family: z.literal("lp"),
  recipeId: z.enum([
    "wide-range-lp",
    "managed-concentrated-lp",
    "upward-only-lp",
  ]),
  pairs: z.array(lpPairSchema).min(1).max(6),
});
export const mmPairSchema = z
  .strictObject({
    baseToken: tokenSchema,
    quoteToken: tokenSchema,
    referencePrice: denominatedPriceSchema,
    buySpreadBps: z.number().int().min(1).max(9999),
    sellSpreadBps: z.number().int().min(1).max(10000),
    buyQuoteAmount: integerAmountSchema,
    sellBaseAmount: integerAmountSchema,
    inventoryTargetBps: z.number().int().min(0).max(10000),
    maxDeviationBps: z.number().int().min(0).max(10000),
    quoteExpiresAt: timestampSchema,
  })
  .refine(
    (v) =>
      v.referencePrice.baseToken === v.baseToken.address &&
      v.referencePrice.quoteToken === v.quoteToken.address,
    "MM reference denomination must match pair.",
  );
export const strategyConfigSchema = z
  .discriminatedUnion("family", [
    lpStrategyConfigSchema,
    z.strictObject({
      ...common,
      family: z.literal("mm"),
      recipeId: z.literal("inventory-aware-mm"),
      pairs: z.array(mmPairSchema).length(1),
    }),
  ])
  .superRefine((v, ctx) => {
    const keys = v.pairs.map((p) =>
      [p.baseToken.address, p.quoteToken.address].sort().join(":"),
    );
    if (new Set(keys).size !== keys.length)
      ctx.addIssue({ code: "custom", message: "Duplicate economic pair." });
    const allowed = new Set(v.policy.allowedAssets.value);
    if (
      v.pairs.some(
        (p) =>
          !allowed.has(p.baseToken.address) ||
          !allowed.has(p.quoteToken.address),
      )
    )
      ctx.addIssue({
        code: "custom",
        message: "Pair token is outside the authorized assets.",
      });
  });
export type StrategyConfig = z.infer<typeof strategyConfigSchema>;
export type LPStrategyConfig = z.infer<typeof lpStrategyConfigSchema>;
export type LPPair = z.infer<typeof lpPairSchema>;
