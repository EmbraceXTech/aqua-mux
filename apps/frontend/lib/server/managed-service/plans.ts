import { ensureManagedTokens } from "./tokens";
import { pairInventory, availableInventory, planFunding } from "./funding";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  addressSchema,
  canonicalDigest,
  idSchema,
  planDigest,
  tokenAmountSchema,
  type TokenAmount,
} from "../../managed";
import { openManagedStore } from "../store";
import {
  buildLifecyclePlan,
  type LifecycleRequest,
  type RouteRequest,
  type LifecycleRoute,
} from "../lifecycle";
import { readLifecycleSnapshot } from "../lifecycle/snapshot";
import { quoteLifecycleRoute } from "../lifecycle/routes";
import { simulateLifecyclePlan } from "../dev-wallet/simulation";
import { assertLiveRun } from "../automation/lease";
import { ownedGroup, groupBot } from "./groups";
import { walletSnapshot, verifiedToken } from "./snapshot";
import { ManagedError } from "./errors";
import type { ProposalIntent } from "./inputs";
import type { PlanContext } from "./execution";

export const planInputSchema = z.strictObject({
  reviewId: idSchema.optional(),
  action: z.enum(["fund-and-open", "replace", "close", "close-and-convert"]),
  targetToken: addressSchema.optional(),
  unwrap: z.boolean().optional(),
  sessionId: idSchema.optional(),
  generation: z.number().int().nonnegative().optional(),
  inventory: z.array(tokenAmountSchema).max(32).optional(),
});
export async function createManagedPlan(
  owner: string,
  groupId: string,
  raw: z.infer<typeof planInputSchema>,
) {
  const input = planInputSchema.parse(raw),
    store = openManagedStore(),
    group = ownedGroup(store, owner, groupId),
    bot = groupBot(store, owner, groupId);
  const close =
    input.action === "close" || input.action === "close-and-convert";
  const review = input.reviewId
    ? store.get("review", input.reviewId, owner)
    : null;
  if (
    !close &&
    (!review ||
      review.groupId !== groupId ||
      review.status !== "succeeded" ||
      !review.result ||
      review.runGeneration !== bot.runGeneration)
  )
    throw new ManagedError(
      "review_required",
      "A successful review from the current management run is required.",
    );
  if (!close && review?.result?.decision !== input.action)
    throw new ManagedError(
      "action_mismatch",
      "Choose the action returned by the current review.",
    );
  const config = close
    ? group.config
    : (review?.result?.proposedConfig ?? group.config);
  if (canonicalDigest(config) !== canonicalDigest(group.config))
    throw new ManagedError(
      "configuration_edit_required",
      "Apply the proposed configuration and request a fresh review before planning.",
    );
  const requiresLease = !close && bot.state === "running";
  if (requiresLease)
    assertLiveRun(
      bot,
      input.sessionId ?? "",
      input.generation ?? -1,
      Date.now(),
    );
  const id = randomUUID(),
    lock = store.acquireExecutionLock(
      group.chainId,
      group.maker,
      owner,
      id,
      120_000,
    );
  try {
    const snapshot = await walletSnapshot({
      chainId: group.chainId,
      maker: group.maker,
      assets: [
        ...(close
          ? group.config.pairs.flatMap((pair) => [
              pair.baseToken.address,
              pair.quoteToken.address,
            ])
          : group.config.policy.allowedAssets.value),
        ...group.inventory.map((i) => i.token.address),
      ],
      maxAgeMs: group.config.policy.maxReferenceAgeMs.value,
      storedTokens: [
        ...group.config.pairs.flatMap((pair) => [
          pair.baseToken,
          pair.quoteToken,
        ]),
        ...group.inventory.map((i) => i.token),
      ],
    });
    if (input.targetToken)
      await ensureManagedTokens(group.chainId, [input.targetToken]);
    let inventory: TokenAmount[] = input.inventory ?? group.inventory;
    if (!inventory.length) inventory = pairInventory(config);
    inventory = availableInventory(inventory, snapshot);
    const previous =
      close || input.action === "replace"
        ? store
            .list("strategy", owner, groupId)
            .filter((s) => s.state === "active")
            .map((s) => ({
              hash: s.hash,
              app: s.app,
              tokens: s.tokens.map((t) => t.address),
            }))
        : [];
    const intent = store.getDocument<{ intent: ProposalIntent }>(
      "group-intent",
      groupId,
      owner,
    )?.data.intent;
    const funding =
      !close && intent
        ? await planFunding(config, inventory, intent)
        : undefined;
    const gasReserveWei =
      intent?.gasReserveWei ?? config.policy.gasBudgetWei.value;
    const request: LifecycleRequest = {
      id,
      groupId,
      owner: addressSchema.parse(owner),
      config,
      runGeneration: bot.runGeneration,
      kind: input.action,
      inventory,
      previous,
      gasReserveWei,
      expiresAt: Date.now() + 120_000,
      ...(funding ? { funding } : {}),
      ...(input.action === "close-and-convert"
        ? {
            conversion: {
              targetToken: verifiedToken(
                group.chainId,
                input.targetToken ?? "",
              ),
              amounts: inventory,
              unwrap: input.unwrap ?? false,
            },
          }
        : {}),
    };
    const routes: { request: RouteRequest; route: LifecycleRoute }[] = [];
    const plan = await buildLifecyclePlan(request, {
      snapshot: readLifecycleSnapshot,
      quote: async (routeRequest) => {
        const route = await quoteLifecycleRoute(routeRequest);
        routes.push({ request: routeRequest, route });
        return route;
      },
      simulate: simulateLifecyclePlan,
    });
    if ("routesDigest" in plan && plan.routesDigest !== canonicalDigest(routes))
      throw new ManagedError(
        "route_binding",
        "Verified route records do not match the compiled plan.",
      );
    return store.transaction(() => {
      store.assertExecutionLock(lock);
      const current = groupBot(store, owner, groupId);
      if (
        current.runGeneration !== bot.runGeneration ||
        canonicalDigest(ownedGroup(store, owner, groupId).config) !==
          canonicalDigest(config)
      )
        throw new ManagedError(
          "stale_plan",
          "The management run changed during plan creation.",
        );
      if (requiresLease)
        assertLiveRun(
          current,
          input.sessionId ?? "",
          input.generation ?? -1,
          Date.now(),
        );
      store.put("plan", plan, owner);
      const context: PlanContext = {
        requiresLease,
        sessionId: input.sessionId ?? null,
        generation: bot.runGeneration,
        reviewId: input.reviewId ?? null,
      };
      store.putDocument("plan-context", plan.id, owner, context);
      store.putDocument("plan-routes", plan.id, owner, {
        digest: planDigest(plan),
        routes,
      });
      return { plan, digest: planDigest(plan) };
    });
  } finally {
    store.releaseExecutionLock(lock);
  }
}
