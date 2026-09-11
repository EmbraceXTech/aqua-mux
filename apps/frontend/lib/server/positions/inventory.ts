import type { Address } from "viem";
import { matchesPosition, movementDelta } from "./history";
import type { ChainObservation, PositionRef } from "./types";
import type { Reconciliation } from "./reconcile";

export type InventoryBaseline = {
  blockNumber: string;
  tokens: { token: Address; walletBalance: string; allocated: string }[];
  /** Must come from an independent complete transfer audit, never inferred from Aqua logs. */
  externalActivityCoverage: "complete" | "unknown";
};

/** Attributable amounts are not derived by summing virtual allocations. */
export function attributeGroupInventory(
  observation: ChainObservation | null,
  reconciliation: Reconciliation,
  allPositions: PositionRef[],
  ownerId: string,
  groupId: string,
  baseline: InventoryBaseline,
) {
  const selected = allPositions.filter(
    (p) =>
      p.ownerId.toLowerCase() === ownerId.toLowerCase() &&
      p.groupId === groupId,
  );
  if (!selected.length) return [];
  const maker = selected[0].maker.toLowerCase();
  const chainId = selected[0].chainId;
  if (
    selected.some(
      (p) => p.maker.toLowerCase() !== maker || p.chainId !== chainId,
    )
  )
    throw new Error("A group must have one maker and chain.");
  const tokens = new Map<string, InventoryBaseline["tokens"][number]>();
  for (const item of baseline.tokens) {
    const key = item.token.toLowerCase();
    if (tokens.has(key)) throw new Error("Duplicate baseline token.");
    if (
      !/^\d+$/.test(item.allocated) ||
      !/^\d+$/.test(item.walletBalance) ||
      BigInt(item.allocated) > BigInt(item.walletBalance)
    )
      throw new Error("Invalid attributable inventory baseline.");
    tokens.set(key, item);
  }
  return [...tokens.values()].map((item) => {
    const token = item.token.toLowerCase();
    const reasons: string[] = [];
    const through = observation?.indexedThrough?.number;
    if (
      !observation ||
      observation.health !== "current" ||
      !through ||
      BigInt(observation.config.startBlock) >
        BigInt(baseline.blockNumber) + 1n ||
      !reconciliation.block ||
      through !== reconciliation.block.number
    )
      reasons.push("incomplete_observation");
    if (baseline.externalActivityCoverage !== "complete")
      reasons.push("external_activity_unknown");
    if (
      allPositions.some(
        (p) =>
          p.chainId === chainId &&
          p.maker.toLowerCase() === maker &&
          p.groupId !== groupId &&
          p.tokens.some((t) => t.toLowerCase() === token),
      )
    )
      reasons.push("shared_with_other_group");
    let expectedWallet = BigInt(item.walletBalance);
    let attributable = BigInt(item.allocated);
    for (const event of observation?.events ?? []) {
      if (
        event.chainId !== chainId ||
        event.maker.toLowerCase() !== maker ||
        BigInt(event.blockNumber) <= BigInt(baseline.blockNumber)
      )
        continue;
      const delta = movementDelta(event);
      if (!delta || delta.token.toLowerCase() !== token) continue;
      expectedWallet += BigInt(delta.amount);
      if (selected.some((p) => matchesPosition(event, p)))
        attributable += BigInt(delta.amount);
      else reasons.push("external_strategy_use");
    }
    const balances = reconciliation.positions
      .filter(
        (p) =>
          p.position.chainId === chainId &&
          p.position.maker.toLowerCase() === maker,
      )
      .flatMap((p) => p.backing)
      .filter((b) => b.token.toLowerCase() === token)
      .map((b) => b.walletBalance);
    const balance = balances[0] ?? null;
    if (balance === null || balances.some((value) => value !== balance))
      reasons.push("wallet_balance_unknown");
    else if (BigInt(balance) !== expectedWallet)
      reasons.push("unexplained_wallet_change");
    if (
      attributable < 0n ||
      (balance !== null && attributable > BigInt(balance))
    )
      reasons.push("attributable_amount_unbacked");
    return {
      token: item.token,
      walletBalance: balance,
      attributableAmount: reasons.length ? null : attributable.toString(),
      attribution: reasons.length ? ("ambiguous" as const) : ("known" as const),
      reasons: [...new Set(reasons)],
    };
  });
}
