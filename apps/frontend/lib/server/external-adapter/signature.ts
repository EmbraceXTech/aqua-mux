import {
  parseTransaction,
  recoverTransactionAddress,
  type TransactionSerialized,
  type Hex,
} from "viem";
import { ManagedError } from "../managed-service/errors";
import type { ExternalTransaction } from "./types";

export async function verifyExternalSignature(
  serialized: Hex,
  expected: ExternalTransaction,
) {
  try {
    if (!/^0x02[0-9a-fA-F]+$/.test(serialized) || serialized.length > 262144)
      throw new Error();
    const tx = parseTransaction(serialized);
    const from = await recoverTransactionAddress({
      serializedTransaction: serialized as TransactionSerialized,
    });
    if (
      tx.type !== "eip1559" ||
      from.toLowerCase() !== expected.from ||
      tx.to?.toLowerCase() !== expected.to ||
      tx.chainId !== Number(BigInt(expected.chainId)) ||
      tx.data?.toLowerCase() !== expected.data.toLowerCase() ||
      (tx.value ?? 0n) !== 0n ||
      tx.nonce !== Number(BigInt(expected.nonce)) ||
      tx.gas !== BigInt(expected.gas) ||
      tx.maxFeePerGas !== BigInt(expected.maxFeePerGas) ||
      tx.maxPriorityFeePerGas !== BigInt(expected.maxPriorityFeePerGas) ||
      (tx.accessList?.length ?? 0) !== 0
    )
      throw new Error();
  } catch {
    throw new ManagedError(
      "external_signature_mismatch",
      "The signed transaction differs from the exact reviewed account, batch, nonce or fee envelope.",
    );
  }
}
