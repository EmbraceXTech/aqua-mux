import { assertReviewSnapshotFresh } from "../managed-service/freshness";
import { normalizeProposalConfig } from "../managed-service/proposal-config";
import { groupReviewSnapshot } from "../managed-service/review-snapshot";
import { watchReviewLiveness } from "./liveness";
import { randomUUID } from "node:crypto";
import {
  canonicalDigest,
  addressSchema,
  type Records,
  type StrategyGroup,
} from "../../managed";
import {
  openManagedStore,
  type ManagedStore,
  type ExecutionLock,
} from "../store";
import {
  DevelopmentReviewEntitlement,
  type ReviewEntitlement,
} from "../payments/review-service";
import { configuredRunner, type ReviewRunner } from "../managed-service/runner";
import {
  validateConfigTokens,
  type WalletSnapshot,
} from "../managed-service/snapshot";
import { ownedGroup, groupBot } from "../managed-service/groups";
import { ManagedError } from "../managed-service/errors";
import { assertLiveRun, pauseBot } from "./lease";

const active = new Map<
  string,
  { controller: AbortController; runner: ReviewRunner; requestId: string }
>();
export function cancelGroupReview(groupId: string) {
  const run = active.get(groupId);
  if (run) {
    run.controller.abort();
    void run.runner.cancel(run.requestId);
  }
}
export interface ReviewDependencies {
  store: ManagedStore;
  runner: ReviewRunner;
  entitlement: ReviewEntitlement;
  snapshot(group: StrategyGroup): Promise<WalletSnapshot>;
  now: () => number;
  timeoutMs: number;
}
export function reviewDependencies(): ReviewDependencies {
  return {
    store: openManagedStore(),
    runner: {
      review: (request, signal) => configuredRunner().review(request, signal),
      cancel: async (id) => {
        try {
          await configuredRunner().cancel(id);
        } catch {
          /* No configured runner has nothing to cancel. */
        }
      },
    },
    entitlement: new DevelopmentReviewEntitlement(
      Number(process.env.AQUAMUX_REVIEW_QUOTA ?? 100),
    ),
    snapshot: (g) => groupReviewSnapshot(g, openManagedStore()),
    now: Date.now,
    timeoutMs: 120_000,
  };
}
export async function runGroupReview(
  owner: string,
  groupId: string,
  input: {
    idempotencyKey: string;
    sessionId?: string;
    generation?: number;
    purpose: "proposal" | "interval";
  },
  deps: ReviewDependencies = reviewDependencies(),
): Promise<Records["review"]> {
  const { store, now } = deps;
  const key = canonicalDigest({ groupId, key: input.idempotencyKey });
  const reservation = store.transaction(() => {
    const group = ownedGroup(store, owner, groupId),
      bot = groupBot(store, owner, groupId);
    const prior = store.getDocument<{ reviewId: string; digest: string }>(
      "review-keys",
      key,
      owner,
    );
    const digest = canonicalDigest({
      groupId,
      purpose: input.purpose,
      sessionId: input.sessionId ?? null,
      generation: input.generation ?? null,
    });
    if (prior) {
      if (prior.data.digest !== digest)
        throw new ManagedError(
          "idempotency_conflict",
          "This request key belongs to another review.",
        );
      let review = store.get("review", prior.data.reviewId, owner)!;
      if (
        review.status === "pending" &&
        review.createdAt + deps.timeoutMs <= now()
      ) {
        review = store.put(
          "review",
          {
            ...review,
            status: "cancelled",
            errors: ["The previous review did not finish before its deadline."],
          },
          owner,
        );
        const oldLock = store.getDocument<ExecutionLock>(
          "review-lock",
          review.id,
          owner,
        )?.data;
        if (oldLock) {
          try {
            store.releaseExecutionLock(oldLock);
          } catch {
            /* A newer fence owns recovery. */
          }
        }
        if (bot.runGeneration === review.runGeneration)
          store.put(
            "bot",
            pauseBot(
              bot,
              "The previous review timed out. Resume from a fresh snapshot.",
            ),
            owner,
          );
      }
      return { existing: review };
    }
    if (input.purpose === "interval") {
      assertLiveRun(bot, input.sessionId ?? "", input.generation ?? -1, now());
      if (bot.nextDueAt > now())
        throw new ManagedError("not_due", "The next review is not due yet.");
    }
    if (group.config.policy.expiresAt.value <= now())
      throw new ManagedError(
        "policy_expired",
        "The management policy expired.",
      );
    const pending = store
      .list("review", owner, groupId)
      .find((r) => r.status === "pending");
    if (pending && pending.createdAt + deps.timeoutMs > now())
      throw new ManagedError("review_busy", "A review is already running.");
    if (pending)
      store.put(
        "review",
        {
          ...pending,
          status: "cancelled",
          errors: ["The previous review did not finish before its deadline."],
        },
        owner,
      );
    const id = randomUUID();
    const lock = store.acquireExecutionLock(
      group.chainId,
      group.maker,
      owner,
      id,
      Math.min(300_000, deps.timeoutMs + 30_000),
    );
    const record: Records["review"] = {
      id,
      owner: addressSchema.parse(owner),
      groupId,
      botId: bot.id,
      createdAt: now(),
      runGeneration: bot.runGeneration,
      snapshot: {},
      coverage: [],
      provider: "unavailable",
      model: "unavailable",
      runtimeVersion: "unavailable",
      status: "pending",
      errors: [],
      usage: { cost: null },
    };
    store.put("review", record, owner);
    store.putDocument("review-lock", record.id, owner, lock);
    store.putDocument("review-keys", key, owner, { reviewId: id, digest });
    if (input.purpose === "interval")
      store.put("bot", { ...bot, nextDueAt: now() + bot.intervalMs }, owner);
    return { group, bot, record, lock };
  });
  if ("existing" in reservation) return reservation.existing!;
  const { group, bot, record, lock } = reservation;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs);
  const stopWatching = watchReviewLiveness({
    store,
    owner,
    groupId,
    generation: bot.runGeneration,
    requiresLease: input.purpose === "interval",
    controller,
  });
  active.set(groupId, {
    controller,
    runner: deps.runner,
    requestId: record.id,
  });
  try {
    await deps.entitlement.authorize({
      owner,
      requestId: record.id,
      priorReviews: store
        .list("review", owner)
        .filter((r) => r.id !== record.id).length,
    });
    const snapshot = await deps.snapshot(group);
    if (controller.signal.aborted)
      throw new ManagedError(
        "review_timeout",
        "The review deadline elapsed.",
        408,
      );
    const check = () => {
      const current = groupBot(store, owner, groupId);
      store.assertExecutionLock(lock);
      if (
        current.runGeneration !== bot.runGeneration ||
        canonicalDigest(ownedGroup(store, owner, groupId).config) !==
          canonicalDigest(group.config)
      )
        throw new ManagedError(
          "stale_generation",
          "The review became stale after a stop or configuration change.",
        );
      if (input.purpose === "interval")
        assertLiveRun(
          current,
          input.sessionId ?? "",
          input.generation ?? -1,
          now(),
        );
    };
    check();
    store.put(
      "review",
      { ...record, snapshot, coverage: snapshot.coverage },
      owner,
    );
    const result = await deps.runner.review(
      {
        requestId: record.id,
        owner,
        groupId,
        botId: bot.id,
        runGeneration: bot.runGeneration,
        purpose: input.purpose,
        config: group.config,
        snapshot,
        deadline: record.createdAt + deps.timeoutMs,
      },
      controller.signal,
    );
    return store.transaction(() => {
      check();
      if (controller.signal.aborted)
        throw new ManagedError(
          "review_timeout",
          "The review deadline elapsed.",
          408,
        );
      assertReviewSnapshotFresh(
        snapshot,
        group.config.policy.maxReferenceAgeMs.value,
        now(),
      );
      const config = result.result.proposedConfig
        ? normalizeProposalConfig(result.result.proposedConfig)
        : undefined;
      if (config) result.result.proposedConfig = config;
      if (config) {
        validateConfigTokens(config, snapshot.tokenMetadata);
        if (
          config.chainId !== group.chainId ||
          config.maker !== group.maker ||
          config.recipeId !== group.config.recipeId ||
          canonicalDigest(config.policy) !==
            canonicalDigest(group.config.policy)
        )
          throw new ManagedError(
            "invalid_review",
            "The agent changed the authorized identity or policy.",
            502,
          );
      }
      if (
        !group.config.policy.allowedActions.value.includes(
          result.result.decision,
        )
      )
        throw new ManagedError(
          "invalid_review",
          "The agent proposed an action outside the reviewed policy.",
          502,
        );
      const saved = {
        ...record,
        snapshot,
        coverage: snapshot.coverage,
        ...result,
        id: record.id,
        status: "succeeded" as const,
      };
      const { requestId: _requestId, ...review } = saved;
      void _requestId;
      store.put("review", review, owner);
      return review;
    });
  } catch (error) {
    const reason =
      error instanceof ManagedError
        ? error.message
        : "The review failed. No transaction was authorized.";
    return store.transaction(() => {
      const current = store.get("review", record.id, owner)!;
      const saved = {
        ...current,
        status: (controller.signal.aborted ||
        (error instanceof ManagedError &&
          ["stale_generation", "lease_expired"].includes(error.code))
          ? "cancelled"
          : "failed") as "cancelled" | "failed",
        errors: [reason],
      };
      store.put("review", saved, owner);
      const currentBot = groupBot(store, owner, groupId);
      if (
        input.purpose === "interval" &&
        currentBot.runGeneration === bot.runGeneration
      )
        store.put("bot", pauseBot(currentBot, reason), owner);
      return saved;
    });
  } finally {
    stopWatching();
    clearTimeout(timer);
    if (active.get(groupId)?.requestId === record.id) active.delete(groupId);
    if (controller.signal.aborted) void deps.runner.cancel(record.id);
    try {
      store.releaseExecutionLock(lock);
    } catch {
      /* A newer fence owns the lock. */
    }
  }
}
