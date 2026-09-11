import type { DevWalletOutcome, DevWalletReview } from "../../dev-wallet";
import { planDigest, type TransactionAttempt } from "../../managed";
import { openManagedStore } from "../store";
import { reconcileManagedTransactions } from "../managed-service/reconciliation";
import {
  prepareManagedExecution,
  assertManagedExecutionCurrent,
  recordManagedSubmission,
  failManagedExecution,
} from "../managed-service/execution";
import { managedSigningBatch } from "./managed-plan";
import { DevWalletError } from "./config";
import { validateDevPlan } from "./policy";
import { maxFeeBudget, signDevBatch } from "./signer";
import type { DevSession } from "./session";

const namespace = "dev-wallet-managed-review";
type BrowserContext = { sessionId: string; generation: number };
type ManagedReview = {
  id: string;
  planId: string;
  digest: string;
  sessionId: string;
  context?: BrowserContext;
  attemptId?: string;
  maxFeeWei: string;
};

export function prepareDevManagedPlan(
  session: DevSession,
  planId: string,
  context?: BrowserContext,
): DevWalletReview {
  const store = openManagedStore();
  const plan = store.get("plan", planId, session.owner);
  if (
    !plan ||
    plan.authorization.kind !== "owner-confirmed" ||
    plan.authorization.digest !== planDigest(plan)
  )
    throw new DevWalletError(
      "Confirm the current managed plan before preparing local wallet execution.",
    );
  const batch = managedSigningBatch(plan, store);
  validateDevPlan(batch, session.owner);
  const group = store.get("group", plan.groupId, session.owner);
  if (!group) throw new DevWalletError("Managed group is unavailable.");
  const policyFee = BigInt(group.config.policy.gasBudgetWei.value);
  const maxFeeWei = String(
    policyFee < maxFeeBudget() ? policyFee : maxFeeBudget(),
  );
  const id = `managed-${plan.id}`;
  const previous = store.getDocument<ManagedReview>(
    namespace,
    id,
    session.owner,
  );
  if (!previous)
    store.putDocument(
      namespace,
      id,
      session.owner,
      {
        id,
        planId,
        digest: planDigest(plan),
        sessionId: session.sessionId,
        maxFeeWei,
        ...(context ? { context } : {}),
      } satisfies ManagedReview,
      0,
    );
  else if (previous.data.sessionId !== session.sessionId)
    throw new DevWalletError(
      "This plan belongs to an earlier local wallet session. Review a fresh plan.",
    );
  return {
    id,
    digest: planDigest(plan),
    plan: batch,
    maxFeeWei: previous?.data.maxFeeWei ?? maxFeeWei,
  };
}

export function isDevManagedReview(session: DevSession, id: string) {
  return !!openManagedStore().getDocument(namespace, id, session.owner);
}

function outcome(id: string, attempt: TransactionAttempt): DevWalletOutcome {
  return {
    id,
    state:
      attempt.status === "confirmed"
        ? "confirmed"
        : attempt.status === "failed" && attempt.transactionHash
          ? "reverted"
          : attempt.status === "submitted"
            ? "pending"
            : "unknown",
    ...(attempt.transactionHash
      ? { transactionHash: attempt.transactionHash }
      : {}),
  };
}

export async function executeDevManagedPlan(
  session: DevSession,
  id: string,
  digest: string,
  assertSession: () => void,
): Promise<DevWalletOutcome> {
  const store = openManagedStore();
  const review = store.getDocument<ManagedReview>(
    namespace,
    id,
    session.owner,
  )?.data;
  if (
    !review ||
    review.sessionId !== session.sessionId ||
    review.digest !== digest
  )
    throw new DevWalletError(
      "The managed local wallet review changed or is unavailable.",
    );
  if (review.attemptId) {
    const previous = store.get("transaction", review.attemptId, session.owner);
    if (!previous)
      throw new DevWalletError("The execution attempt needs reconciliation.");
    return outcome(id, previous);
  }
  const plan = store.get("plan", review.planId, session.owner);
  if (!plan || planDigest(plan) !== digest)
    throw new DevWalletError("The managed plan changed.");
  const input = {
    owner: session.owner,
    groupId: plan.groupId,
    planId: plan.id,
    idempotencyKey: id,
    sessionId: review.context?.sessionId,
    generation: review.context?.generation,
  };
  const prepared = store.transaction(() => {
    const prepared = prepareManagedExecution(input, store);
    store.putDocument(namespace, id, session.owner, {
      ...review,
      attemptId: prepared.attempt.id,
    });
    return prepared;
  });
  const guard = {
    ...input,
    attemptId: prepared.attempt.id,
    lockToken: prepared.lockToken,
  };
  let journaled = false;
  try {
    const assertCurrent = () => {
      assertSession();
      const current = assertManagedExecutionCurrent(guard, store);
      if (planDigest(current) !== digest)
        throw new DevWalletError("The reviewed managed plan changed.");
    };
    const signed = await signDevBatch(
      managedSigningBatch(prepared.plan, store),
      assertCurrent,
      BigInt(review.maxFeeWei),
    );
    await signed.broadcast(() => {
      recordManagedSubmission(
        {
          owner: session.owner,
          attemptId: prepared.attempt.id,
          transactionHash: signed.hash,
          nonce: String(signed.nonce),
        },
        store,
      );
      journaled = true;
    });
    return outcome(
      id,
      store.get("transaction", prepared.attempt.id, session.owner)!,
    );
  } catch (error) {
    const attempt = failManagedExecution(
      {
        owner: session.owner,
        attemptId: prepared.attempt.id,
        lockToken: prepared.lockToken,
        submitted: journaled,
      },
      store,
    );
    if (journaled) return outcome(id, attempt);
    throw error;
  }
}

export async function devManagedStatus(
  session: DevSession,
  id: string,
): Promise<DevWalletOutcome> {
  const store = openManagedStore();
  const review = store.getDocument<ManagedReview>(
    namespace,
    id,
    session.owner,
  )?.data;
  const attempt = review?.attemptId
    ? store.get("transaction", review.attemptId, session.owner)
    : null;
  if (!attempt)
    throw new DevWalletError("Managed local wallet execution not found.");
  // The common managed reconciliation service owns receipt state and lock release.
  if (attempt.status === "submitted" || attempt.status === "unknown") {
    try {
      await reconcileManagedTransactions(session.owner, attempt.groupId);
    } catch {
      return { ...outcome(id, attempt), state: "unknown" };
    }
  }
  return outcome(id, store.get("transaction", attempt.id, session.owner)!);
}
