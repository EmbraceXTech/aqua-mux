import type { ManagementPolicy } from "../../managed/policy";
import { classicRouter } from "../../config";
import { verifiedToken } from "./snapshot";
import type { ProposalIntent } from "./inputs";

/** This template is a manual proposal constraint, never a delegated signing grant. */
export function proposalPolicy(
  intent: ProposalIntent,
  id: string,
  now: number,
): ManagementPolicy {
  const rule = <T>(value: T) => ({
    value,
    enforcedBy: "execution-broker" as const,
  });
  const advisory = <T>(value: T) => ({
    value,
    enforcedBy: "advisory-display" as const,
  });
  return {
    id,
    version: 1,
    intervalMs: rule(intent.intervalMs),
    cooldownMs: advisory(intent.intervalMs),
    maxActions: advisory(1),
    spendBudgets: advisory([
      {
        token: verifiedToken(intent.chainId, intent.fundingToken),
        amount: intent.budget,
      },
    ]),
    gasBudgetWei: advisory(intent.gasReserveWei),
    allowedAssets: rule(intent.permittedAssets),
    allowedRoutes: rule([classicRouter(intent.chainId)]),
    maxSlippageBps: rule(50),
    maxReferenceAgeMs: rule(60_000),
    expiresAt: rule(now + intent.holdingPeriodMs),
    allowedActions: rule([
      "hold",
      "fund-and-open",
      "close",
      "propose-conversion",
    ]),
    triggers: advisory({
      rangeExit: false,
      inventoryDriftBps: 10000,
      upwardOnly: intent.recipeId === "upward-only-lp",
    }),
  };
}
