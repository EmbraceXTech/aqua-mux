import { encodeFunctionData, parseAbi } from "viem";
import type { LifecyclePlan, Token, TokenAmount } from "../../managed";
import type { Plan } from "../../model";
import type { RoutePolicyRequest, VerifiedRoute } from "../route-policy/types";

export const implementation = "0xe6Cae83BdE06E4c305530e199D7217f42808555B";
export const implementationHash =
  "0xcc7b633aef4b2543cb8f37522adf1a401f910f0f6b2430c1eecc11f401ccfcf3";
const batchAbi = parseAbi([
  "function executeBatch((address target,uint256 value,bytes data)[] calls)",
]);

export function encodeDevBatch(calls: Plan["calls"]) {
  return encodeFunctionData({
    abi: batchAbi,
    functionName: "executeBatch",
    args: [
      calls.map((call) => ({
        target: call.to,
        value: BigInt(call.value),
        data: call.data,
      })),
    ],
  });
}

export type DevBatchPlan = Plan & {
  gasReserveWei?: string;
  deploymentEvidence?: LifecyclePlan["deploymentEvidence"];
  assetMetadata?: Token[];
  minimumReceipts?: TokenAmount[];
  verifiedRoutes?: { request: RoutePolicyRequest; route: VerifiedRoute }[];
};

export function lifecycleBatch(plan: LifecyclePlan): DevBatchPlan {
  return {
    account: plan.maker,
    chainId: plan.chainId,
    mode: "liquidity",
    calls: plan.calls,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
    strategies: [],
    summary: plan.expectedEffects,
    gasReserveWei: plan.gasReserveWei,
    deploymentEvidence: plan.deploymentEvidence,
    minimumReceipts: plan.minimumReceipts,
    assetMetadata: [
      ...plan.inventoryBefore,
      ...plan.conservativeInventoryAfter,
      ...plan.minimumReceipts,
    ].map((entry) => entry.token),
  };
}
