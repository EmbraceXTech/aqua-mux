import type { Hex } from "viem";
import type { PositionRpc } from "./types";

export type RecoveredTransaction = {
  hash: Hex;
  status: "submitted" | "confirmed" | "failed" | "unknown";
  blockNumber: string | null;
  blockHash: Hex | null;
  gasCost: string | null;
};
export async function recoverSubmittedTransactions(
  rpc: PositionRpc,
  hashes: Hex[],
  confirmations: number,
): Promise<RecoveredTransaction[]> {
  if (!Number.isSafeInteger(confirmations) || confirmations < 1)
    throw new Error("Invalid finality policy.");
  return Promise.all(
    [...new Set(hashes)].map(async (hash): Promise<RecoveredTransaction> => {
      const unknown: RecoveredTransaction = {
        hash,
        status: "unknown",
        blockNumber: null,
        blockHash: null,
        gasCost: null,
      };
      try {
        const receipt = await rpc.receipt(hash);
        if (!receipt) return { ...unknown, status: "submitted" };
        if ((await rpc.block(receipt.blockNumber)).hash !== receipt.blockHash)
          return unknown;
        const finalized =
          (await rpc.head()) - receipt.blockNumber >= BigInt(confirmations);
        return {
          hash,
          status: finalized
            ? receipt.status === "success"
              ? "confirmed"
              : "failed"
            : "submitted",
          blockNumber: receipt.blockNumber.toString(),
          blockHash: receipt.blockHash,
          gasCost: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
        };
      } catch {
        return unknown;
      }
    }),
  );
}
