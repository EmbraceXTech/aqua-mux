import { network } from "@/lib/config";
import type { GroupDetail } from "@/lib/managed-client/api";
import { dateLabel, titleLabel } from "./format";

export function ActivityView({ detail }: { detail: GroupDetail }) {
  const entries = [
    ...(detail.reviews ?? []).map((review) => ({
      id: review.id,
      at: review.createdAt,
      title: `Agent review: ${titleLabel(review.status)}`,
      text: review.result?.rationale ?? review.errors.join(" "),
      hash: null,
      detail: `${review.provider} / ${review.model}. Service cost: ${review.usage.cost ?? "unavailable"}.`,
    })),
    ...(detail.transactions ?? []).map((attempt) => ({
      id: attempt.id,
      at: attempt.createdAt,
      title: `Management transaction: ${titleLabel(attempt.status)}`,
      text: `Plan ${attempt.planId}`,
      hash: attempt.transactionHash,
      detail: attempt.walletBatchId
        ? `Wallet batch ${attempt.walletBatchId}`
        : "Transaction submission and chain confirmation are separate states.",
    })),
  ].sort((a, b) => b.at - a.at);
  return (
    <div className="managed-stack">
      <section className="managed-panel">
        <h2>Decisions and transactions</h2>
        {entries.length ? (
          <div className="managed-timeline">
            {entries.map((entry) => (
              <article key={entry.id} className="managed-event">
                <time>{dateLabel(entry.at)}</time>
                <h3>{entry.title}</h3>
                <p>{entry.text}</p>
                <p>{entry.detail}</p>
                {entry.hash && (
                  <a
                    className="managed-link"
                    href={`${network(detail.group.chainId).explorer}/tx/${entry.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    View transaction receipt
                  </a>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="managed-empty">
            No review or transaction history is available yet.
          </p>
        )}
      </section>
      <section className="managed-panel">
        <h2>Observed inventory movements</h2>
        {detail.movements?.length ? (
          detail.movements.map((movement) => (
            <article className="managed-event" key={movement.id}>
              <h3>
                {titleLabel(movement.kind)} / block {movement.blockNumber}
              </h3>
              <p>
                {movement.canonical
                  ? "Canonical observation"
                  : "Noncanonical observation"}
                . Fee accounting {movement.feeAccounting}.
              </p>
              <a
                className="managed-link"
                href={`${network(detail.group.chainId).explorer}/tx/${movement.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                View on-chain movement
              </a>
            </article>
          ))
        ) : (
          <p className="managed-empty">
            No attributable movements have been returned. This does not prove
            that no resolver fills occurred.
          </p>
        )}
      </section>
      <div className="managed-notice">
        Agent reviews use an uncharged development entitlement. Hedera payments
        are not enabled, and a review result never authorizes a wallet
        transaction.
      </div>
    </div>
  );
}
