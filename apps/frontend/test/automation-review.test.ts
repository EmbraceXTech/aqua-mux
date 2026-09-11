import test from "node:test";
import assert from "node:assert/strict";
import { ManagedStore } from "../lib/server/store";
import {
  runGroupReview,
  type ReviewDependencies,
} from "../lib/server/automation/reviews";
import { transitionBot } from "../lib/server/automation/lease";
import { DevelopmentReviewEntitlement } from "../lib/server/payments/review-service";
import { groupFixture, ownerA, ownerB } from "./managed-fixtures";
import type { BotRun } from "../lib/managed";
import type { RunnerResult } from "../lib/server/managed-service/runner";
function fixture() {
  const store = new ManagedStore(":memory:"),
    group = groupFixture();
  store.put("group", group, ownerA);
  let now = Date.now();
  const bot: BotRun = transitionBot(
    {
      id: "bot",
      owner: ownerA,
      groupId: group.id,
      mode: "manual",
      state: "idle",
      intervalMs: 60_000,
      nextDueAt: now,
      runGeneration: 0,
      policyId: group.config.policy.id,
      stopReason: null,
      lease: null,
    },
    "start",
    "tab-a",
    now,
  );
  store.put("bot", bot, ownerA);
  let calls = 0;
  const deps: ReviewDependencies = {
    store,
    now: () => now,
    timeoutMs: 1000,
    entitlement: new DevelopmentReviewEntitlement(5),
    snapshot: async () => ({
      observedAt: now,
      blockTimestamp: now,
      blockNumber: "1",
      blockHash: `0x${"1".repeat(64)}`,
      chainId: 42161,
      maker: ownerA,
      nativeBalanceWei: "100",
      balances: [],
      allowances: [],
      coverage: [],
    }),
    runner: {
      review: async (request) => {
        calls++;
        return {
          requestId: request.requestId,
          provider: "test",
          model: "fixture",
          runtimeVersion: "fixture",
          usage: { cost: null },
          result: {
            version: 1,
            decision: "hold",
            rationale: "No change based on the fixture snapshot.",
            evidence: [],
            expectedEffects: [],
            uncertainties: [],
          },
        };
      },
      cancel: async () => {},
    },
  };
  const input = {
    idempotencyKey: "review-key",
    sessionId: "tab-a",
    generation: bot.runGeneration,
    purpose: "interval" as const,
  };
  return {
    store,
    group,
    bot,
    deps,
    input,
    calls: () => calls,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
test("review persists actual runner hold and idempotent retry never reruns inference", async () => {
  const f = fixture();
  try {
    const first = await runGroupReview(ownerA, f.group.id, f.input, f.deps);
    const again = await runGroupReview(ownerA, f.group.id, f.input, f.deps);
    assert.equal(first.status, "succeeded");
    assert.deepEqual(first, again);
    assert.equal(f.calls(), 1);
    await assert.rejects(
      runGroupReview(
        ownerA,
        f.group.id,
        { ...f.input, purpose: "proposal" },
        f.deps,
      ),
      /another review/,
    );
    await assert.rejects(
      runGroupReview(
        ownerA,
        f.group.id,
        { ...f.input, idempotencyKey: "next" },
        f.deps,
      ),
      /not due/,
    );
  } finally {
    f.store.close();
  }
});
test("another owner cannot run a bot or read its review", async () => {
  const f = fixture();
  try {
    await assert.rejects(
      runGroupReview(ownerB, f.group.id, f.input, f.deps),
      /not found/,
    );
    assert.equal(f.calls(), 0);
  } finally {
    f.store.close();
  }
});
test("stop during a model call cancels stale result and releases only that review lock", async () => {
  const f = fixture();
  let finish!: (result: RunnerResult) => void;
  let requestId = "";
  f.deps.runner.review = async (request) => {
    requestId = request.requestId;
    return new Promise((resolve) => {
      finish = resolve;
    });
  };
  try {
    const pending = runGroupReview(ownerA, f.group.id, f.input, f.deps);
    while (!finish) await new Promise((resolve) => setImmediate(resolve));
    f.store.put(
      "bot",
      transitionBot(f.bot, "stop", "tab-a", Date.now()),
      ownerA,
    );
    finish({
      requestId,
      provider: "test",
      model: "fixture",
      runtimeVersion: "fixture",
      usage: { cost: null },
      result: {
        version: 1,
        decision: "hold",
        rationale: "Late model output.",
        evidence: [],
        expectedEffects: [],
        uncertainties: [],
      },
    });
    const review = await pending;
    assert.equal(review.status, "cancelled");
    assert.equal(review.result, undefined);
    assert.equal(f.store.list("plan", ownerA).length, 0);
    assert.equal(f.store.get("bot", f.bot.id, ownerA)?.state, "stopped");
    const lock = f.store.acquireExecutionLock(
      42161,
      ownerA,
      ownerA,
      "next",
      1000,
    );
    f.store.releaseExecutionLock(lock);
  } finally {
    f.store.close();
  }
});
test("stale data and quota failures persist visible failures and pause the bot", async () => {
  for (const kind of ["stale", "quota"]) {
    const f = fixture();
    try {
      if (kind === "quota")
        f.deps.entitlement = new DevelopmentReviewEntitlement(0);
      else {
        const original = f.deps.runner.review;
        f.deps.runner.review = async (...args) => {
          const result = await original(...args);
          f.advance(31_000);
          return result;
        };
      }
      const review = await runGroupReview(ownerA, f.group.id, f.input, f.deps);
      assert.equal(review.status, "failed");
      assert.equal(f.store.get("bot", f.bot.id, ownerA)?.state, "paused");
      assert.equal(f.store.list("plan", ownerA).length, 0);
    } finally {
      f.store.close();
    }
  }
});

test("same-key retry after SQLite restart terminalizes expired pending review without inference", async () => {
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { canonicalDigest } = await import("../lib/managed");
  const directory = mkdtempSync(join(tmpdir(), "aquamux-review-restart-"));
  const path = join(directory, "store.sqlite");
  const f = fixture();
  let persistent = new ManagedStore(path);
  try {
    const createdAt = Date.now() - 10_000;
    persistent.put("group", f.group, ownerA);
    persistent.put("bot", f.bot, ownerA);
    const review = {
      id: "crashed-review",
      owner: ownerA,
      groupId: f.group.id,
      botId: f.bot.id,
      createdAt,
      runGeneration: f.bot.runGeneration,
      snapshot: {},
      coverage: [],
      provider: "unavailable",
      model: "unavailable",
      runtimeVersion: "unavailable",
      status: "pending" as const,
      errors: [],
      usage: { cost: null },
    };
    persistent.put("review", review, ownerA);
    persistent.putDocument(
      "review-keys",
      canonicalDigest({ groupId: f.group.id, key: f.input.idempotencyKey }),
      ownerA,
      {
        reviewId: review.id,
        digest: canonicalDigest({
          groupId: f.group.id,
          purpose: "interval",
          sessionId: "tab-a",
          generation: f.bot.runGeneration,
        }),
      },
    );
    const lock = persistent.acquireExecutionLock(
      42161,
      ownerA,
      ownerA,
      review.id,
      1000,
    );
    persistent.putDocument("review-lock", review.id, ownerA, lock);
    persistent.close();
    persistent = new ManagedStore(path);
    const result = await runGroupReview(ownerA, f.group.id, f.input, {
      ...f.deps,
      store: persistent,
    });
    assert.equal(result.status, "cancelled");
    assert.equal(f.calls(), 0);
    assert.equal(persistent.get("bot", f.bot.id, ownerA)?.state, "paused");
    const next = persistent.acquireExecutionLock(
      42161,
      ownerA,
      ownerA,
      "new-run",
      1000,
    );
    persistent.releaseExecutionLock(next);
  } finally {
    persistent.close();
    f.store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
