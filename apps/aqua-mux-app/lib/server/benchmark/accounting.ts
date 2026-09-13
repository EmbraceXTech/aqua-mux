export type PositionEvent = {
  kind: "transfer" | "increase" | "decrease" | "collect";
  block: number;
  transactionIndex: number;
  logIndex: number;
  transaction: string;
  amount0?: bigint;
  amount1?: bigint;
  liquidity?: bigint;
  from?: string;
  to?: string;
};
const zero = "0x0000000000000000000000000000000000000000";

/** Non-transferred NFT histories only. Principal is not fee income.
 * A conservative principal-first ledger must settle before publishing a row.
 * Never attribute a transferred NFT's lifetime fees to its current owner.
 */
export function settlePosition(events: PositionEvent[], requireClosed = true) {
  let wallet: string | undefined;
  let minted = false;
  let burned = false;
  let liquidity = 0n;
  let debt0 = 0n,
    debt1 = 0n,
    fees0 = 0n,
    fees1 = 0n;
  let lastCollection: PositionEvent | undefined;
  for (const event of [...events].sort(
    (a, b) =>
      a.block - b.block ||
      a.transactionIndex - b.transactionIndex ||
      a.logIndex - b.logIndex,
  )) {
    if (event.kind === "transfer") {
      const from = event.from?.toLowerCase(),
        to = event.to?.toLowerCase();
      if (from === zero && !minted && to && to !== zero) {
        wallet = to;
        minted = true;
      } else if (minted && from === wallet && to === zero) {
        burned = true;
      } else if (from !== to)
        throw new Error(
          "Transferred positions require ownership-period accounting",
        );
      continue;
    }
    // IncreaseLiquidity can precede ERC721 mint Transfer within the mint receipt.
    if (burned) throw new Error("Unexpected activity after NFT burn");
    if (event.kind === "increase") liquidity += event.liquidity ?? 0n;
    if (event.kind === "decrease") {
      liquidity -= event.liquidity ?? 0n;
      debt0 += event.amount0 ?? 0n;
      debt1 += event.amount1 ?? 0n;
      if (liquidity < 0n) throw new Error("Incomplete liquidity history");
    }
    if (event.kind === "collect") {
      const amount0 = event.amount0 ?? 0n,
        amount1 = event.amount1 ?? 0n;
      const principal0 = amount0 < debt0 ? amount0 : debt0;
      const principal1 = amount1 < debt1 ? amount1 : debt1;
      debt0 -= principal0;
      debt1 -= principal1;
      fees0 += amount0 - principal0;
      fees1 += amount1 - principal1;
      lastCollection = event;
    }
  }
  if (!minted || !wallet) throw new Error("Mint ownership was not found");
  if (
    (requireClosed && liquidity !== 0n) ||
    debt0 !== 0n ||
    debt1 !== 0n ||
    !lastCollection
  )
    throw new Error("Position is not fully settled");
  if (fees0 === 0n && fees1 === 0n)
    throw new Error("No positive fee collections");
  return { wallet, fees0, fees1, lastCollection, closed: liquidity === 0n };
}
