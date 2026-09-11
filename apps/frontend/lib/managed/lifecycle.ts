import { z } from "zod";
import {
  addressSchema,
  chainIdSchema,
  hashSchema,
  integerAmountSchema,
  quantityHexSchema,
  hexSchema,
  idSchema,
  timestampSchema,
  tokenAmountSchema,
} from "./primitives";

export const lifecycleRegistrationSchema = z
  .strictObject({
    hash: hashSchema,
    app: addressSchema,
    tokens: z.array(addressSchema).min(2).max(32),
    amounts: z.array(integerAmountSchema).min(2).max(32),
    program: hexSchema,
    strategy: hexSchema,
    replaces: hashSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.tokens.length !== v.amounts.length)
      ctx.addIssue({
        code: "custom",
        message: "Registration tokens and amounts must have equal lengths.",
      });
    if (new Set(v.tokens).size !== v.tokens.length)
      ctx.addIssue({
        code: "custom",
        message: "Registration tokens must be unique.",
      });
  });

export const lifecyclePlanSchema = z
  .strictObject({
    version: z.literal(1),
    id: idSchema,
    groupId: idSchema,
    owner: addressSchema,
    chainId: chainIdSchema,
    maker: addressSchema,
    kind: z.enum(["fund-and-open", "replace", "close", "close-and-convert"]),
    configDigest: hashSchema,
    snapshotDigest: hashSchema,
    routesDigest: hashSchema.optional(),
    policyDigest: hashSchema,
    runGeneration: z.number().int().nonnegative(),
    calls: z
      .array(
        z.strictObject({
          to: addressSchema,
          data: hexSchema,
          value: quantityHexSchema,
          label: z.string().min(1).max(240),
        }),
      )
      .min(1)
      .max(128),
    inventoryBefore: z.array(tokenAmountSchema).max(32),
    conservativeInventoryAfter: z.array(tokenAmountSchema).max(32),
    registrations: z.array(lifecycleRegistrationSchema).max(12),
    retirements: z
      .array(
        z.strictObject({
          hash: hashSchema,
          app: addressSchema,
          tokens: z.array(addressSchema).min(2),
        }),
      )
      .max(12),
    gasReserveWei: integerAmountSchema,
    estimatedGasWei: integerAmountSchema,
    simulation: z.strictObject({
      blockNumber: integerAmountSchema,
      blockHash: hashSchema,
      simulatedAt: timestampSchema,
      callsDigest: hashSchema,
    }),
    expectedEffects: z.array(z.string().max(2000)).max(64),
    minimumReceipts: z.array(tokenAmountSchema).max(32),
    createdAt: timestampSchema,
    expiresAt: timestampSchema,
    atomicRequired: z.literal(true),
    authorization: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("unconfirmed") }),
      z.strictObject({
        kind: z.literal("owner-confirmed"),
        confirmedAt: timestampSchema,
        digest: hashSchema,
      }),
      z.strictObject({
        kind: z.literal("policy"),
        evaluatedAt: timestampSchema,
        policyId: idSchema,
        allowed: z.boolean(),
        reasons: z.array(z.string().max(2000)),
      }),
    ]),
  })
  .refine(
    (v) => v.expiresAt > v.createdAt,
    "Plan expiry must follow creation.",
  );
export type LifecyclePlan = z.infer<typeof lifecyclePlanSchema>;
