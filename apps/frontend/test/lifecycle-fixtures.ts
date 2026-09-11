import { encodeFunctionData, type Hex } from "viem";
import {
  AQUA,
  NATIVE,
  SWAP_VM,
  classicRouter,
  token,
  tokens,
  wrapped,
} from "../lib/config";
import { configFixture } from "./managed-fixtures";
import type { LPStrategyConfig } from "../lib/managed/config";
import { digest } from "../lib/server/lifecycle/digest";
import { aggregationSwapAbi } from "../lib/server/lifecycle/routes";
import type {
  LifecycleDependencies,
  LifecycleRequest,
  LifecycleRoute,
  RouteRequest,
} from "../lib/server/lifecycle/types";

export const now = 1800000000000;
export const hash = `0x${"12".repeat(32)}` as Hex;
const metadata = (t: ReturnType<typeof token>) => ({
  address: t.address,
  decimals: t.decimals,
  symbol: t.symbol,
});
export const base = metadata(wrapped(42161));
export const quote = metadata(tokens(42161).find((t) => t.symbol === "USDC")!);
export const native = metadata(token(42161, NATIVE));
export function lifecycleFixture(): LifecycleRequest {
  const config = configFixture() as LPStrategyConfig;
  config.pairs = [
    {
      baseToken: base,
      quoteToken: quote,
      baseAmount: "1000000000000000000",
      quoteAmount: "2000000000",
      feeBps: 5,
      openingPrice: {
        baseToken: base.address,
        quoteToken: quote.address,
        numerator: "2000",
        denominator: "1",
      },
      range: { kind: "full" },
      programExpiresAt: now + 600000,
    },
  ];
  config.policy.allowedAssets.value = [base.address, quote.address, NATIVE];
  config.policy.allowedRoutes.value = [classicRouter(42161)];
  return {
    id: "plan-1",
    groupId: "group-1",
    owner: config.maker,
    config,
    runGeneration: 1,
    kind: "fund-and-open",
    inventory: [
      { token: base, amount: "1000000000000000000" },
      { token: quote, amount: "2000000000" },
    ],
    gasReserveWei: "10000000000000000",
    expiresAt: now + 60000,
  };
}
export function routeFixture(request: RouteRequest): LifecycleRoute {
  const minimum =
    BigInt(request.minimumAmountOut) > 1n
      ? request.minimumAmountOut
      : "1000000";
  const router = classicRouter(request.chainId);
  return {
    call: {
      to: router,
      data: encodeFunctionData({
        abi: aggregationSwapAbi,
        functionName: "swap",
        args: [
          router,
          {
            srcToken: request.source.address,
            dstToken: request.destination.address,
            srcReceiver: router,
            dstReceiver: request.maker,
            amount: BigInt(request.amountIn),
            minReturnAmount: BigInt(minimum),
            flags: 0n,
          },
          "0x",
        ],
      }),
      value:
        request.source.address === NATIVE
          ? `0x${BigInt(request.amountIn).toString(16)}`
          : "0x0",
      label: "Test route",
    },
    spender: router,
    amountOut: minimum,
    minimumAmountOut: minimum,
    quotedAt: now,
    expiresAt: now + 30000,
  };
}
export function dependenciesFixture(): LifecycleDependencies {
  return {
    now: () => now,
    nonce: () => hash,
    snapshot: async (request) => ({
      chainId: 42161,
      maker: request.config.maker,
      observedAt: now,
      blockNumber: "100",
      blockHash: hash,
      nativeBalance: "10000000000000000000",
      balances: request.inventory,
      allowances: [],
      contracts: [AQUA, SWAP_VM, classicRouter(42161)].map((address) => ({
        address,
        codeHash: hash,
      })),
      strategies: request.previous ?? [],
    }),
    quote: async (request) => routeFixture(request),
    simulate: async (plan) => ({
      success: true,
      atomic: true,
      callsDigest: digest(plan.calls),
      blockNumber: "100",
      blockHash: hash,
      simulatedAt: now,
      estimatedGasWei: "1000000000000000",
    }),
  };
}
