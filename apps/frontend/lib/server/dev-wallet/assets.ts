import { keccak256, erc20Abi, type PublicClient } from "viem";
import { NATIVE, tokens } from "../../config";
import { tokenSchema, type Token } from "../../managed";
import type { DevBatchPlan } from "./batch";
import { DevWalletError } from "./config";
import { implementationSlot } from "../route-policy/provenance";

// Extra metadata comes only from authoritative stored plans or registry resolution.
// The browser cannot supply a DevBatchPlan to the execution endpoint.
export function devPlanAssets(plan: DevBatchPlan): Token[] {
  const assets = new Map<string, Token>();
  for (const input of [
    ...tokens(plan.chainId),
    ...(plan.verifiedTokens ?? []),
    ...(plan.assetMetadata ?? []),
  ]) {
    const token = tokenSchema.parse({
      address: input.address,
      decimals: input.decimals,
      symbol: input.symbol,
    });
    const previous = assets.get(token.address);
    if (previous && previous.decimals !== token.decimals)
      throw new DevWalletError(
        "Conflicting token decimals in the reviewed plan.",
      );
    assets.set(token.address, token);
  }
  return [...assets.values()];
}

export async function verifyDevAssets(
  plan: DevBatchPlan,
  rpc: Pick<PublicClient, "getCode" | "readContract"> &
    Partial<Pick<PublicClient, "getStorageAt">>,
) {
  for (const deployment of plan.deploymentEvidence ?? []) {
    if (deployment.implementation) {
      const slot = await rpc.getStorageAt?.({
        address: deployment.address,
        slot: implementationSlot,
      });
      if (
        slot?.toLowerCase() !==
        `0x${deployment.implementation.slice(2).padStart(64, "0")}`
      )
        throw new DevWalletError(
          "A reviewed proxy implementation changed. Prepare a fresh plan.",
        );
    }
    const code = await rpc.getCode({ address: deployment.address });
    if (!code || keccak256(code) !== deployment.codeHash)
      throw new DevWalletError(
        "A reviewed deployment runtime changed. Prepare a fresh plan.",
      );
  }
  const approved = devPlanAssets(plan);
  const selected = new Set(
    [...(plan.verifiedTokens ?? []), ...(plan.assetMetadata ?? [])].map(
      (token) => token.address.toLowerCase(),
    ),
  );
  for (const token of approved.filter((token) => selected.has(token.address))) {
    if (token.address === NATIVE) {
      if (token.decimals !== 18)
        throw new DevWalletError("Native asset decimals do not match.");
      continue;
    }
    const code = await rpc.getCode({ address: token.address });
    if (!code || code === "0x")
      throw new DevWalletError("A reviewed token has no deployed contract.");
    const decimals = await rpc.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: "decimals",
    });
    if (decimals !== token.decimals)
      throw new DevWalletError(
        "A reviewed token's decimals changed. Prepare a fresh plan.",
      );
  }
}
