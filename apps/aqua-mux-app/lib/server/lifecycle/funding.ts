import { AQUA, NATIVE, token, wrapped } from "../../config";
import type { LPStrategyConfig } from "../../managed/config";
import type { Token } from "../../managed/primitives";
import { uint } from "../../managed-compiler/arithmetic";
import type { Call } from "../../model";
import { approvalBuilder, wrapCall } from "./calls";
import type { Inventory } from "./inventory";
import type { LifecycleRequest } from "./types";

export type SwapInventory = (
  source: Token,
  destination: Token,
  amount: string,
  minimum: string,
) => Promise<void>;

export async function fundInventory(
  request: LifecycleRequest & { config: LPStrategyConfig },
  inventory: Inventory,
  calls: Call[],
  approve: ReturnType<typeof approvalBuilder>,
  swap: SwapInventory,
) {
  const required = new Map<string, { token: Token; amount: bigint }>();
  for (const pair of request.config.pairs)
    for (const [t, raw] of [
      [pair.baseToken, pair.baseAmount],
      [pair.quoteToken, pair.quoteAmount],
    ] as const) {
      const amount = uint(raw),
        current = required.get(t.address)?.amount ?? 0n;
      if (amount > current) required.set(t.address, { token: t, amount });
    }
  const wrap = wrapped(request.config.chainId),
    native = token(request.config.chainId, NATIVE);
  const funding = request.funding;
  if (funding) {
    const budget = uint(funding.amount);
    if (budget > inventory.amount(funding.token))
      throw new Error("Funding budget exceeds selected inventory.");
    const spend = funding.purchases.reduce(
      (sum, p) => sum + uint(p.amountIn),
      0n,
    );
    const wrapShortage =
      (required.get(wrap.address)?.amount ?? 0n) - inventory.amount(wrap);
    const retained =
      funding.token.address === NATIVE
        ? wrapShortage > 0n
          ? wrapShortage
          : 0n
        : (required.get(funding.token.address)?.amount ?? 0n);
    if (spend + retained > budget)
      throw new Error(
        "Purchases and retained backing exceed the funding budget.",
      );
    if (
      new Set(funding.purchases.map((p) => p.token.address)).size !==
      funding.purchases.length
    )
      throw new Error("Duplicate inventory purchase.");
    for (const purchase of funding.purchases) {
      const shortage =
        (required.get(purchase.token.address)?.amount ?? 0n) -
        inventory.amount(purchase.token);
      if (shortage <= 0n || uint(purchase.minimumAmountOut) < shortage)
        throw new Error(
          "Purchase must fund a real conservative inventory shortage.",
        );
      await swap(
        funding.token,
        purchase.token,
        purchase.amountIn,
        purchase.minimumAmountOut,
      );
    }
  }
  const wrapNeed =
    (required.get(wrap.address)?.amount ?? 0n) - inventory.amount(wrap);
  if (wrapNeed > 0n) {
    inventory.debit(native, wrapNeed);
    inventory.credit(wrap, wrapNeed);
    calls.push(wrapCall(wrap.address, wrapNeed));
  }
  for (const { token: t, amount } of required.values()) {
    if (inventory.amount(t) < amount)
      throw new Error(
        `Conservative receipts do not back ${t.symbol} reserves.`,
      );
    approve(t.address, AQUA, amount);
  }
}
