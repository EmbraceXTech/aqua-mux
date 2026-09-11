import type { Address, Hex } from "viem";
import type { ExecutionLock } from "../store";
export type ExternalTransaction = {
  type: "0x2";
  from: Address;
  to: Address;
  chainId: Hex;
  data: Hex;
  value: "0x0";
  nonce: Hex;
  gas: Hex;
  maxFeePerGas: Hex;
  maxPriorityFeePerGas: Hex;
};
export type ExternalAttempt = {
  adapter: "simple7702-self-signed-v1";
  planDigest: Hex;
  transaction: ExternalTransaction;
  lockToken: ExecutionLock;
  feeLimit: string;
};
