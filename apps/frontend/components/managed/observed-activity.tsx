import { formatUnits } from "viem";
import { network } from "@/lib/config";
import type { GroupDetail } from "@/lib/managed-client/api";
import { titleLabel } from "./format";

export function ObservedActivity({ detail }: { detail: GroupDetail }) {
  const history = detail.observation?.history;
  const tokens = detail.group.config.pairs.flatMap((pair) => [
    pair.baseToken,
    pair.quoteToken,
  ]);
  const amount = (address: string | undefined, raw: string | undefined) => {
    if (!address || raw === undefined) return "Unavailable";
    const token = tokens.find((item) => item.address === address);
    return token
      ? `${formatUnits(BigInt(raw), token.decimals)} ${token.symbol}`
      : `${raw} raw units of ${address}`;
  };
  return (
    <section className="managed-panel">
      <h2>Indexed on-chain activity</h2>
      {history?.activity.length ? (
        history.activity
          .toReversed()
          .map(({ event, source, delta, feeAccounting }) => (
            <article className="managed-event" key={event.id}>
              <h3>
                {titleLabel(source)} / {event.kind}
              </h3>
              <p>
                Block {event.blockNumber}. Strategy{" "}
                <span className="managed-address">{event.strategyHash}</span>.
              </p>
              {delta && (
                <p>Inventory change: {amount(delta.token, delta.amount)}</p>
              )}
              {event.kind === "Swapped" && (
                <p>
                  Executed order: {amount(event.tokenIn, event.amountIn)} in /{" "}
                  {amount(event.tokenOut, event.amountOut)} out.
                </p>
              )}
              <p>Fee accounting: {feeAccounting}.</p>
              <a
                className="managed-link"
                target="_blank"
                rel="noreferrer"
                href={`${network(detail.group.chainId).explorer}/tx/${event.transactionHash}`}
              >
                View transaction receipt
              </a>
            </article>
          ))
      ) : (
        <p className="managed-empty">
          {history?.coverage
            ? "No attributable events in the indexed coverage."
            : "Indexed activity is unavailable. Reconcile to check monitoring coverage."}
        </p>
      )}
      <p className="managed-footnote">
        Executed-order amounts and Aqua inventory movements are distinct
        observations of the same activity. They are not added together as
        separate returns.
      </p>
    </section>
  );
}
