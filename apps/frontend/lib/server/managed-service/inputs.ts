import { z } from "zod";
import {
  addressSchema,
  chainIdSchema,
  idSchema,
  integerAmountSchema,
} from "../../managed/primitives";
import { strategyConfigSchema } from "../../managed/config";
export const intentSchema = z
  .strictObject({
    recipeId: z.enum([
      "wide-range-lp",
      "managed-concentrated-lp",
      "upward-only-lp",
    ]),
    chainId: chainIdSchema,
    maker: addressSchema,
    fundingToken: addressSchema,
    budget: integerAmountSchema.refine((v) => BigInt(v) > 0n),
    gasReserveWei: integerAmountSchema,
    permittedAssets: z.array(addressSchema).min(2).max(12),
    holdingPeriodMs: z
      .number()
      .int()
      .positive()
      .max(365 * 86_400_000),
    intervalMs: z.number().int().min(30_000).max(86_400_000),
  })
  .refine(
    (v) => new Set(v.permittedAssets).size === v.permittedAssets.length,
    "Duplicate permitted asset.",
  );
export type ProposalIntent = z.infer<typeof intentSchema>;
export const groupInputSchema = z.strictObject({
  config: strategyConfigSchema,
  mode: z.enum(["manual", "delegated"]).default("manual"),
});
export const reviewInputSchema = z.strictObject({
  sessionId: idSchema,
  generation: z.number().int().nonnegative(),
  idempotencyKey: idSchema,
});
export const botInputSchema = z.strictObject({
  action: z.enum(["start", "resume", "stop", "heartbeat", "takeover"]),
  sessionId: idSchema,
  generation: z.number().int().nonnegative().optional(),
});
