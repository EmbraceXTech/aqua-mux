import {
  encodeFunctionData,
  parseAbi,
  parseUnits,
  formatUnits,
  type Address,
} from "viem";
import { z } from "zod";
import { NATIVE } from "./config";

// Arbitrum deployment references are documented in components/swap/README.md.
export const SWAP_CHAIN = 42161;
export const SWAP_DEADLINE_SECONDS = 600;
export const V3_ROUTER =
  "0xe592427a0aece92de3edee1f18e0157c05861564" as Address;
export const V3_QUOTER =
  "0xb27308f9f90d607463bb33ea1bebb41c27ce5ab6" as Address;
export const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1" as Address;
export const liveTokens = [
  {
    symbol: "ETH",
    name: "Ether",
    address: NATIVE,
    decimals: 18,
    mark: "♦",
    color: "#687ce2",
  },
  {
    symbol: "USDC",
    name: "USD Coin",
    address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    decimals: 6,
    mark: "$",
    color: "#2775ca",
  },
  {
    symbol: "WBTC",
    name: "Wrapped Bitcoin",
    address: "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
    decimals: 8,
    mark: "₿",
    color: "#ed982c",
  },
  {
    symbol: "ARB",
    name: "Arbitrum",
    address: "0x912ce59144191c1204e64559fe8253a0e49e6548",
    decimals: 18,
    mark: "A",
    color: "#299bd5",
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    address: "0xf97f4df75117a78c1a5a0dbb814af92458539fb4",
    decimals: 18,
    mark: "⬡",
    color: "#305bd3",
  },
  {
    symbol: "DAI",
    name: "Dai",
    address: "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
    decimals: 18,
    mark: "◈",
    color: "#e9b33b",
  },
] as const satisfies readonly {
  symbol: string;
  name: string;
  address: Address;
  decimals: number;
  mark: string;
  color: string;
}[];
export type Symbol = (typeof liveTokens)[number]["symbol"];
export type Side = "input" | "output";
export type Mode = "multi-in" | "multi-out";
export type Row = {
  symbol: Symbol;
  amount: string;
  weight: string;
  fee: "0.01" | "0.05" | "0.3" | "1";
};
export type Draft = { input: Row[]; output: Row[]; exact: Side };
export const getToken = (symbol: Symbol) =>
  liveTokens.find((t) => t.symbol === symbol)!;
export const poolAddress = (symbol: Symbol) =>
  symbol === "ETH" ? WETH : getToken(symbol).address;
