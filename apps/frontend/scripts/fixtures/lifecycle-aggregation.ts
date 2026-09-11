import { decodeFunctionData, parseAbi } from "viem";
import { classicRouter, NATIVE } from "../../lib/config";
import { minimumOutput, uint } from "../../lib/managed-compiler/arithmetic";
import type {
  LifecycleRoute,
  RouteRequest,
} from "../../lib/server/lifecycle/types";

export const aggregationSwapAbi = parseAbi([
  "function swap(address executor,(address srcToken,address dstToken,address srcReceiver,address dstReceiver,uint256 amount,uint256 minReturnAmount,uint256 flags) desc,bytes data) payable returns(uint256 returnAmount,uint256 spentAmount)",
]);

/** Isolated local-fork fixture only. Never use this validator for product signing. */
export function validateFixtureAggregationRoute(
  request: RouteRequest,
  route: LifecycleRoute,
  now: number,
) {
  const router = classicRouter(request.chainId);
  if (
    route.call.to.toLowerCase() !== router ||
    route.spender.toLowerCase() !== router ||
    route.quotedAt > now ||
    now - route.quotedAt > 30000 ||
    route.expiresAt <= now
  )
    throw new Error("Route is stale or uses an unapproved router.");
  let decoded;
  try {
    decoded = decodeFunctionData({
      abi: aggregationSwapAbi,
      data: route.call.data,
    });
  } catch {
    throw new Error(
      "Route encoding is unsupported; refresh using a verifiable swap route.",
    );
  }
  const [, desc] = decoded.args;
  const minimum = uint(route.minimumAmountOut),
    expected = uint(route.amountOut);
  if (
    desc.srcToken.toLowerCase() !== request.source.address ||
    desc.dstToken.toLowerCase() !== request.destination.address ||
    desc.dstReceiver.toLowerCase() !== request.maker ||
    desc.amount !== uint(request.amountIn) ||
    desc.minReturnAmount !== minimum ||
    desc.flags !== 0n ||
    minimum < uint(request.minimumAmountOut) ||
    minimum < minimumOutput(expected, request.slippageBps) ||
    minimum > expected
  )
    throw new Error(
      "Route calldata does not enforce the reviewed assets, receiver, amount and minimum.",
    );
  if (
    BigInt(route.call.value) !==
    (request.source.address === NATIVE ? desc.amount : 0n)
  )
    throw new Error("Unexpected native value in route.");
}
