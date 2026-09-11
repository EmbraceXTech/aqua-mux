import { keccak256, parseAbi } from "viem";
import { NATIVE } from "../../config";
import { client } from "../rpc";
import {
  canonicalRequest,
  compileTransparentCall,
  positiveAmount,
  selectPool,
} from "./calldata";
import { routerDeployments } from "./deployments";
import { verifyRouteProvenance } from "./provenance";
import type { RoutePolicyRequest, VerifiedRoute } from "./types";
import { validateCompiledRoute } from "./validate";

const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns(uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
]);
const reservesAbi = parseAbi([
  "function getReserves() view returns(uint112 reserve0,uint112 reserve1,uint32 blockTimestampLast)",
]);

/** Quote a pinned pool on chain and construct transparent 1inch calldata locally.
 * API executor bytes are deliberately never forwarded or rewritten.
 */
export async function quoteVerifiedRoute(
  input: RoutePolicyRequest,
): Promise<VerifiedRoute> {
  const request = canonicalRequest(input);
  const pool = selectPool(request),
    router = routerDeployments[request.chainId];
  const quotedAt = Date.now(),
    rpc = client(request.chainId);
  const source = request.source === NATIVE ? router.wrapped : request.source;
  const destination =
    request.destination === NATIVE ? router.wrapped : request.destination;
  let amountOut: bigint;
  try {
    if (pool.protocol === "uniswap-v3") {
      if (!router.quoter || !router.quoterCodeHash) throw new Error();
      const quoterCode = await rpc.getCode({ address: router.quoter });
      if (!quoterCode || keccak256(quoterCode) !== router.quoterCodeHash)
        throw new Error();
      const { result } = await rpc.simulateContract({
        address: router.quoter,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            tokenIn: source,
            tokenOut: destination,
            amountIn: positiveAmount(request.amountIn),
            fee: pool.fee,
            sqrtPriceLimitX96: 0n,
          },
        ],
      });
      amountOut = result[0];
    } else {
      const [reserve0, reserve1] = await rpc.readContract({
        address: pool.address,
        abi: reservesAbi,
        functionName: "getReserves",
      });
      const [reserveIn, reserveOut] =
        source === pool.token0 ? [reserve0, reserve1] : [reserve1, reserve0];
      const amountWithFee =
        positiveAmount(request.amountIn) * BigInt(1_000_000_000 - pool.fee);
      amountOut =
        (amountWithFee * reserveOut) /
        (reserveIn * 1_000_000_000n + amountWithFee);
    }
  } catch {
    // RPC errors may embed authenticated endpoint URLs.
    throw new Error("The verified pool could not provide a read-only quote.");
  }
  const slippageMinimum =
    (amountOut * BigInt(10_000 - request.slippageBps)) / 10_000n;
  const requestedMinimum = positiveAmount(request.minimumAmountOut);
  const minimum =
    slippageMinimum > requestedMinimum ? slippageMinimum : requestedMinimum;
  const route: VerifiedRoute = {
    request,
    call: compileTransparentCall(request, minimum.toString()),
    spender: router.address,
    amountIn: request.amountIn,
    amountOut: amountOut.toString(),
    minimumAmountOut: minimum.toString(),
    quotedAt,
    expiresAt: quotedAt + 30_000,
    policy: { version: 1, poolId: pool.id },
  };
  validateCompiledRoute(request, route);
  try {
    await verifyRouteProvenance(route, rpc);
  } catch {
    throw new Error(
      "The verified route deployment or RPC chain could not be confirmed.",
    );
  }
  return route;
}
