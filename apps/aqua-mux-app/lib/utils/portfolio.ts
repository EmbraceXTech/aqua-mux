import type { GroupDetail } from "@/lib/managed-client/api";
import type { RecordedPosition } from "@/types/portfolio";

export function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function amountLabel(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const displayedFraction = fraction.slice(0, 6).replace(/0+$/, "");
  return displayedFraction ? `${grouped}.${displayedFraction}` : grouped;
}

export function positionStateLabel(state: RecordedPosition["state"]) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

export function positionsFromDetail(detail: GroupDetail): RecordedPosition[] {
  const config = detail.group.config;
  if (config.family !== "lp") return [];

  return (detail.strategies ?? []).map((strategy) => {
    const pair = config.pairs.find(
      (candidate) =>
        strategy.tokens.some(
          (token) => token.address === candidate.baseToken.address,
        ) &&
        strategy.tokens.some(
          (token) => token.address === candidate.quoteToken.address,
        ),
    );

    return {
      id: strategy.id,
      groupId: detail.group.id,
      chainId: detail.group.chainId,
      state: strategy.state,
      groupState: detail.group.state,
      registrationBlock: strategy.registrationBlock,
      tokens: strategy.tokens,
      range:
        pair?.range.kind === "full"
          ? "Full range"
          : pair
            ? "Custom range"
            : "Range unavailable",
      feeBps: pair?.feeBps ?? null,
    };
  });
}
