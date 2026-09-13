export type SwapTransactionStatus =
  | "pending"
  | "confirmed"
  | "reverted"
  | "unlocated";

// A wallet-supplied hash is not proof of broadcast. Missing data is never success,
// nor proof that it is safe to retry. Keep polling and keep resubmission blocked.
export function swapTransactionStatus(
  receipt: { status?: unknown } | null,
  transaction: unknown | null,
  elapsedMs: number,
): SwapTransactionStatus {
  if (receipt) {
    if (receipt.status === "0x1") return "confirmed";
    if (receipt.status === "0x0") return "reverted";
    throw new Error("Transaction receipt has no recognized execution status.");
  }
  return transaction === null && elapsedMs >= 60000 ? "unlocated" : "pending";
}
