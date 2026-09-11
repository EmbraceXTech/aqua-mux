import { z } from "zod";
import type { Address, Hex } from "viem";

export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((v) => v.toLowerCase() as Address);
export const hexSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{2})*$/)
  .transform((v) => v as Hex);
export const quantityHexSchema = z
  .string()
  .max(66)
  .regex(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/)
  .transform((v) => v as Hex);
export const hashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((v) => v.toLowerCase() as Hex);
export const integerAmountSchema = z
  .string()
  .max(78)
  .regex(/^(0|[1-9]\d*)$/)
  .refine(
    (v) => /^(0|[1-9]\d*)$/.test(v) && BigInt(v) < 2n ** 256n,
    "Amount exceeds uint256.",
  );
export const positiveAmountSchema = integerAmountSchema.refine(
  (v) => /^(0|[1-9]\d*)$/.test(v) && BigInt(v) > 0n,
  "Amount must be positive.",
);
export const timestampSchema = z.number().int().nonnegative().safe();
export const idSchema = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9:_-]+$/);
export const chainIdSchema = z.union([
  z.literal(1),
  z.literal(42161),
  z.literal(56),
  z.literal(4663),
]);
export const tokenSchema = z.strictObject({
  address: addressSchema,
  decimals: z.number().int().min(0).max(36),
  symbol: z.string().min(1).max(32),
});
export const tokenAmountSchema = z.strictObject({
  token: tokenSchema,
  amount: integerAmountSchema,
});
export const actionKindSchema = z.enum([
  "hold",
  "fund-and-open",
  "replace",
  "close",
  "propose-conversion",
]);
export const enforcementSchema = z.enum([
  "strategy-program",
  "wallet-policy",
  "execution-broker",
  "advisory-display",
]);
export type Token = z.infer<typeof tokenSchema>;
export type TokenAmount = z.infer<typeof tokenAmountSchema>;
export type ActionKind = z.infer<typeof actionKindSchema>;
export type EnforcementLocation = z.infer<typeof enforcementSchema>;

/** Exact human price: numerator / denominator quote tokens for one base token. */
export const denominatedPriceSchema = z
  .strictObject({
    baseToken: addressSchema,
    quoteToken: addressSchema,
    numerator: positiveAmountSchema,
    denominator: positiveAmountSchema,
  })
  .refine((v) => v.baseToken !== v.quoteToken, "Price tokens must differ.");
export type DenominatedPrice = z.infer<typeof denominatedPriceSchema>;
export function comparePrices(
  a: DenominatedPrice,
  b: DenominatedPrice,
): number {
  if (a.baseToken !== b.baseToken || a.quoteToken !== b.quoteToken)
    throw new Error("Price denominations differ.");
  const left = BigInt(a.numerator) * BigInt(b.denominator);
  const right = BigInt(b.numerator) * BigInt(a.denominator);
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Raw quote units / raw base units. Sorting belongs to the compiler, not display. */
export function rawPriceRatio(
  price: DenominatedPrice,
  base: Token,
  quote: Token,
) {
  denominatedPriceSchema.parse(price);
  tokenSchema.parse(base);
  tokenSchema.parse(quote);
  if (price.baseToken !== base.address || price.quoteToken !== quote.address)
    throw new Error("Price denomination does not match pair.");
  return {
    numerator: BigInt(price.numerator) * 10n ** BigInt(quote.decimals),
    denominator: BigInt(price.denominator) * 10n ** BigInt(base.decimals),
  };
}
