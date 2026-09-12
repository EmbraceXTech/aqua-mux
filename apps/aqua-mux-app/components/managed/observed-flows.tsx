import { formatUnits } from "viem";
import type { GroupDetail } from "@/lib/managed-client/api";

export function ObservedFlows({ detail }: { detail: GroupDetail }) {
  const history = detail.observation?.history;
  const movements = history?.netTokenMovements;
  const tokens = detail.group.config.pairs.flatMap((pair) => [
    pair.baseToken,
    pair.quoteToken,
  ]);
  return (
    <section className="managed-panel managed-stack">
      <h2>Net indexed token movements</h2>
      {movements?.length ? (
        <dl className="managed-facts">
          {movements.map((movement) => {
            const token = tokens.find(
              (candidate) => candidate.address === movement.token,
            );
            return (
              <div key={movement.token}>
                <dt>{token?.symbol ?? movement.token}</dt>
                <dd>
                  {token
                    ? formatUnits(BigInt(movement.amount), token.decimals)
                    : `${movement.amount} raw units`}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : (
        <p>
          {movements
            ? "No token movements were indexed in this covered interval."
            : "Indexed token movements are unavailable."}
        </p>
      )}
      <p className="managed-footnote">
        From block {history?.coverage?.startBlock ?? "unavailable"} through{" "}
        {history?.coverage?.indexedThrough?.number ?? "unavailable"}. Coverage:{" "}
        {history?.coverage?.health ?? "unknown"}. Each Aqua movement is counted
        once; SwapVM fill amounts are not added again. Unrelated wallet
        transfers and asset prices are outside this calculation, so these
        movements do not establish profit. Fee decomposition remains unknown.
      </p>
    </section>
  );
}
