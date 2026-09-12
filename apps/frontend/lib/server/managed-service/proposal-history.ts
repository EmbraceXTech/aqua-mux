import type { ReviewRecord } from "../../managed";
import type { ManagedStore } from "../store";

/** Recover persisted proposals without exposing internal intent documents. */
export function proposalHistory(store: ManagedStore, owner: string) {
  return store
    .listDocuments<{
      response: { review: ReviewRecord; group?: { id: string } };
      deadline: number;
    }>("proposal-intents", owner)
    .map(({ data }) => {
      const record = data.response.review;
      const expired =
        record.status === "pending" && data.deadline <= Date.now();
      return {
        review: {
          id: record.id,
          status: expired ? ("cancelled" as const) : record.status,
          createdAt: record.createdAt,
          errors: expired
            ? ["The proposal deadline elapsed. Submit a fresh request."]
            : record.errors,
          rationale:
            record.status === "succeeded"
              ? record.result?.rationale
              : undefined,
        },
        groupId: data.response.group?.id,
      };
    })
    .sort((a, b) => b.review.createdAt - a.review.createdAt)
    .slice(0, 20);
}

export type SavedProposal = ReturnType<typeof proposalHistory>[number];
