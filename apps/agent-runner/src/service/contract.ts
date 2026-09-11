import { createHash } from "node:crypto";
import { z } from "zod";
import { strategyConfigSchema } from "../../../frontend/lib/managed/config";
import {
  reviewResultSchema,
  sourceCoverageSchema,
} from "../../../frontend/lib/managed/review";
import {
  addressSchema,
  chainIdSchema,
  hashSchema,
  idSchema,
  integerAmountSchema,
  timestampSchema,
  tokenAmountSchema,
  tokenSchema,
} from "../../../frontend/lib/managed/primitives";
import { intentSchema } from "../../../frontend/lib/server/managed-service/inputs";
import { managementPolicySchema } from "../../../frontend/lib/managed/policy";
import { strategyInstanceSchema } from "../../../frontend/lib/managed/records";
import { ServiceError } from "./errors";

export { reviewResultSchema };
export const snapshotSchema = z.strictObject({
  tokenMetadata: z
    .strictObject({
      chainId: chainIdSchema,
      tokens: z.array(tokenSchema).max(32),
    })
    .optional(),
  observedAt: timestampSchema,
  blockNumber: integerAmountSchema,
  blockHash: hashSchema,
  blockTimestamp: timestampSchema,
  chainId: chainIdSchema,
  maker: addressSchema,
  nativeBalanceWei: integerAmountSchema,
  balances: z.array(tokenAmountSchema).max(32),
  allowances: z
    .array(
      z.strictObject({
        token: tokenSchema,
        spender: addressSchema,
        amount: integerAmountSchema,
      }),
    )
    .max(64),
  coverage: z.array(sourceCoverageSchema).min(1).max(64),
  managedStrategies: z.array(strategyInstanceSchema).max(64).optional(),
  positionReconciliation: z.record(z.string(), z.unknown()).optional(),
  routeQuotes: z
    .array(
      z.strictObject({
        source: z.string().min(1).max(240),
        fromToken: tokenSchema,
        toToken: tokenSchema,
        amountIn: integerAmountSchema,
        amountOut: integerAmountSchema,
        observedAt: timestampSchema,
        expiresAt: timestampSchema,
      }),
    )
    .max(32)
    .optional(),
});

export const requestSchema = z
  .strictObject({
    requestId: idSchema,
    owner: addressSchema,
    groupId: idSchema,
    botId: idSchema.optional(),
    runGeneration: z.number().int().nonnegative().safe(),
    purpose: z.enum(["proposal", "interval"]),
    config: strategyConfigSchema.optional(),
    intent: intentSchema.optional(),
    policyTemplate: managementPolicySchema.optional(),
    snapshot: snapshotSchema,
    deadline: timestampSchema.optional(),
  })
  .refine(
    (v) => Boolean(v.config || (v.purpose === "proposal" && v.intent)),
    "Configuration or proposal intent required.",
  );

export type ReviewRequest = z.infer<typeof requestSchema>;
export type ReviewResponse = {
  requestId: string;
  result: z.infer<typeof reviewResultSchema>;
  provider: string;
  model: string;
  runtimeVersion: string;
  usage: { inputTokens?: string; outputTokens?: string; cost: string | null };
};
export type ProviderReview = (
  request: ReviewRequest,
  signal: AbortSignal,
) => Promise<
  Omit<ReviewResponse, "requestId" | "result"> & { result: unknown }
>;

export function parseRequest(
  body: unknown,
  key: string | undefined,
): ReviewRequest {
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) throw new ServiceError(400, "invalid_request");
  if (key !== parsed.data.requestId)
    throw new ServiceError(400, "idempotency_key_mismatch");
  return parsed.data;
}

