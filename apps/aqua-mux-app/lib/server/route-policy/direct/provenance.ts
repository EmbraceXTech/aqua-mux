import { keccak256, type PublicClient } from "viem";
import type { ProvenanceReader } from "../provenance";
import { implementationSlot } from "../provenance";
import { directDependencies, restrictionEndBlock } from "./deployments";
import { directPairAbi, selectDirectPool } from "./calldata";
import type { RoutePolicyRequest } from "../types";
export type DirectReader = ProvenanceReader &
  Partial<Pick<PublicClient, "readContract" | "getBlockNumber">>;
export async function verifyDirectProvenance(
  request: RoutePolicyRequest,
  rpc: DirectReader,
) {
  if (
    !rpc.readContract ||
    !rpc.getBlockNumber ||
    (await rpc.getBlockNumber()) <= restrictionEndBlock
  )
    throw new Error("Direct route token restrictions are unverified.");
  for (const deployment of directDependencies) {
    const code = await rpc.getCode({ address: deployment.address });
    if (!code || keccak256(code) !== deployment.codeHash)
      throw new Error("Direct route dependency code changed.");
    if (deployment.implementation) {
      const slot = await rpc.getStorageAt?.({
        address: deployment.address,
        slot: implementationSlot,
      });
      if (
        slot?.toLowerCase() !==
        `0x${deployment.implementation.slice(2).padStart(64, "0")}`
      )
        throw new Error("Direct route proxy implementation changed.");
    }
  }
  const pool = selectDirectPool(request);
  for (const field of ["token0", "token1", "factory"] as const) {
    const value = await rpc.readContract({
      address: pool.address,
      abi: directPairAbi,
      functionName: field,
    });
    if (value.toLowerCase() !== pool[field])
      throw new Error("Direct route pool token or factory binding changed.");
  }
}
