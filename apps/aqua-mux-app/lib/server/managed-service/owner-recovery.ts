import { openManagedStore } from "../store";
import { reconcileManagedTransactions } from "./reconciliation";

/** Recovery never signs, submits, changes a policy, or clears an unknown lock. */
export async function recoverOwnerExecutions(
  owner: string,
  reconcile: boolean,
) {
  const store = openManagedStore();
  const unresolved = () =>
    store
      .list("transaction", owner)
      .filter((attempt) =>
        ["prepared", "submitted", "unknown"].includes(attempt.status),
      );
  const groups = [
    ...new Set(
      unresolved()
        .filter(
          (attempt) => attempt.transactionHash && attempt.status !== "prepared",
        )
        .map((attempt) => attempt.groupId),
    ),
  ];
  const unavailable: string[] = [];
  if (reconcile) {
    // A failure on one chain must not prevent another group's recovery.
    const results = await Promise.allSettled(groups.map((groupId) =>
      reconcileManagedTransactions(owner, groupId),
    ));
    results.forEach((result, index) => {
      if (result.status === "rejected") unavailable.push(groups[index]);
    });
  }
  return {
    attempts: unresolved().map((attempt) => ({
      id: attempt.id,
      groupId: attempt.groupId,
      chainId: store.get("group", attempt.groupId, owner)!.chainId,
      planId: attempt.planId,
      status: attempt.status,
      transactionHash: attempt.transactionHash,
      createdAt: attempt.createdAt,
    })),
    unavailable,
    checkedAt: Date.now(),
  };
}
