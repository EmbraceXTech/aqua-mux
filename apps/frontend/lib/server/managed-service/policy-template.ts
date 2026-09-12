import type { ManagementPolicy } from "../../managed/policy";
import { routePolicyTargets } from "../route-policy";
import { verifiedToken } from "./snapshot";
import type { ProposalIntent } from "./inputs";
import type { ManagedTokenSnapshot } from "./tokens";

/** This template is a manual proposal constraint, never a delegated signing grant. */
export function proposalPolicy(
  intent: ProposalIntent,
  id: string,
  now: number,
  tokens?: ManagedTokenSnapshot,
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
    cooldownMs: rule(intent.intervalMs),
    maxActions: advisory(1),
    spendBudgets: advisory([
      {
        token: verifiedToken(intent.chainId, intent.fundingToken, tokens),
        amount: intent.budget,
      },
    ]),
    gasBudgetWei: advisory(intent.gasReserveWei),
    allowedAssets: rule(intent.permittedAssets),
    allowedRoutes: rule(routePolicyTargets(intent.chainId)),
    maxSlippageBps: rule(50),
    maxReferenceAgeMs: rule(60_000),
    expiresAt: rule(now + intent.holdingPeriodMs),
    allowedActions: rule([
      "hold",
      "fund-and-open",
      ...(intent.recipeId === "wide-range-lp" ? [] : ["replace" as const]),
      "close",
      "propose-conversion",
    ]),
    triggers: advisory({
      rangeExit: intent.recipeId !== "wide-range-lp",
      inventoryDriftBps: 10000,
      upwardOnly: intent.recipeId === "upward-only-lp",
    }),
  };
}
