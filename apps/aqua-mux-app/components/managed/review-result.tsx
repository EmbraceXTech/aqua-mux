import type { ReviewRecord } from "@/lib/managed";
import { dateLabel, titleLabel } from "./format";

export function ReviewResultCard({ review }: { review: ReviewRecord }) {
  return (
    <section className="managed-panel managed-stack">
      <div className="managed-toolbar">
        <h2>Fresh proposal</h2>
        <span
          className={`managed-badge ${review.status === "failed" ? "managed-badge-amber" : ""}`}
        >
          {titleLabel(review.status)}
        </span>
      </div>
      <p role={review.status === "failed" ? "alert" : undefined}>
        {review.status === "failed"
          ? review.errors.join(" ") ||
            "The review failed. No transaction is authorized."
          : (review.result?.rationale ??
            "The agent review is pending. No transaction is authorized.")}
      </p>
      {review.status === "succeeded" && review.result && (
        <>
          <h3>{titleLabel(review.result.decision)}</h3>
          {review.result.expectedEffects.map((effect, index) => (
            <p key={index}>{effect}</p>
          ))}
          {review.result.uncertainties.length > 0 && (
            <div className="managed-notice">
              {review.result.uncertainties.join(" ")}
            </div>
          )}
        </>
      )}
      <h3>Data behind this review</h3>
      {(review.result?.evidence ?? review.coverage).map((source, index) => (
        <div className="managed-summary" key={index}>
          <strong>
            {source.source}: {source.status}
          </strong>
          <p>{source.detail}</p>
          <small>{dateLabel(source.observedAt)}</small>
        </div>
      ))}
      <p className="managed-footnote">
        {review.provider} / {review.model} / {dateLabel(review.createdAt)}. An
        explanation is not a transaction authorization.
      </p>
    </section>
  );
}
