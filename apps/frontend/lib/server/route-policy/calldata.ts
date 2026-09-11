import { encodeFunctionData, parseAbi, type Address } from "viem";
import { NATIVE } from "../../config";
import type { Call } from "../../model";
import { directChainId } from "./direct/deployments";
import { poolDeployments, routerDeployments } from "./deployments";
import type { PoolDeployment, RoutePolicyRequest } from "./types";

export const transparentRouterAbi = parseAbi([
  "function unoswapTo(uint256 to,uint256 token,uint256 amount,uint256 minReturn,uint256 dex) returns(uint256 returnAmount)",
  "function ethUnoswapTo(uint256 to,uint256 minReturn,uint256 dex) payable returns(uint256 returnAmount)",
]);

export function positiveAmount(value: string): bigint {
  if (!/^[1-9][0-9]*$/.test(value))
    throw new Error("Route amount must be a positive integer.");
  const amount = BigInt(value);
  // V2 reserve arithmetic multiplies the input by a 32-bit fee numerator and a uint112 reserve.
  if (amount >= 1n << 112n)
    throw new Error("Route amount exceeds the supported bound.");
  return amount;
}

function address(value: string): Address {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value) || BigInt(value) === 0n)
    throw new Error("Invalid route address.");
  return value.toLowerCase() as Address;
}

export function canonicalRequest(
  request: RoutePolicyRequest,
): RoutePolicyRequest {
  if (
    !Number.isSafeInteger(request.chainId) ||
    (!routerDeployments[request.chainId] && request.chainId !== directChainId)
  )
    throw new Error(
      "No verified transparent router deployment for this chain.",
    );
  if (
    !Number.isSafeInteger(request.slippageBps) ||
    request.slippageBps < 0 ||
    request.slippageBps > 500
  )
    throw new Error(
      "Verified routes support slippage between 0 and 500 basis points.",
    );
  positiveAmount(request.amountIn);
  positiveAmount(request.minimumAmountOut);
  const source = address(request.source),
    destination = address(request.destination);
  if (source === destination)
    throw new Error("A route must exchange distinct assets.");
  return {
    chainId: request.chainId,
    maker: address(request.maker),
    source,
    destination,
    amountIn: request.amountIn,
    minimumAmountOut: request.minimumAmountOut,
    slippageBps: request.slippageBps,
  };
}

export function selectPool(request: RoutePolicyRequest): PoolDeployment {
  const router = routerDeployments[request.chainId];
  const source = request.source === NATIVE ? router.wrapped : request.source;
  const destination =
    request.destination === NATIVE ? router.wrapped : request.destination;
  const pool = poolDeployments.find(
    (p) =>
      p.chainId === request.chainId &&
      ((p.token0 === source && p.token1 === destination) ||
        (p.token1 === source && p.token0 === destination)),
  );
  if (!pool)
    throw new Error("No verified single-pool route for this token pair.");
  return pool;
}

/** Construct every allowed bit, rather than masking unknown bits out of API calldata. */
export function compileTransparentCall(
  request: RoutePolicyRequest,
  minimum: string,
): Call {
  const router = routerDeployments[request.chainId];
  const pool = selectPool(request);
  const source = request.source === NATIVE ? router.wrapped : request.source;
  let dex = BigInt(pool.address);
  if (source === pool.token0) dex |= 1n << 247n;
  if (pool.protocol === "uniswap-v3") dex |= 1n << 253n;
  else dex |= BigInt(1_000_000_000 - pool.fee) << 160n;
  if (request.destination === NATIVE) dex |= 1n << 252n;
  const data =
    request.source === NATIVE
      ? encodeFunctionData({
          abi: transparentRouterAbi,
          functionName: "ethUnoswapTo",
          args: [BigInt(request.maker), positiveAmount(minimum), dex],
        })
      : encodeFunctionData({
          abi: transparentRouterAbi,
          functionName: "unoswapTo",
          args: [
            BigInt(request.maker),
            BigInt(source),
            positiveAmount(request.amountIn),
            positiveAmount(minimum),
            dex,
          ],
        });
  return {
    to: router.address,
    data,
    value:
      request.source === NATIVE
        ? `0x${positiveAmount(request.amountIn).toString(16)}`
        : "0x0",
    label: "Swap through verified 1inch single-pool route",
  };
}
