import test from "node:test";
import assert from "node:assert/strict";
import { ManagedStore } from "../lib/server/store";
import { buildLifecyclePlan } from "../lib/server/lifecycle";
import { lifecycleFixture, dependenciesFixture } from "./lifecycle-fixtures";
import { groupFixture, ownerA } from "./managed-fixtures";
import { planDigest, type BotRun } from "../lib/managed";
import { transitionBot } from "../lib/server/automation/lease";
import {
  confirmManagedPlan,
  prepareManagedExecution,
  assertManagedExecutionCurrent,
  recordManagedSubmission,
  failManagedExecution,
} from "../lib/server/managed-service/execution";
async function setup(requiresLease = false) {
  const store = new ManagedStore(":memory:"),
    request = lifecycleFixture(),
    group = { ...groupFixture(), config: request.config };
  store.put("group", group, ownerA);
  const bot: BotRun = {
    id: "bot",
    owner: ownerA,
    groupId: group.id,
    mode: "manual",
    state: requiresLease ? "running" : "idle",
    intervalMs: 60000,
    nextDueAt: Date.now(),
    runGeneration: 1,
    policyId: group.config.policy.id,
    stopReason: null,
    lease: requiresLease
      ? {
          sessionId: "tab-a",
          heartbeatAt: Date.now(),
          expiresAt: Date.now() + 45000,
        }
      : null,
  };
  store.put("bot", bot, ownerA);
  const generated = await buildLifecyclePlan(request, dependenciesFixture());
  const plan = {
    ...generated,
    createdAt: Date.now(),
    expiresAt: Date.now() + 60_000,
  };
  store.put("plan", plan, ownerA);
  store.putDocument("plan-context", plan.id, ownerA, {
    requiresLease,
    sessionId: requiresLease ? "tab-a" : null,
    generation: 1,
    reviewId: null,
  });
  const input = {
    owner: ownerA,
    groupId: group.id,
    planId: plan.id,
    idempotencyKey: "execution",
    ...(requiresLease ? { sessionId: "tab-a", generation: 1 } : {}),
  };
  return { store, plan, bot, input };
}
test("execution requires exact confirmation and journals before broadcast without releasing unresolved lock", async () => {
  const f = await setup();
  try {
    assert.throws(
      () => prepareManagedExecution(f.input, f.store),
      /Confirm this exact/,
    );
    assert.throws(
      () =>
        confirmManagedPlan(
          { ...f.input, digest: `0x${"0".repeat(64)}` },
          f.store,
        ),
      /current, unexpired/,
    );
    confirmManagedPlan({ ...f.input, digest: planDigest(f.plan) }, f.store);
    const prepared = prepareManagedExecution(f.input, f.store);
    const guard = {
      ...f.input,
      attemptId: prepared.attempt.id,
      lockToken: prepared.lockToken,
    };
    assertManagedExecutionCurrent(guard, f.store);
    assert.throws(
      () => prepareManagedExecution(f.input, f.store),
      /already has/,
    );
    recordManagedSubmission(
      {
        owner: ownerA,
        attemptId: prepared.attempt.id,
        transactionHash: `0x${"1".repeat(64)}`,
        nonce: "1",
      },
      f.store,
    );
    assertManagedExecutionCurrent(guard, f.store);
    failManagedExecution(
      {
        owner: ownerA,
        attemptId: prepared.attempt.id,
        lockToken: prepared.lockToken,
        submitted: true,
      },
      f.store,
    );
    assert.throws(
      () => f.store.acquireExecutionLock(42161, ownerA, ownerA, "next", 1000),
      /unresolved/,
    );
    assert.equal(
      f.store.get("transaction", prepared.attempt.id, ownerA)?.status,
      "unknown",
    );
  } finally {
    f.store.close();
  }
});
test("stop after preparation refuses a recurring transaction before signing", async () => {
  const f = await setup(true);
  try {
    confirmManagedPlan({ ...f.input, digest: planDigest(f.plan) }, f.store);
    const prepared = prepareManagedExecution(f.input, f.store);
    f.store.put(
      "bot",
      transitionBot(f.bot, "stop", "tab-a", Date.now()),
      ownerA,
    );
    assert.throws(
      () =>
        assertManagedExecutionCurrent(
          {
            ...f.input,
            attemptId: prepared.attempt.id,
            lockToken: prepared.lockToken,
          },
          f.store,
        ),
      /earlier management run/,
    );
    failManagedExecution(
      {
        owner: ownerA,
        attemptId: prepared.attempt.id,
        lockToken: prepared.lockToken,
        submitted: false,
      },
      f.store,
    );
    const next = f.store.acquireExecutionLock(
      42161,
      ownerA,
      ownerA,
      "owner-close",
      1000,
    );
    f.store.releaseExecutionLock(next);
  } finally {
    f.store.close();
  }
});

