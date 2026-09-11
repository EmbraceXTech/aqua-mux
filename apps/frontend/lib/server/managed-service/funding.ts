import { NATIVE, wrapped } from "../../config";
import type { StrategyConfig, TokenAmount } from "../../managed";
import type { LifecycleRequest } from "../lifecycle";
import { swapApi } from "../swap";
import type { ProposalIntent } from "./inputs";
import { ManagedError } from "./errors";
import { verifiedToken, type WalletSnapshot } from "./snapshot";
import type { ManagedTokenSnapshot } from "./tokens";
import { isPositiveUint256Decimal } from "../../token-registry";

/** Shared pair claims use one real token inventory, not the sum of sibling allocations. */
export function pairInventory(config: StrategyConfig): TokenAmount[] {
  const amounts = new Map<string, TokenAmount>();
  for (const pair of config.pairs) {
    if (!("baseAmount" in pair)) continue;
    for (const [token, amount] of [
      [pair.baseToken, pair.baseAmount],
      [pair.quoteToken, pair.quoteAmount],
    ] as const) {
      const old = amounts.get(token.address);
      if (!old || BigInt(old.amount) < BigInt(amount))
        amounts.set(token.address, { token, amount });
    }
  }
  return [...amounts.values()];
}
export function availableInventory(
  selected: TokenAmount[],
  snapshot: WalletSnapshot,
): TokenAmount[] {
  return selected.map((item) => {
    const available =
      item.token.address === NATIVE
        ? snapshot.nativeBalanceWei
        : (snapshot.balances.find((b) => b.token.address === item.token.address)
            ?.amount ?? "0");
    return {
      ...item,
      amount: (BigInt(item.amount) < BigInt(available)
        ? BigInt(item.amount)
        : BigInt(available)
      ).toString(),
    };
  });
}
export async function planFunding(
  config: StrategyConfig,
  inventory: TokenAmount[],
  intent: ProposalIntent,
  tokens: ManagedTokenSnapshot,
): Promise<LifecycleRequest["funding"]> {
  const source = verifiedToken(config.chainId, intent.fundingToken, tokens),
    purchases = [];
  const required = pairInventory(config);
  for (const item of required) {
    const held = BigInt(
        inventory.find((i) => i.token.address === item.token.address)?.amount ??
          "0",
      ),
      shortage = BigInt(item.amount) - held;
    if (
      shortage <= 0n ||
      item.token.address === source.address ||
      (source.address === NATIVE &&
        item.token.address === wrapped(config.chainId).address)
    )
      continue;
    const probe = BigInt(intent.budget) / BigInt(required.length);
    if (probe === 0n || config.policy.maxSlippageBps.value >= 10000)
      throw new ManagedError(
        "invalid_budget",
        "Funding quote size and minimum receipt must be positive.",
        400,
      );
    const quote = await swapApi("quote", config.chainId, {
      src: source.address,
      dst: item.token.address,
      amount: probe.toString(),
    });
    const output = quote.dstAmount;
    if (!isPositiveUint256Decimal(output))
      throw new ManagedError(
        "route_unavailable",
        "A required funding quote is unavailable.",
        503,
      );
    const denominator =
      BigInt(output) * BigInt(10000 - config.policy.maxSlippageBps.value);
    const amountIn =
      (shortage * probe * 10000n + denominator - 1n) / denominator;
    purchases.push({
      token: item.token,
      amountIn: amountIn.toString(),
      minimumAmountOut: shortage.toString(),
    });
  }
  if (
    purchases.reduce((sum, item) => sum + BigInt(item.amountIn), 0n) >
    BigInt(intent.budget)
  )
    throw new ManagedError(
      "insufficient_budget",
      "The proposed inventory needs more funding than the selected budget.",
    );
  return { token: source, amount: intent.budget, purchases };
}
