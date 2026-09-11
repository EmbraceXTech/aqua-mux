import { client } from "../../rpc";
import { canonicalRequest, positiveAmount } from "../calldata";
import { validateCompiledRoute } from "../validate";
import type { RoutePolicyRequest, VerifiedRoute } from "../types";
import { verifyRouteProvenance } from "../provenance";
import {
  compileDirectCalls,
  directPairAbi,
  selectDirectPool,
} from "./calldata";
import { directWrapped } from "./deployments";
import { NATIVE } from "../../../config";

export async function quoteDirectRoute(
  input: RoutePolicyRequest,
): Promise<VerifiedRoute> {
  const request = canonicalRequest(input),
    pool = selectDirectPool(request),
    rpc = client(request.chainId),
    quotedAt = Date.now();
  let amountOut: bigint;
  try {
    const reserves = await rpc.readContract({
      address: pool.address,
      abi: directPairAbi,
      functionName: "getReserves",
    });
    const source = request.source === NATIVE ? directWrapped : request.source;
    const [reserveIn, reserveOut] =
      source === pool.token0
        ? [reserves[0], reserves[1]]
        : [reserves[1], reserves[0]];
    const amount = positiveAmount(request.amountIn);
    // Reject input above one percent of the source reserve for this bounded single-pool policy.
    if (amount * 100n > reserveIn) throw new Error();
    const withFee = amount * 997n;
    amountOut = (withFee * reserveOut) / (reserveIn * 1000n + withFee);
  } catch {
    throw new Error(
      "The verified direct pool cannot quote this amount within its reserve bound.",
    );
  }
  if (amountOut < positiveAmount(request.minimumAmountOut))
    throw new Error("Direct-pool output is below the reviewed minimum.");
  const calls = compileDirectCalls(request, amountOut.toString());
  const route: VerifiedRoute = {
    request,
    call: calls.find((call) => call.to === pool.address)!,
    calls,
    approvalRequired: false,
    spender: pool.address,
    amountIn: request.amountIn,
    amountOut: amountOut.toString(),
    minimumAmountOut: amountOut.toString(),
    quotedAt,
    expiresAt: quotedAt + 30000,
    policy: { version: 2, poolId: pool.id },
  };
  validateCompiledRoute(request, route);
  await verifyRouteProvenance(route, rpc);
  return route;
}