export const row = (symbol: Symbol, amount = "", weight = "50"): Row => ({
  symbol,
  amount,
  weight,
  fee: "0.05",
});
export function initialDrafts(): Record<Mode, Draft> {
  return {
    "multi-out": {
      input: [row("ETH", "", "100")],
      output: [row("USDC"), row("WBTC")],
      exact: "input",
    },
    "multi-in": {
      input: [row("USDC"), row("WBTC")],
      output: [row("ETH", "", "100")],
      exact: "input",
    },
  };
}
const rowSchema = z.object({
  symbol: z.enum(["ETH", "USDC", "WBTC", "ARB", "LINK", "DAI"]),
  amount: z.string().max(80),
  weight: z.string().max(10),
  fee: z.enum(["0.01", "0.05", "0.3", "1"]),
});
export const swapRequestSchema = z.object({
  chainId: z.literal(SWAP_CHAIN),
  mode: z.enum(["multi-in", "multi-out"]),
  draft: z.object({
    input: z.array(rowSchema).min(1).max(5),
    output: z.array(rowSchema).min(1).max(5),
    exact: z.enum(["input", "output"]),
  }),
  slippageBps: z.number().int().min(1).max(500),
});
export type SwapRequest = z.infer<typeof swapRequestSchema>;
export type RouteLeg = {
  input: Symbol;
  output: Symbol;
  fee: number;
  amount: string;
};
export type QuotedLeg = RouteLeg & {
  amountIn: string;
  amountOut: string;
  maxIn: string;
  minOut: string;
};
export type LiveQuote = {
  request: SwapRequest;
  legs: QuotedLeg[];
  amounts: Record<Side, string[]>;
  limits: Record<Side, string[]>;
  block: string;
  expiresAt: number;
};
export function tokenUnits(amount: string, symbol: Symbol) {
  const decimals = getToken(symbol).decimals;
  if (
    !/^(0|[1-9]\d*)(\.\d+)?$/.test(amount) ||
    (amount.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(
      `Enter a valid ${symbol} amount with at most ${decimals} decimals.`,
    );
  const value = parseUnits(amount, decimals);
  if (value <= 0n || value >= 2n ** 128n)
    throw new Error(`Enter a positive, supported ${symbol} amount.`);
  return value;
}
function allocate(total: bigint, rows: Row[]) {
  if (rows.length === 1) return [total];
  const weights = rows.map((r) => {
    if (!/^\d+(\.\d{1,2})?$/.test(r.weight))
      throw new Error("Allocations support up to two decimal places.");
    return Number(parseUnits(r.weight, 2));
  });
  if (
    weights.some((w) => w <= 0) ||
    weights.reduce((a, b) => a + b, 0) !== 10000
  )
    throw new Error("Allocations must be positive and total 100%.");
  let used = 0n;
  return weights.map((w, i) => {
    const value =
      i === weights.length - 1 ? total - used : (total * BigInt(w)) / 10000n;
    used += value;
    if (!value) throw new Error("Amount is too small for this allocation.");
    return value;
  });
}
export function routeLegs(input: unknown): {
  request: SwapRequest;
  legs: RouteLeg[];
} {
  const request = swapRequestSchema.parse(input);
  const { draft: d, mode } = request;
  const multi = mode === "multi-in" ? "input" : "output";
  const single = multi === "input" ? "output" : "input";
  if (d[single].length !== 1)
    throw new Error(`Choose one ${single} token for this mode.`);
  const symbols = [...d.input, ...d.output].map((r) => r.symbol);
  if (new Set(symbols).size !== symbols.length)
    throw new Error("Choose a different token for each row.");
  const amounts =
    d.exact === multi
      ? d[multi].map((r) => tokenUnits(r.amount, r.symbol))
      : allocate(
          tokenUnits(d[single][0].amount, d[single][0].symbol),
          d[multi],
        );
  return {
    request,
    legs: d[multi].map((r, i) => ({
      input: multi === "input" ? r.symbol : d.input[0].symbol,
      output: multi === "output" ? r.symbol : d.output[0].symbol,
      fee: Number(parseUnits(r.fee, 4)),
      amount: amounts[i].toString(),
    })),
  };
}
export function finishQuote(
  request: SwapRequest,
  routes: RouteLeg[],
  results: bigint[],
  block: bigint,
  now = Date.now(),
): LiveQuote {
  const legs = routes.map((leg, i): QuotedLeg => {
    if (results[i] <= 0n)
      throw new Error("No liquidity for this amount and fee tier.");
    const amountIn =
      request.draft.exact === "input" ? BigInt(leg.amount) : results[i];
    const amountOut =
      request.draft.exact === "output" ? BigInt(leg.amount) : results[i];
    const maxIn =
      request.draft.exact === "input"
        ? amountIn
        : (amountIn * BigInt(10000 + request.slippageBps) + 9999n) / 10000n;
    const minOut =
      request.draft.exact === "output"
        ? amountOut
        : (amountOut * BigInt(10000 - request.slippageBps)) / 10000n;
    if (minOut === 0n)
      throw new Error("Minimum output rounds to zero. Increase the amount.");
    return {
      ...leg,
      amountIn: String(amountIn),
      amountOut: String(amountOut),
      maxIn: String(maxIn),
      minOut: String(minOut),
    };
  });
  const totals = (side: Side, limit: boolean) =>
    request.draft[side].map((r) =>
      formatUnits(
        legs
          .filter((l) => l[side] === r.symbol)
          .reduce(
            (sum, l) =>
              sum +
              BigInt(
                side === "input"
                  ? limit
                    ? l.maxIn
                    : l.amountIn
                  : limit
                    ? l.minOut
                    : l.amountOut,
              ),
            0n,
          ),
        getToken(r.symbol).decimals,
      ),
    );
  return {
    request,
    legs,
    amounts: { input: totals("input", false), output: totals("output", false) },
    limits: { input: totals("input", true), output: totals("output", true) },
    block: String(block),
    expiresAt: now + 30000,
  };
}
export const quoterAbi = parseAbi([
  "function quoteExactInputSingle(address tokenIn,address tokenOut,uint24 fee,uint256 amountIn,uint160 sqrtPriceLimitX96) returns (uint256 amountOut)",
  "function quoteExactOutputSingle(address tokenIn,address tokenOut,uint24 fee,uint256 amountOut,uint160 sqrtPriceLimitX96) returns (uint256 amountIn)",
]);
export const routerAbi = parseAbi([
  "function exactInputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountOut)",
  "function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)",
  "function multicall(bytes[] data) payable returns (bytes[] results)",
  "function unwrapWETH9(uint256 amountMinimum,address recipient) payable",
  "function refundETH() payable",
]);
export function buildSwap(
  quote: LiveQuote,
  account: Address,
  now = Date.now(),
) {
  if (quote.expiresAt <= now)
    throw new Error("Quote expired. Refresh and review it again.");
  const deadline = BigInt(Math.floor(now / 1000) + SWAP_DEADLINE_SECONDS);
  const calls = quote.legs.map((l) => {
    const common = {
      tokenIn: poolAddress(l.input),
      tokenOut: poolAddress(l.output),
      fee: l.fee,
      recipient: l.output === "ETH" ? V3_ROUTER : account,
      deadline,
      sqrtPriceLimitX96: 0n,
    };
    return quote.request.draft.exact === "input"
      ? encodeFunctionData({
          abi: routerAbi,
          functionName: "exactInputSingle",
          args: [
            {
              ...common,
              amountIn: BigInt(l.amountIn),
              amountOutMinimum: BigInt(l.minOut),
            },
          ],
        })
      : encodeFunctionData({
          abi: routerAbi,
          functionName: "exactOutputSingle",
          args: [
            {
              ...common,
              amountOut: BigInt(l.amountOut),
              amountInMaximum: BigInt(l.maxIn),
            },
          ],
        });
  });
  const ethOut = quote.legs.filter((l) => l.output === "ETH");
  if (ethOut.length)
    calls.push(
      encodeFunctionData({
        abi: routerAbi,
        functionName: "unwrapWETH9",
        args: [ethOut.reduce((s, l) => s + BigInt(l.minOut), 0n), account],
      }),
    );
  const value = quote.legs
    .filter((l) => l.input === "ETH")
    .reduce((s, l) => s + BigInt(l.maxIn), 0n);
  if (value > 0n)
    calls.push(
      encodeFunctionData({ abi: routerAbi, functionName: "refundETH" }),
    );
  return {
    to: V3_ROUTER,
    data: encodeFunctionData({
      abi: routerAbi,
      functionName: "multicall",
      args: [calls],
    }),
    value,
  };
}
