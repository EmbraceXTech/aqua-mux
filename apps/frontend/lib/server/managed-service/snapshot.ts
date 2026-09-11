import { erc20Abi, type Address } from "viem";
import { AQUA, NATIVE } from "../../config";
import {
  ensureManagedTokens,
  verifiedToken,
  type ManagedTokenSnapshot,
} from "./tokens";
export { verifiedToken } from "./tokens";
import type { StrategyConfig } from "../../managed/config";
import type { Token, TokenAmount } from "../../managed/primitives";
import type { ProposalIntent } from "./inputs";
import { client } from "../rpc";
import { swapApi } from "../swap";
import { ManagedError } from "./errors";

export interface WalletSnapshot extends Record<string, unknown> {
  tokenMetadata: ManagedTokenSnapshot;
  observedAt: number;
  blockNumber: string;
  blockHash: string;
  blockTimestamp: number;
  chainId: number;
  maker: Address;
  nativeBalanceWei: string;
  balances: TokenAmount[];
  allowances: { token: Token; spender: Address; amount: string }[];
  routeQuotes?: {
    source: string;
    fromToken: Token;
    toToken: Token;
    amountIn: string;
    amountOut: string;
    observedAt: number;
    expiresAt: number;
  }[];
  coverage: {
    source: string;
    observedAt: number;
    status: "complete" | "partial" | "unavailable";
    detail?: string;
  }[];
}
export function validateConfigTokens(
  config: StrategyConfig,
  tokens?: ManagedTokenSnapshot,
) {
  for (const pair of config.pairs)
    for (const t of [pair.baseToken, pair.quoteToken]) {
      const known = verifiedToken(config.chainId, t.address, tokens);
      if (
        known.decimals !== t.decimals ||
        known.symbol !== t.symbol ||
        t.address === NATIVE
      )
        throw new ManagedError(
          "invalid_token",
          "Strategy token metadata must match the verified ERC20 catalog.",
          400,
        );
    }
}
export async function walletSnapshot(
  input: {
    chainId: number;
    maker: Address;
    assets: Address[];
    maxAgeMs: number;
    storedTokens?: Token[];
  },
  dependencies: {
    ensureTokens?: typeof ensureManagedTokens;
    rpc?: typeof client;
  } = {},
): Promise<WalletSnapshot> {
  const tokenMetadata = await (
    dependencies.ensureTokens ?? ensureManagedTokens
  )(input.chainId, input.assets, input.storedTokens);
  const c = (dependencies.rpc ?? client)(input.chainId);
  const block = await c.getBlock();
  if ((await c.getChainId()) !== input.chainId)
    throw new ManagedError(
      "wrong_chain",
      "The RPC returned the wrong network.",
      503,
    );
  const observedAt = Date.now();
  const blockTimestamp = Number(block.timestamp) * 1000;
  if (
    !block.hash ||
    observedAt - blockTimestamp > input.maxAgeMs ||
    blockTimestamp > observedAt + 10_000
  )
    throw new ManagedError(
      "stale_data",
      "The RPC returned a stale or invalid chain snapshot.",
    );
  const nativeBalanceWei = (
    await c.getBalance({ address: input.maker, blockNumber: block.number })
  ).toString();
  const assets = [...new Set(input.assets)]
    .filter((a) => a !== NATIVE)
    .map((a) => verifiedToken(input.chainId, a, tokenMetadata));
  const rows = await Promise.all(
    assets.map(async (token) => ({
      token,
      amount: (
        await c.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [input.maker],
          blockNumber: block.number,
        })
      ).toString(),
      allowance: (
        await c.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "allowance",
          args: [input.maker, AQUA],
          blockNumber: block.number,
        })
      ).toString(),
    })),
  );
  return {
    tokenMetadata,
    observedAt,
    blockNumber: block.number.toString(),
    blockHash: block.hash,
    blockTimestamp,
    chainId: input.chainId,
    maker: input.maker,
    nativeBalanceWei,
    balances: rows.map(({ token, amount }) => ({ token, amount })),
    allowances: rows.map(({ token, allowance }) => ({
      token,
      spender: AQUA,
      amount: allowance,
    })),
    coverage: [
      {
        source: "direct-rpc-wallet",
        observedAt: blockTimestamp,
        status: "complete",
      },
    ],
  };
}
export async function intentSnapshot(
  intent: ProposalIntent,
): Promise<WalletSnapshot> {
  const snapshot = await walletSnapshot({
    ...intent,
    assets: [...intent.permittedAssets, intent.fundingToken],
    maxAgeMs: 60_000,
  });
  const available =
    intent.fundingToken === NATIVE
      ? snapshot.nativeBalanceWei
      : (snapshot.balances.find((b) => b.token.address === intent.fundingToken)
          ?.amount ?? "0");
  const nativeRequired =
    BigInt(intent.gasReserveWei) +
    (intent.fundingToken === NATIVE ? BigInt(intent.budget) : 0n);
  if (
    BigInt(available) < BigInt(intent.budget) ||
    BigInt(snapshot.nativeBalanceWei) < nativeRequired
  )
    throw new ManagedError(
      "insufficient_balance",
      "Funding budget and reserved gas exceed the current wallet balances.",
      400,
    );
  const quotes = [];
  for (const asset of intent.permittedAssets.filter(
    (a) => a !== intent.fundingToken,
  )) {
    try {
      const amountIn = (
        BigInt(intent.budget) / BigInt(intent.permittedAssets.length)
      ).toString();
      const startedAt = Date.now();
      const quote = await swapApi("quote", intent.chainId, {
        src: intent.fundingToken,
        dst: asset,
        amount: amountIn,
      });
      if (!/^[1-9]\d*$/.test(String(quote.dstAmount)))
        throw new Error("Invalid quote.");
      quotes.push({
        source: "1inch-route-quote",
        fromToken: verifiedToken(
          intent.chainId,
          intent.fundingToken,
          snapshot.tokenMetadata,
        ),
        toToken: verifiedToken(intent.chainId, asset, snapshot.tokenMetadata),
        amountIn,
        amountOut: String(quote.dstAmount),
        observedAt: startedAt,
        expiresAt: startedAt + 30_000,
      });
    } catch {
      snapshot.coverage.push({
        source: `route:${asset}`,
        observedAt: Date.now(),
        status: "unavailable",
        detail: "A live route quote could not be obtained.",
      });
    }
  }
  snapshot.routeQuotes = quotes;
  return snapshot;
}
