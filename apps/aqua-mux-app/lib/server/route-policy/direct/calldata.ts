import { encodeFunctionData, erc20Abi, parseAbi } from "viem";
import { NATIVE } from "../../../config";
import type { Call } from "../../../model";
import { positiveAmount } from "../calldata";
import type { RoutePolicyRequest } from "../types";
import { directPools, directWrapped } from "./deployments";
export const directPairAbi = parseAbi([
  "function swap(uint256 amount0Out,uint256 amount1Out,address to,bytes data)",
  "function getReserves() view returns(uint112 reserve0,uint112 reserve1,uint32 timestamp)",
  "function token0() view returns(address)",
  "function token1() view returns(address)",
  "function factory() view returns(address)",
]);
const wrappedAbi = parseAbi(["function withdraw(uint256 amount)"]);
export function selectDirectPool(request: RoutePolicyRequest) {
  const source = request.source === NATIVE ? directWrapped : request.source;
  const destination =
    request.destination === NATIVE ? directWrapped : request.destination;
  const pool = directPools.find(
    (pool) =>
      (pool.token0 === source && pool.token1 === destination) ||
      (pool.token1 === source && pool.token0 === destination),
  );
  if (!pool) throw new Error("No verified direct pool for this token pair.");
  return pool;
}
export function compileDirectCalls(
  request: RoutePolicyRequest,
  output: string,
): Call[] {
  const pool = selectDirectPool(request);
  const source = request.source === NATIVE ? directWrapped : request.source;
  const amount = positiveAmount(request.amountIn),
    minimum = positiveAmount(output);
  const calls: Call[] = [];
  if (request.source === NATIVE)
    calls.push({
      to: directWrapped,
      data: "0xd0e30db0",
      value: `0x${amount.toString(16)}`,
      label: "Wrap the exact direct-pool input",
    });
  calls.push({
    to: source,
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: "transfer",
      args: [pool.address, amount],
    }),
    value: "0x0",
    label: "Transfer exact input to the verified pool",
  });
  calls.push({
    to: pool.address,
    data: encodeFunctionData({
      abi: directPairAbi,
      functionName: "swap",
      args: [
        source === pool.token0 ? 0n : minimum,
        source === pool.token0 ? minimum : 0n,
        request.maker,
        "0x",
      ],
    }),
    value: "0x0",
    label: "Receive the exact verified pool output",
  });
  if (request.destination === NATIVE)
    calls.push({
      to: directWrapped,
      data: encodeFunctionData({
        abi: wrappedAbi,
        functionName: "withdraw",
        args: [minimum],
      }),
      value: "0x0",
      label: "Unwrap the exact direct-pool output",
    });
  return calls;
}
