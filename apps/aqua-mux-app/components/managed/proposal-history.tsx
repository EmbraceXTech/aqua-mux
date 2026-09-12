import { useEffect, useState } from "react";
import type { SavedProposal } from "@/lib/server/managed-service/proposal-history";
import { managedRequest, type ManagedSession } from "@/lib/managed-client/api";
import { Button } from "../ui/button";
import { dateLabel, titleLabel } from "./format";

export function ProposalHistory({
  session,
  onOpen,
}: {
  session: ManagedSession;
  onOpen: (groupId: string) => void;
}) {
  const [proposals, setProposals] = useState<SavedProposal[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const result = await managedRequest<{ proposals: SavedProposal[] }>(
          "/proposals",
          session,
          undefined,
          undefined,
          controller.signal,
        );
        if (controller.signal.aborted) return;
        setProposals(result.proposals);
        setError("");
        if (result.proposals.some(({ review }) => review.status === "pending"))
          timer = setTimeout(() => void refresh(), 5000);
      } catch {
        if (!controller.signal.aborted)
          setError(
            "Saved proposals could not be loaded. Reopen Strategies to retry.",
          );
      }
    }
    void refresh();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [session]);
  if (!proposals.length && !error) return null;
  return (
    <section
      className="managed-panel managed-stack"
      style={{ marginBottom: 28 }}
    >
      <details>
        <summary>Saved proposal reviews ({proposals.length})</summary>
        {error && <p role="alert">{error}</p>}
        {proposals.map(({ review, groupId }) => (
          <div key={review.id}>
            <strong>{titleLabel(review.status)}</strong> /{" "}
            {dateLabel(review.createdAt)}
            {review.status === "pending" && (
              <p role="status">
                Review is running. This list refreshes while you wait.
              </p>
            )}
            {review.errors.length > 0 && <p>{review.errors.join(" ")}</p>}
            {review.rationale && <p>{review.rationale}</p>}
            {groupId && (
              <Button variant="outline" onClick={() => onOpen(groupId)}>
                Open reviewed group
              </Button>
            )}
          </div>
        ))}
      </details>
    </section>
  );
}
