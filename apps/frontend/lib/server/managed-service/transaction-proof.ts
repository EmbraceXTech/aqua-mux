import type { Hex, Transaction } from "viem";
import { recoverAuthorizationAddress } from "viem/utils";
import type { LifecyclePlan } from "../../managed";
import { encodeDevBatch, implementation } from "../dev-wallet/batch";
import {
  accountPrestateProvesExecution,
  exactBatchTrace,
  prestateProvesPlanDependencies,
} from "../external-adapter/proof";

export const traceProvesPlan = exactBatchTrace;

/** Envelope comparison alone does not prove the account's executed code. */
export function directBatchProvesPlan(
  tx: { from: string; to: string | null; input: string; value: bigint },
  plan: LifecyclePlan,
) {
  return (
    tx.from.toLowerCase() === plan.maker &&
    tx.to?.toLowerCase() === plan.maker &&
    tx.value === 0n &&
    tx.input.toLowerCase() === encodeDevBatch(plan.calls).toLowerCase()
  );
}

export async function verifyManagedTransactionProof(
  rpc: {
    getChainId(): Promise<number>;
    request: (...args: never[]) => Promise<unknown>;
  },
  tx: Transaction,
  plan: LifecyclePlan,
): Promise<boolean> {
  try {
    if (
      !directBatchProvesPlan(tx, plan) ||
      tx.chainId !== plan.chainId ||
      (await rpc.getChainId()) !== plan.chainId
    )
      return false;
    let initializedByTransaction = false;
    if (tx.type === "eip7702") {
      const authorization = tx.authorizationList;
      if (
        authorization.length !== 1 ||
        authorization[0].address.toLowerCase() !==
          implementation.toLowerCase() ||
        authorization[0].chainId !== plan.chainId ||
        authorization[0].nonce !== tx.nonce + 1 ||
        (
          await recoverAuthorizationAddress({ authorization: authorization[0] })
        ).toLowerCase() !== plan.maker
      )
        return false;
      initializedByTransaction = true;
    } else if (tx.type !== "eip1559") return false;
    const trace = await rpc.request({
      method: "debug_traceTransaction",
      params: [tx.hash, { tracer: "callTracer" }],
    } as never);
    if (!exactBatchTrace(trace, plan)) return false;
    const prestate = await rpc.request({
      method: "debug_traceTransaction",
      params: [
        tx.hash as Hex,
        { tracer: "prestateTracer", tracerConfig: { diffMode: false } },
      ],
    } as never);
    return (
      prestateProvesPlanDependencies(prestate, plan) &&
      accountPrestateProvesExecution(
        prestate,
        plan.maker,
        initializedByTransaction,
      )
    );
  } catch {
    return false;
  }
}
