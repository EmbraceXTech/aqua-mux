import { z } from "zod";
import {
  actionKindSchema,
  addressSchema,
  enforcementSchema,
  idSchema,
  integerAmountSchema,
  timestampSchema,
  tokenAmountSchema,
} from "./primitives";

const limit = <T extends z.ZodType>(value: T) =>
  z.strictObject({ value, enforcedBy: enforcementSchema });
const duration = z.number().int().positive().safe();
const bps = z.number().int().min(0).max(10000);
export const managementPolicySchema = z.strictObject({
  id: idSchema,
  version: z.literal(1),
  intervalMs: limit(duration),
  cooldownMs: limit(z.number().int().nonnegative().safe()),
  maxActions: limit(z.number().int().nonnegative().safe()),
  spendBudgets: limit(z.array(tokenAmountSchema).max(32)),
  gasBudgetWei: limit(integerAmountSchema),
  allowedAssets: limit(z.array(addressSchema).min(1).max(32)),
  allowedRoutes: limit(z.array(addressSchema).max(32)),
  maxSlippageBps: limit(bps),
  maxReferenceAgeMs: limit(duration),
  expiresAt: limit(timestampSchema),
  allowedActions: limit(z.array(actionKindSchema).min(1).max(5)),
  triggers: limit(
    z.strictObject({
      rangeExit: z.boolean(),
      inventoryDriftBps: bps,
      upwardOnly: z.boolean(),
    }),
  ),
});
export type ManagementPolicy = z.infer<typeof managementPolicySchema>;

/** This comparison deliberately requires fresh consent for any changed policy. */
export function requiresPolicyAuthorization(
  previous: ManagementPolicy,
  next: ManagementPolicy,
): boolean {
  return (
    JSON.stringify(managementPolicySchema.parse(previous)) !==
    JSON.stringify(managementPolicySchema.parse(next))
  );
}
