import { keccak256, type Hex, type PublicClient } from "viem";
import { planDigest } from "../../managed";
import { client } from "../rpc";
import { openManagedStore } from "../store";
import { ManagedError } from "../managed-service/errors";
import {
  currentPlan,
  prepareManagedExecution,
  assertManagedExecutionCurrent,
  recordManagedSubmission,
  failManagedExecution,
  type ExecutionInput,
} from "../managed-service/execution";
import { externalAdapterId } from "./account";
import { checkedExternalPreflight } from "./preflight";
import { verifyExternalSignature } from "./signature";
import type { ExternalAttempt } from "./types";

export async function prepareExternalExecution(
  input: ExecutionInput,
  store = openManagedStore(),
) {
  const plan = currentPlan(store, input);
  const reviewed = await checkedExternalPreflight(plan, store);
  return store.transaction(() => {
    if (planDigest(currentPlan(store, input)) !== planDigest(plan))
      throw new ManagedError(
        "stale_plan",
        "The reviewed plan changed during wallet checks.",
      );
    const prepared = prepareManagedExecution(input, store);
    const record: ExternalAttempt = {
      adapter: externalAdapterId,
      planDigest: planDigest(plan),
      ...reviewed,
      lockToken: prepared.lockToken,
    };
    store.putDocument(
      "external-attempt",
      prepared.attempt.id,
      input.owner,
      record,
    );
    return {
      plan: prepared.plan,
      attempt: prepared.attempt,
      adapter: externalAdapterId,
      transaction: reviewed.transaction,
    };
  });
}

export async function relayExternalExecution(
  input: Omit<ExecutionInput, "idempotencyKey"> & {
    attemptId: string;
    serializedTransaction: Hex;
  },
  store = openManagedStore(),
  rpcOverride?: PublicClient,
) {
  const attempt = store.get("transaction", input.attemptId, input.owner);
  const record = store.getDocument<ExternalAttempt>(
    "external-attempt",
    input.attemptId,
    input.owner,
  )?.data;
  if (
    !attempt ||
    !record ||
    attempt.groupId !== input.groupId ||
    attempt.planId !== input.planId ||
    record.adapter !== externalAdapterId
  )
    throw new ManagedError(
      "external_attempt_missing",
      "The owner-scoped external signing attempt is unavailable.",
    );
  const hash = keccak256(input.serializedTransaction);
  if (attempt.status !== "prepared") {
    if (attempt.transactionHash === hash) return attempt;
    throw new ManagedError(
      "recovery_required",
      "This attempt already has a submitted or unknown transaction.",
    );
  }
  await verifyExternalSignature(
    input.serializedTransaction,
    record.transaction,
  );
  const guard = { ...input, lockToken: record.lockToken };
  const plan = assertManagedExecutionCurrent(guard, store);
  if (planDigest(plan) !== record.planDigest)
    throw new ManagedError("stale_plan", "The signed plan digest changed.");
  await checkedExternalPreflight(plan, store, record.transaction, rpcOverride);
  const rpc = rpcOverride ?? client(plan.chainId);
  assertManagedExecutionCurrent(guard, store);
  // Record before transport. A connection error must never make this safe to retry.
  recordManagedSubmission(
    {
      owner: input.owner,
      attemptId: attempt.id,
      transactionHash: hash,
      nonce: String(BigInt(record.transaction.nonce)),
    },
    store,
  );
  try {
    const sent = await rpc.sendRawTransaction({
      serializedTransaction: input.serializedTransaction,
    });
    if (sent !== hash) throw new Error();
  } catch {
    return failManagedExecution(
      {
        owner: input.owner,
        attemptId: attempt.id,
        lockToken: record.lockToken,
        submitted: true,
      },
      store,
    );
  }
  return store.get("transaction", attempt.id, input.owner)!;
}
