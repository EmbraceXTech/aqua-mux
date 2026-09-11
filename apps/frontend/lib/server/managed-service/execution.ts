import { randomUUID } from "node:crypto";
import {
  addressSchema,
  canonicalDigest,
  planDigest,
  type LifecyclePlan,
  type TransactionAttempt,
} from "../../managed";
import {
  openManagedStore,
  type ManagedStore,
  type ExecutionLock,
} from "../store";
import { assertLiveRun } from "../automation/lease";
import { ownedGroup, groupBot } from "./groups";
import { ManagedError } from "./errors";

export type ExecutionInput = {
  owner: string;
  groupId: string;
  planId: string;
  idempotencyKey: string;
  sessionId?: string;
  generation?: number;
};
export type ExecutionGuard = Omit<ExecutionInput, "idempotencyKey"> & {
  attemptId: string;
  lockToken: ExecutionLock;
};
export type PlanContext = {
  requiresLease: boolean;
  sessionId: string | null;
  generation: number;
  reviewId: string | null;
};
function currentPlan(
  store: ManagedStore,
  input: Omit<ExecutionInput, "idempotencyKey">,
): LifecyclePlan {
  const group = ownedGroup(store, input.owner, input.groupId),
    bot = groupBot(store, input.owner, input.groupId);
  const plan = store.get("plan", input.planId, input.owner);
  if (!plan || plan.groupId !== group.id)
    throw new ManagedError("not_found", "Managed plan not found.", 404);
  if (plan.expiresAt <= Date.now())
    throw new ManagedError(
      "plan_expired",
      "The execution plan expired. Build a fresh plan.",
    );
  if (
    plan.configDigest !== canonicalDigest(group.config) ||
    plan.policyDigest !== canonicalDigest(group.config.policy)
  )
    throw new ManagedError(
      "stale_plan",
      "The configuration changed after this plan was reviewed.",
    );
  if (
    plan.authorization.kind !== "owner-confirmed" ||
    plan.authorization.digest !== planDigest(plan)
  )
    throw new ManagedError(
      "confirmation_required",
      "Confirm this exact execution plan before signing.",
      403,
    );
  const recovery = plan.kind === "close" || plan.kind === "close-and-convert";
  if (!recovery && plan.runGeneration !== bot.runGeneration)
    throw new ManagedError(
      "stale_generation",
      "This plan belongs to an earlier management run.",
    );
  const context = store.getDocument<PlanContext>(
    "plan-context",
    plan.id,
    input.owner,
  )?.data;
  if (!context)
    throw new ManagedError(
      "plan_context_missing",
      "Build a new plan with its complete execution context.",
    );
  if (!recovery && context.requiresLease)
    assertLiveRun(
      bot,
      input.sessionId ?? "",
      input.generation ?? -1,
      Date.now(),
    );
  return plan;
}
export function confirmManagedPlan(
  input: {
    owner: string;
    groupId: string;
    planId: string;
    digest: string;
    sessionId?: string;
    generation?: number;
  },
  store: ManagedStore = openManagedStore(),
) {
  return store.transaction(() => {
    const group = ownedGroup(store, input.owner, input.groupId),
      bot = groupBot(store, input.owner, input.groupId);
    const plan = store.get("plan", input.planId, input.owner);
    if (!plan || plan.groupId !== group.id)
      throw new ManagedError("not_found", "Managed plan not found.", 404);
    if (
      input.digest !== planDigest(plan) ||
      plan.expiresAt <= Date.now() ||
      plan.configDigest !== canonicalDigest(group.config)
    )
      throw new ManagedError(
        "stale_plan",
        "Review the current, unexpired plan before confirming.",
      );
    if (
      plan.kind !== "close" &&
      plan.kind !== "close-and-convert" &&
      plan.runGeneration !== bot.runGeneration
    )
      throw new ManagedError(
        "stale_generation",
        "The management run changed after this plan was created.",
      );
    const context = store.getDocument<PlanContext>(
      "plan-context",
      plan.id,
      input.owner,
    )?.data;
    if (
      context?.requiresLease &&
      plan.kind !== "close" &&
      plan.kind !== "close-and-convert"
    )
      assertLiveRun(
        bot,
        input.sessionId ?? "",
        input.generation ?? -1,
        Date.now(),
      );
    return store.put(
      "plan",
      {
        ...plan,
        authorization: {
          kind: "owner-confirmed",
          confirmedAt: Date.now(),
          digest: planDigest(plan),
        },
      },
      input.owner,
    );
  });
}
export function prepareManagedExecution(
  input: ExecutionInput,
  store: ManagedStore = openManagedStore(),
) {
  return store.transaction(() => {
    const plan = currentPlan(store, input);
    const existing = store
      .list("transaction", input.owner, input.groupId)
      .find((a) => a.idempotencyKey === input.idempotencyKey);
    if (existing)
      throw new ManagedError(
        "attempt_exists",
        `This execution request already has a ${existing.status} attempt. Reconcile it before retrying.`,
      );
    if (
      store
        .list("transaction", input.owner, input.groupId)
        .some((a) => a.planId === plan.id && a.status !== "failed")
    )
      throw new ManagedError(
        "plan_already_used",
        "This plan already has an execution attempt.",
      );
    const id = randomUUID(),
      lockToken = store.acquireExecutionLock(
        plan.chainId,
        plan.maker,
        input.owner,
        id,
        Math.min(300_000, Math.max(1, plan.expiresAt - Date.now())),
      );
    const attempt: TransactionAttempt = {
      id,
      owner: addressSchema.parse(input.owner),
      groupId: input.groupId,
      planId: plan.id,
      idempotencyKey: input.idempotencyKey,
      createdAt: Date.now(),
      walletBatchId: null,
      providerTransactionId: null,
      transactionHash: null,
      nonce: null,
      status: "prepared",
      receipt: null,
    };
    // A browser wallet may remain open beyond plan expiry. Reserve until explicit rejection or receipt recovery.
    store.markExecutionUnresolved(lockToken);
    store.put("transaction", attempt, input.owner);
    store.putDocument("attempt-lock", id, input.owner, lockToken);
    return { plan, attempt, lockToken };
  });
}
export function assertManagedExecutionCurrent(
  input: ExecutionGuard,
  store: ManagedStore = openManagedStore(),
) {
  return store.transaction(() => {
    const plan = currentPlan(store, input);
    const attempt = store.get("transaction", input.attemptId, input.owner);
    const lock = store.getDocument<ExecutionLock>(
      "attempt-lock",
      input.attemptId,
      input.owner,
    )?.data;
    if (
      !attempt ||
      attempt.planId !== plan.id ||
      !lock ||
      canonicalDigest(lock) !== canonicalDigest(input.lockToken) ||
      !["prepared", "submitted"].includes(attempt.status)
    )
      throw new ManagedError(
        "invalid_attempt",
        "The execution attempt is no longer current.",
      );
    store.assertExecutionLock(lock, {
      allowUnresolved: true,
    });
    return plan;
  });
}
export function recordManagedSubmission(
  input: {
    owner: string;
    attemptId: string;
    transactionHash?: TransactionAttempt["transactionHash"];
    walletBatchId?: string;
    providerTransactionId?: string;
    nonce?: string;
  },
  store: ManagedStore = openManagedStore(),
) {
  return store.transaction(() => {
    const attempt = store.get("transaction", input.attemptId, input.owner);
    if (!attempt)
      throw new ManagedError(
        "not_found",
        "Transaction attempt not found.",
        404,
      );
    if (attempt.status !== "prepared")
      throw new ManagedError(
        "attempt_submitted",
        "The transaction attempt was already submitted.",
      );
    if (
      !input.transactionHash &&
      !input.walletBatchId &&
      !input.providerTransactionId
    )
      throw new ManagedError(
        "missing_transaction",
        "Record a transaction hash or wallet batch identifier.",
        400,
      );
    const lock = store.getDocument<ExecutionLock>(
      "attempt-lock",
      attempt.id,
      input.owner,
    )?.data;
    if (!lock)
      throw new ManagedError(
        "missing_lock",
        "The transaction lock is unavailable.",
      );
    // This exact attempt reserved an unresolved lock before any wallet interaction.
    // Record late wallet results even after plan expiry so recovery keeps the hash.
    return store.put(
      "transaction",
      {
        ...attempt,
        status: "submitted",
        transactionHash: input.transactionHash ?? null,
        walletBatchId: input.walletBatchId ?? null,
        providerTransactionId: input.providerTransactionId ?? null,
        nonce: input.nonce ?? null,
      },
      input.owner,
    );
  });
}
export function failManagedExecution(
  input: {
    owner: string;
    attemptId: string;
    lockToken: ExecutionLock;
    submitted: boolean;
  },
  store: ManagedStore = openManagedStore(),
) {
  return store.transaction(() => {
    const attempt = store.get("transaction", input.attemptId, input.owner);
    const lock = store.getDocument<ExecutionLock>(
      "attempt-lock",
      input.attemptId,
      input.owner,
    )?.data;
    if (
      !attempt ||
      !lock ||
      canonicalDigest(lock) !== canonicalDigest(input.lockToken)
    )
      throw new ManagedError(
        "invalid_attempt",
        "The transaction attempt is unavailable.",
      );
    if (["confirmed", "failed"].includes(attempt.status)) return attempt;
    const uncertain = input.submitted || attempt.status !== "prepared";
    if (!uncertain) store.releaseExecutionLock(lock);
    return store.put(
      "transaction",
      { ...attempt, status: uncertain ? "unknown" : "failed" },
      input.owner,
    );
  });
}
