import { parseUnits, formatUnits, type Address, type Hex } from "viem";
import { z } from "zod";
import { NATIVE, classicRouter, tokens } from "./config";

export const SWAP_CHAIN = 42161;
export const liveTokens = tokens(SWAP_CHAIN).map((token) => ({
  ...token,
  id: token.address,
  mark: token.symbol.slice(0, 1).toUpperCase(),
  color: "#687ce2",
}));

// Addresses, rather than ticker symbols, identify rows. Token lists can contain
// more than one token with the same ticker.
export type Symbol = string;
export type Side = "input" | "output";
export type Mode = "multi-in" | "multi-out";
export type Row = {
  symbol: Symbol;
  amount: string;
  weight: string;
  fee: "0.01" | "0.05" | "0.3" | "1";
};
export type Draft = { input: Row[]; output: Row[]; exact: Side };
export const getToken = (symbol: Symbol) => {
  const token = liveTokens.find(
    (token) => token.id === symbol || token.symbol === symbol,
  );
  if (!token) throw new Error("Token is not in the Arbitrum token list.");
  return token;
};
export const isNative = (symbol: Symbol) => getToken(symbol).address === NATIVE;
const tokenId = (ticker: string) => {
  const token = liveTokens.find((candidate) => candidate.symbol === ticker);
  if (!token) throw new Error(`${ticker} is not in the Arbitrum token list.`);
  return token.id;
};
export const row = (symbol: Symbol, amount = "", weight = "50"): Row => ({
  symbol: getToken(symbol).id,
  amount,
  weight,
  fee: "0.05",
});
export function initialDrafts(): Record<Mode, Draft> {
  return {
    "multi-out": {
      input: [row(tokenId("ETH"), "", "100")],
      output: [row(tokenId("USDC")), row(tokenId("WBTC"))],
      exact: "input",
    },
    "multi-in": {
      input: [row(tokenId("USDC")), row(tokenId("WBTC"))],
      output: [row(tokenId("ETH"), "", "100")],
      exact: "input",
    },
  };
}
const rowSchema = z.object({
  symbol: z
    .string()
    .refine(
      (address) => liveTokens.some((token) => token.id === address),
      "Token is not in the Arbitrum token list.",
    ),
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
export type SwapTransaction = {
  to: Address;
  data: Hex;
  value: string;
};
export type LiveQuote = {
  request: SwapRequest;
  legs: QuotedLeg[];
  amounts: Record<Side, string[]>;
  limits: Record<Side, string[]>;
  block: string;
  expiresAt: number;
  transactions?: SwapTransaction[];
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
    weights.some((weight) => weight <= 0) ||
    weights.reduce((sum, weight) => sum + weight, 0) !== 10000
  )
    throw new Error("Allocations must be positive and total 100%.");
  let used = 0n;
  return weights.map((weight, index) => {
    const value =
      index === weights.length - 1
        ? total - used
        : (total * BigInt(weight)) / 10000n;
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
  if (d.exact !== "input")
    throw new Error("1inch Classic Swap supports exact-input swaps only.");
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
export function buildSwap(quote: LiveQuote, index: number, now = Date.now()) {
  if (quote.expiresAt <= now)
    throw new Error("Quote expired. Refresh and review it again.");
  const transaction = quote.transactions?.[index];
  const leg = quote.legs[index];
  if (!transaction || !leg)
    throw new Error(
      "Quote has no 1inch transaction for this leg. Refresh and review again.",
    );
  if (transaction.to.toLowerCase() !== classicRouter(SWAP_CHAIN).toLowerCase())
    throw new Error("1inch returned an unexpected router.");
  if (!/^(0|[1-9]\d*)$/.test(transaction.value))
    throw new Error("1inch returned an invalid transaction value.");
  const expectedValue = isNative(leg.input) ? BigInt(leg.amountIn) : 0n;
  if (BigInt(transaction.value) !== expectedValue)
    throw new Error(
      "1inch transaction value does not match the reviewed input.",
    );
  return { ...transaction, value: BigInt(transaction.value) };
}
