import { z } from "zod";
import { strategyConfigSchema } from "./config";
import { lifecyclePlanSchema } from "./lifecycle";
import { reviewRecordSchema } from "./review";
import {
  addressSchema,
  chainIdSchema,
  hashSchema,
  hexSchema,
  idSchema,
  integerAmountSchema,
  timestampSchema,
  tokenAmountSchema,
  tokenSchema,
} from "./primitives";

const identity = { id: idSchema, owner: addressSchema };
const child = { ...identity, groupId: idSchema };
export const strategyGroupSchema = z
  .strictObject({
    ...identity,
    maker: addressSchema,
    chainId: chainIdSchema,
    config: strategyConfigSchema,
    state: z.enum(["draft", "active", "paused", "stopped", "closed"]),
    inventory: z.array(tokenAmountSchema).max(32),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
  })
  .superRefine((v, ctx) => {
    if (v.maker !== v.config.maker || v.chainId !== v.config.chainId)
      ctx.addIssue({
        code: "custom",
        message: "Group and configuration maker/chain differ.",
      });
    if (
      new Set(v.inventory.map((i) => i.token.address)).size !==
      v.inventory.length
    )
      ctx.addIssue({
        code: "custom",
        message: "Shared inventory must count each token once.",
      });
  });
export const botRunSchema = z.strictObject({
  ...child,
  mode: z.enum(["manual", "delegated"]),
  state: z.enum(["idle", "running", "paused", "stopped", "recovering"]),
  intervalMs: z.number().int().positive(),
  nextDueAt: timestampSchema,
  runGeneration: z.number().int().nonnegative(),
  policyId: idSchema,
  stopReason: z.string().max(2000).nullable(),
  lease: z
    .strictObject({
      sessionId: idSchema,
      heartbeatAt: timestampSchema,
      expiresAt: timestampSchema,
    })
    .nullable(),
});
export const transactionAttemptSchema = z.strictObject({
  ...child,
  planId: idSchema,
  idempotencyKey: idSchema,
  createdAt: timestampSchema,
  walletBatchId: z.string().max(240).nullable(),
  providerTransactionId: z.string().max(240).nullable(),
  transactionHash: hashSchema.nullable(),
  nonce: integerAmountSchema.nullable(),
  status: z.enum(["prepared", "submitted", "confirmed", "failed", "unknown"]),
  receipt: z.record(z.string(), z.unknown()).nullable(),
});
export const strategyInstanceSchema = z.strictObject({
  ...child,
  maker: addressSchema,
  app: addressSchema,
  hash: hashSchema,
  tokens: z.array(tokenSchema).min(2).max(32),
  program: hexSchema,
  registrationBlock: integerAmountSchema.nullable(),
  replaces: idSchema.nullable(),
  replacedBy: idSchema.nullable(),
  state: z.enum(["pending", "active", "docked", "unknown"]),
});
export const inventoryMovementSchema = z.strictObject({
  ...child,
  chainId: chainIdSchema,
  blockNumber: integerAmountSchema,
  blockHash: hashSchema,
  transactionHash: hashSchema,
  logIndex: z.number().int().nonnegative(),
  strategyId: idSchema.nullable(),
  kind: z.enum(["fill", "deposit", "withdrawal", "management", "unknown"]),
  deltas: z.array(
    z.strictObject({
      token: tokenSchema,
      amount: z
        .string()
        .max(79)
        .regex(/^-?(0|[1-9]\d*)$/),
    }),
  ),
  feeAccounting: z.enum(["known", "unknown"]),
  canonical: z.boolean(),
});
export const paymentRecordSchema = z.strictObject({
  ...child,
  reviewId: idSchema,
  amount: integerAmountSchema,
  asset: z.string().max(120),
  network: z.string().max(120),
  paymentState: z.enum([
    "uncharged",
    "quoted",
    "settled",
    "failed",
    "credited",
    "refunded",
  ]),
  fulfillmentState: z.enum(["pending", "fulfilled", "failed"]),
  settlementProof: z.string().max(2000).nullable(),
});
export const recordSchemas = {
  group: strategyGroupSchema,
  bot: botRunSchema,
  review: reviewRecordSchema.extend({ owner: addressSchema }),
  plan: lifecyclePlanSchema,
  transaction: transactionAttemptSchema,
  strategy: strategyInstanceSchema,
  movement: inventoryMovementSchema,
  payment: paymentRecordSchema,
};
export type RecordKind = keyof typeof recordSchemas;
export type Records = { [K in RecordKind]: z.infer<(typeof recordSchemas)[K]> };
export type StrategyGroup = Records["group"];
export type BotRun = Records["bot"];
export type TransactionAttempt = Records["transaction"];
export type StrategyInstance = Records["strategy"];
export type InventoryMovement = Records["movement"];
export type PaymentRecord = Records["payment"];
