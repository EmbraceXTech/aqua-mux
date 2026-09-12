import { keccak256, type Address, type PublicClient } from "viem";
import { NATIVE } from "../../../config";
import { readProxyImplementation } from "../../proxy-implementation";
import {
  directChainId,
  directDependencies,
  directPools,
  restrictionEndBlock,
} from "./deployments";

type AssetReader = Pick<PublicClient, "getCode"> &
  Partial<Pick<PublicClient, "getStorageAt" | "getBlockNumber">>;
const verifiedTokens = new Set(
  directPools.flatMap((pool) => [pool.token0, pool.token1]),
);
const restrictedToken = directPools.find(
  (pool) => pool.id === "robinhood-weth-pons",
)!.token1;

/** Catalog discovery is broader than the source-attested Robinhood execution set. */
export async function verifyRobinhoodAssets(
  chainId: number,
  addresses: readonly Address[],
  rpc: AssetReader,
  blockNumber?: bigint,
) {
  if (chainId !== directChainId) return;
  for (const address of new Set(addresses)) {
    if (address === NATIVE) continue;
    if (!verifiedTokens.has(address))
      throw new Error(
        "Robinhood token source provenance is unavailable for this asset.",
      );
    if (address === restrictedToken) {
      const observedBlock = blockNumber ?? (await rpc.getBlockNumber?.());
      if (observedBlock === undefined || observedBlock <= restrictionEndBlock)
        throw new Error(
          "Robinhood token source provenance restrictions are unverified.",
        );
    }
    const deployment = directDependencies.find(
      (entry) => entry.address === address,
    )!;
    const implementation = rpc.getStorageAt
      ? await readProxyImplementation(
          { getStorageAt: rpc.getStorageAt },
          address,
          blockNumber,
        )
      : undefined;
    if (!rpc.getStorageAt || implementation !== deployment.implementation)
      throw new Error(
        "Robinhood token source provenance implementation differs.",
      );
    for (const dependency of [
      deployment,
      ...(implementation
        ? [
            directDependencies.find(
              (entry) => entry.address === implementation,
            )!,
          ]
        : []),
    ]) {
      const code = await rpc.getCode({
        address: dependency.address,
        blockNumber,
      });
      if (!code || keccak256(code) !== dependency.codeHash)
        throw new Error("Robinhood token source provenance runtime differs.");
    }
  }
}
