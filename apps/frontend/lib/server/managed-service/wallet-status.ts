import { z } from "zod";
import { hashSchema } from "../../managed";
import { openManagedStore, type ExecutionLock } from "../store";
import { ManagedError } from "./errors";
import { recordManagedSubmission } from "./execution";
export const walletStatusSchema = z.strictObject({
  walletBatchId: z.string().min(1).max(240),
  status: z.number().int(),
  atomic: z.boolean().optional(),
  transactionHashes: z.array(hashSchema).max(32),
});
export function recordWalletStatus(
  owner: string,
  groupId: string,
  attemptId: string,
  input: z.infer<typeof walletStatusSchema>,
) {
  const store = openManagedStore();
  return store.transaction(() => {
    let attempt = store.get("transaction", attemptId, owner);
    if (!attempt || attempt.groupId !== groupId)
      throw new ManagedError(
        "not_found",
        "Transaction attempt not found.",
        404,
      );
    if (attempt.walletBatchId !== input.walletBatchId)
      throw new ManagedError(
        "batch_mismatch",
        "The reported wallet batch does not match this attempt.",
      );
    if (["confirmed", "failed"].includes(attempt.status)) return attempt;
    const hashes = [...new Set(input.transactionHashes)];
    store.putDocument("wallet-status", attempt.id, owner, {
      ...input,
      observedAt: Date.now(),
    });
    if (hashes.length === 1) {
      if (attempt.transactionHash && attempt.transactionHash !== hashes[0])
        throw new ManagedError(
          "hash_mismatch",
          "The reported transaction hash changed.",
        );
      if (attempt.status === "prepared")
        attempt = recordManagedSubmission({
          owner,
          attemptId,
          transactionHash: hashes[0],
          walletBatchId: input.walletBatchId,
        });
      else
        attempt = store.put(
          "transaction",
          { ...attempt, transactionHash: hashes[0] },
          owner,
        );
    }
    // Multiple receipts need an account-specific atomic proof. A client atomic flag is not that proof.
    return attempt;
  });
}
export function rejectPreparedAttempt(
  owner: string,
  groupId: string,
  attemptId: string,
) {
  const store = openManagedStore();
  return store.transaction(() => {
    const attempt = store.get("transaction", attemptId, owner);
    if (!attempt || attempt.groupId !== groupId)
      throw new ManagedError(
        "not_found",
        "Transaction attempt not found.",
        404,
      );
    if (
      attempt.status !== "prepared" ||
      attempt.transactionHash ||
      attempt.walletBatchId ||
      attempt.providerTransactionId
    )
      throw new ManagedError(
        "recovery_required",
        "A journaled or ambiguous transaction must be reconciled.",
      );
    const plan = store.get("plan", attempt.planId, owner)!;
    const lock = store.getDocument<ExecutionLock>(
      "attempt-lock",
      attempt.id,
      owner,
    )?.data;
    if (!lock)
      throw new ManagedError(
        "recovery_required",
        "The execution lock is unavailable.",
      );
    store.releaseExecutionLock(lock);
    // Retain the signed-off plan for audit but remove authorization before retrying.
    store.put(
      "plan",
      { ...plan, authorization: { kind: "unconfirmed" } },
      owner,
    );
    return store.put(
      "transaction",
      {
        ...attempt,
        status: "failed",
        receipt: {
          reason: "Owner reported an explicit wallet rejection",
          providerCode: 4001,
        },
      },
      owner,
    );
  });
}
