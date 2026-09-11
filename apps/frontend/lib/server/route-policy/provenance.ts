import { keccak256, type Address, type Hex } from "viem";
import { client } from "../rpc";
import { canonicalRequest, selectPool } from "./calldata";
import { routerDeployments } from "./deployments";
import type { VerifiedRoute } from "./types";
import { validateCompiledRoute } from "./validate";

export type ProvenanceReader = {
  getChainId(): Promise<number>;
  getCode(args: { address: Address }): Promise<Hex | undefined>;
};

/** Run again immediately before signing/broadcast; do not trust persisted hash claims. */
export async function verifyRouteProvenance(
  route: VerifiedRoute,
  reader?: ProvenanceReader,
): Promise<void> {
  validateCompiledRoute(route.request, route);
  const request = canonicalRequest(route.request);
  const rpc = reader ?? client(request.chainId);
  if ((await rpc.getChainId()) !== request.chainId)
    throw new Error("Route RPC chain mismatch.");
  const router = routerDeployments[request.chainId],
    pool = selectPool(request);
  for (const deployment of [router, pool]) {
    const code = await rpc.getCode({ address: deployment.address });
    if (!code || code === "0x" || keccak256(code) !== deployment.codeHash)
      throw new Error(
        "Verified route deployment code changed or is unavailable.",
      );
  }
}
