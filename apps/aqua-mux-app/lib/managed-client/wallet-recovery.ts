import { batchStatus } from "@/lib/wallet";
import type { TransactionAttempt } from "@/lib/managed";
import { managedRequest, type ManagedSession } from "./api";

const hintKey = (owner: string, groupId: string, attemptId: string) =>
  `aquamux-wallet-recovery:${owner.toLowerCase()}:${groupId}:${attemptId}`;
export function saveWalletRecoveryHint(
  owner: string,
  groupId: string,
  attemptId: string,
  batchId: string,
) {
  try {
    sessionStorage.setItem(hintKey(owner, groupId, attemptId), batchId);
  } catch {
    /* The server submission record remains the primary recovery path. */
  }
}

export async function recoverWalletBatches(
  session: ManagedSession,
  groupId: string,
  attempts: TransactionAttempt[],
) {
  if (session.mode !== "external") return;
  for (const attempt of attempts) {
    let batchId = attempt.walletBatchId;
    if (!batchId && attempt.status === "prepared") {
      try {
        batchId = sessionStorage.getItem(
          hintKey(session.owner, groupId, attempt.id),
        );
      } catch {
        /* An absent hint does not establish that nothing was sent. */
      }
      if (batchId)
        await managedRequest(
          `/groups/${groupId}/attempts/${attempt.id}/submitted`,
          session,
          { walletBatchId: batchId },
        );
    }
    if (
      !batchId ||
      !["prepared", "submitted", "unknown"].includes(attempt.status)
    )
      continue;
    const reported = await batchStatus(batchId);
    await managedRequest(
      `/groups/${groupId}/attempts/${attempt.id}/wallet-status`,
      session,
      {
        walletBatchId: batchId,
        status: reported.status,
        ...(reported.atomic === undefined ? {} : { atomic: reported.atomic }),
        transactionHashes:
          reported.receipts?.map((receipt) => receipt.transactionHash) ?? [],
      },
    );
  }
}

export function isExplicitWalletRejection(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 4001
  );
}
