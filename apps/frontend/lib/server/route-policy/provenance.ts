import { keccak256, type Address, type Hex } from "viem";
import { client } from "../rpc";
import { canonicalRequest, selectPool } from "./calldata";
import { routerDeployments } from "./deployments";
import type { VerifiedRoute } from "./types";
import { validateCompiledRoute } from "./validate";

export type ProvenanceReader = {
  getChainId(): Promise<number>;
  getCode(args: { address: Address }): Promise<Hex | undefined>;
  getStorageAt?(args: {
    address: Address;
    slot: Hex;
  }): Promise<Hex | undefined>;
};

export const implementationSlot =
  "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";

/** Run again immediately before signing/broadcast; do not trust persisted hash claims. */
export async function verifyRouteProvenance(
  route: VerifiedRoute,
  reader?: ProvenanceReader,
): Promise<void> {
  validateCompiledRoute(route.request, route);
  const request = canonicalRequest(route.request);
  const rpc = reader ?? client(request.chainId);
  try {
    if ((await rpc.getChainId()) !== request.chainId)
      throw new Error("Route RPC chain mismatch.");
    const router = routerDeployments[request.chainId],
      pool = selectPool(request);
    if (router.wrappedImplementation) {
      const stored = await rpc.getStorageAt?.({
        address: router.wrapped,
        slot: implementationSlot,
      });
      const expected = `0x${router.wrappedImplementation.address.slice(2).padStart(64, "0")}`;
      if (stored?.toLowerCase() !== expected)
        throw new Error(
          "Verified wrapped-token implementation changed or is unavailable.",
        );
    }
    for (const deployment of [
      router,
      pool,
      { address: router.wrapped, codeHash: router.wrappedCodeHash },
      ...(router.wrappedImplementation ? [router.wrappedImplementation] : []),
    ]) {
      const code = await rpc.getCode({ address: deployment.address });
      if (!code || code === "0x" || keccak256(code) !== deployment.codeHash)
        throw new Error(
          "Verified route deployment code changed or is unavailable.",
        );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      [
        "Route RPC chain mismatch.",
        "Verified route deployment code changed or is unavailable.",
        "Verified wrapped-token implementation changed or is unavailable.",
      ].includes(error.message)
    )
      throw error;
    throw new Error(
      "Route deployment verification failed. Check the configured RPC connection.",
    );
  }
  // RPC retries can consume the entire review window.
  validateCompiledRoute(route.request, route);
}
