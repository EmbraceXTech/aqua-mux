import { z } from "zod";
import { strategyConfigSchema } from "./config";
import {
  actionKindSchema,
  idSchema,
  integerAmountSchema,
  timestampSchema,
} from "./primitives";

export const sourceCoverageSchema = z.strictObject({
  source: z.string().min(1).max(240),
  observedAt: timestampSchema,
  status: z.enum(["complete", "partial", "unavailable"]),
  detail: z.string().max(2000).optional(),
});
export const reviewResultSchema = z
  .strictObject({
    version: z.literal(1),
    decision: actionKindSchema,
    rationale: z.string().min(1).max(12000),
    evidence: z.array(sourceCoverageSchema).max(64),
    proposedConfig: strategyConfigSchema.optional(),
    expectedEffects: z.array(z.string().max(2000)).max(32),
    uncertainties: z.array(z.string().max(2000)).max(32),
  })
  .superRefine((v, ctx) => {
    if (["fund-and-open", "replace"].includes(v.decision) && !v.proposedConfig)
      ctx.addIssue({
        code: "custom",
        message: "Opening and replacement reviews require a configuration.",
      });
  });
export type ReviewResult = z.infer<typeof reviewResultSchema>;
export const reviewRecordSchema = z.strictObject({
  id: idSchema,
  groupId: idSchema,
  botId: idSchema,
  owner: z.string(),
  createdAt: timestampSchema,
  runGeneration: z.number().int().nonnegative(),
  snapshot: z.record(z.string(), z.unknown()),
  coverage: z.array(sourceCoverageSchema),
  provider: z.string().max(160),
  model: z.string().max(160),
  runtimeVersion: z.string().max(160),
  status: z.enum(["pending", "succeeded", "failed", "cancelled"]),
  result: reviewResultSchema.optional(),
  errors: z.array(z.string().max(2000)),
  usage: z.strictObject({
    inputTokens: integerAmountSchema.optional(),
    outputTokens: integerAmountSchema.optional(),
    cost: z.string().max(100).nullable(),
  }),
});
export type ReviewRecord = z.infer<typeof reviewRecordSchema>;
