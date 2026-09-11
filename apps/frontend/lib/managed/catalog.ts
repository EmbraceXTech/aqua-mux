import type { StrategyConfig } from "./config";

const evidence =
  "references/ethglobal-competitive-analysis/delegation-mm-spike-results.md";
export const capabilities = {
  manualLP: {
    enabled: true,
    reason: "Requires owner confirmation and a compatible atomic wallet batch.",
  },
  delegatedPrivy: {
    enabled: false,
    reason:
      "No authenticated provisioned-wallet test proves allowed batches, nested-call refusal, expiry, revocation, or owner recovery.",
    evidence,
  },
  directionalMM: {
    enabled: false,
    reason:
      "Installed Aqua SDK and deployed routers do not support LimitSwap; a separately verified directional app and fill acceptance suite are required.",
    evidence,
  },
} as const;
export const strategyCatalog = [
  {
    id: "wide-range-lp",
    version: 1,
    family: "lp",
    status: "available",
    objective: "Provide full or wide range shared liquidity.",
    actions: ["hold", "fund-and-open", "close", "propose-conversion"],
    risk: "Inventory value can fall and shared reserves can become underbacked.",
    reason: capabilities.manualLP.reason,
  },
  {
    id: "managed-concentrated-lp",
    version: 1,
    family: "lp",
    status: "experimental",
    objective: "Review range exits and propose bounded replacements.",
    actions: [
      "hold",
      "fund-and-open",
      "replace",
      "close",
      "propose-conversion",
    ],
    risk: "Replacement incurs costs and can realize losses.",
    reason:
      "Owner-confirmed replacements require fresh deterministic plans; delegated execution is disabled.",
  },
  {
    id: "upward-only-lp",
    version: 1,
    family: "lp",
    status: "experimental",
    objective: "Propose upward replacements only when policy permits.",
    actions: [
      "hold",
      "fund-and-open",
      "replace",
      "close",
      "propose-conversion",
    ],
    risk: "Declines can leave positions inactive and do not prevent inventory loss.",
    reason:
      "Directional policy must pass at the execution broker before any replacement.",
  },
  {
    id: "inventory-aware-mm",
    version: 1,
    family: "mm",
    status: "unavailable",
    objective: "Maintain separate bounded buy and sell quotes.",
    actions: [],
    risk: "Adverse selection and costs can exceed spread receipts.",
    reason: capabilities.directionalMM.reason,
  },
] as const;
export function assertCapability(
  config: StrategyConfig,
  mode: "manual" | "delegated",
) {
  if (config.family === "mm")
    throw new Error(capabilities.directionalMM.reason);
  if (mode === "delegated") throw new Error(capabilities.delegatedPrivy.reason);
}