export function validateFreshRequest(
  request: ReviewRequest,
  now = Date.now(),
): void {
  const { config, intent, snapshot } = request;
  const identity = config ?? intent!;
  if (
    snapshot.chainId !== identity.chainId ||
    snapshot.maker !== identity.maker
  )
    throw new ServiceError(400, "snapshot_identity_mismatch");
  if (
    config &&
    intent &&
    (config.chainId !== intent.chainId ||
      config.maker !== intent.maker ||
      config.recipeId !== intent.recipeId)
  )
    throw new ServiceError(400, "intent_config_mismatch");
  const age = Math.min(
    config?.policy.maxReferenceAgeMs.value ?? 60_000,
    120_000,
  );
  const fresh = (time: number) => time <= now + 10_000 && now - time <= age;
  if (
    !fresh(snapshot.observedAt) ||
    !fresh(snapshot.blockTimestamp) ||
    snapshot.coverage.some((v) => !fresh(v.observedAt))
  )
    throw new ServiceError(422, "stale_snapshot");
  if (
    snapshot.routeQuotes?.some(
      (v) =>
        !fresh(v.observedAt) ||
        v.expiresAt <= now ||
        v.expiresAt < v.observedAt,
    )
  )
    throw new ServiceError(422, "stale_quote");
  if (request.deadline !== undefined && request.deadline <= now)
    throw new ServiceError(408, "deadline_exceeded");
  if ((config?.policy ?? request.policyTemplate)?.expiresAt.value! <= now)
    throw new ServiceError(422, "policy_expired");
  const addresses = snapshot.balances.map((v) => v.token.address);
  if (new Set(addresses).size !== addresses.length)
    throw new ServiceError(400, "duplicate_balance");
  const allowed = new Map(
    snapshot.balances.map((v) => [v.token.address, v.token]),
  );
  if (
    snapshot.tokenMetadata &&
    (snapshot.tokenMetadata.chainId !== snapshot.chainId ||
      new Set(snapshot.tokenMetadata.tokens.map((token) => token.address))
        .size !== snapshot.tokenMetadata.tokens.length ||
      snapshot.balances.some(
        (row) =>
          canonical(
            snapshot.tokenMetadata!.tokens.find(
              (token) => token.address === row.token.address,
            ),
          ) !== canonical(row.token),
      ))
  )
    throw new ServiceError(400, "snapshot_token_mismatch");
  if (
    config?.pairs.some((p) =>
      [p.baseToken, p.quoteToken].some(
        (t) => canonical(allowed.get(t.address)) !== canonical(t),
      ),
    )
  )
    throw new ServiceError(400, "snapshot_token_mismatch");
}

export function validateResult(
  value: unknown,
  request: ReviewRequest,
): ReviewResponse["result"] {
  const parsed = reviewResultSchema.safeParse(value);
  if (!parsed.success) throw new ServiceError(502, "invalid_review_result");
  const result = parsed.data;
  const policy = request.config?.policy ?? request.policyTemplate;
  if (policy && !policy.allowedActions.value.includes(result.decision))
    throw new ServiceError(502, "action_outside_policy");
  if (result.proposedConfig) {
    const next = result.proposedConfig;
    // A model can propose position parameters, never create or widen authorization.
    if (!policy || canonical(next.policy) !== canonical(policy))
      throw new ServiceError(502, "model_policy_mutation");
    const identity = request.config ?? {
      ...request.intent!,
      family: "lp",
      recipeVersion: 1,
    };
    if (
      ["chainId", "maker", "family", "recipeId", "recipeVersion"].some(
        (k) =>
          next[k as keyof typeof next] !== identity[k as keyof typeof identity],
      )
    )
      throw new ServiceError(502, "model_identity_mutation");
    if (
      request.intent &&
      next.pairs.some((p) =>
        [p.baseToken, p.quoteToken].some(
          (t) => !request.intent!.permittedAssets.includes(t.address),
        ),
      )
    )
      throw new ServiceError(502, "model_asset_mutation");
    const known = new Map(
      request.snapshot.balances.map((v) => [v.token.address, v.token]),
    );
    if (
      next.pairs.some((p) =>
        [p.baseToken, p.quoteToken].some(
          (t) => canonical(known.get(t.address)) !== canonical(t),
        ),
      )
    )
      throw new ServiceError(502, "model_token_mutation");
  }
  return result;
}

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function fingerprint(request: ReviewRequest): string {
  return createHash("sha256").update(canonical(request)).digest("hex");
}