test("external wallet rejection releases a prepared attempt and batch status can discover a hash", async () => {
  const { recordWalletStatus, rejectPreparedAttempt } =
    await import("../lib/server/managed-service/wallet-status");
  const state = globalThis as typeof globalThis & {
    aquamuxManagedStore?: ManagedStore;
  };
  const previous = state.aquamuxManagedStore;
  const f = await setup();
  state.aquamuxManagedStore = f.store;
  try {
    confirmManagedPlan({ ...f.input, digest: planDigest(f.plan) }, f.store);
    const prepared = prepareManagedExecution(f.input, f.store);
    rejectPreparedAttempt(ownerA, f.input.groupId, prepared.attempt.id);
    assert.equal(
      f.store.get("transaction", prepared.attempt.id, ownerA)?.status,
      "failed",
    );
    assert.equal(
      f.store.get("plan", f.plan.id, ownerA)?.authorization.kind,
      "unconfirmed",
    );
    confirmManagedPlan({ ...f.input, digest: planDigest(f.plan) }, f.store);
    const next = prepareManagedExecution(
      { ...f.input, idempotencyKey: "new-wallet-attempt" },
      f.store,
    );
    recordManagedSubmission(
      {
        owner: ownerA,
        attemptId: next.attempt.id,
        walletBatchId: "wallet-batch",
      },
      f.store,
    );
    const result = recordWalletStatus(
      ownerA,
      f.input.groupId,
      next.attempt.id,
      {
        walletBatchId: "wallet-batch",
        status: 200,
        atomic: true,
        transactionHashes: [`0x${"2".repeat(64)}`],
      },
    );
    assert.equal(result.transactionHash, `0x${"2".repeat(64)}`);
    assert.equal(result.status, "submitted");
    assert.throws(
      () => rejectPreparedAttempt(ownerA, f.input.groupId, next.attempt.id),
      /must be reconciled/,
    );
    assert.throws(
      () => f.store.acquireExecutionLock(42161, ownerA, ownerA, "later", 1000),
      /unresolved/,
    );
  } finally {
    state.aquamuxManagedStore = previous;
    f.store.close();
  }
});

test("RPC execution trace proves exact external account calls and rejects partial or failed batches", async () => {
  const { traceProvesPlan } =
    await import("../lib/server/managed-service/transaction-proof");
  const f = await setup();
  try {
    const account = {
      type: "CALL",
      to: ownerA,
      calls: f.plan.calls.map((call) => ({
        type: "CALL",
        from: ownerA,
        to: call.to,
        input: call.data,
        value: call.value,
      })),
    };
    assert.equal(
      traceProvesPlan(
        {
          type: "CALL",
          to: "0x2222222222222222222222222222222222222222",
          calls: [account],
        },
        f.plan,
      ),
      true,
    );
    assert.equal(
      traceProvesPlan({ ...account, calls: account.calls.slice(1) }, f.plan),
      false,
    );
    assert.equal(
      traceProvesPlan({ ...account, error: "execution reverted" }, f.plan),
      false,
    );
    assert.equal(
      traceProvesPlan(
        {
          ...account,
          calls: account.calls.map((call, index) =>
            index ? call : { ...call, value: "0xffff" },
          ),
        },
        f.plan,
      ),
      false,
    );
  } finally {
    f.store.close();
  }
});
