import { proposalHistory } from "./proposal-history";
import { checkManagedFundingRoute } from "./funding-route";
import { attemptApi } from "./attempt-http";
import { body, ok } from "./http-body";
import { walletSnapshot } from "./snapshot";
import { ensureManagedTokens } from "./tokens";
import { z, ZodError } from "zod";
import { AuthError, requireOwner } from "../auth";
import { StoreError, openManagedStore } from "../store";
import {
  capabilities,
  strategyCatalog,
  strategyConfigSchema,
  hashSchema,
  idSchema,
} from "../../managed";
import {
  groupInputSchema,
  botInputSchema,
  reviewInputSchema,
  intentSchema,
} from "./inputs";
import {
  createGroup,
  editGroup,
  groupBot,
  ownedGroup,
  updateBot,
} from "./groups";
import { cancelGroupReview, runGroupReview } from "../automation/reviews";
import { ManagedError, managedFailure } from "./errors";
import { createManagedPlan, planInputSchema } from "./plans";
import { confirmManagedPlan } from "./execution";
import {
  observeManagedGroup,
  reconcileManagedTransactions,
} from "./reconciliation";
import { proposeIntent } from "./proposals";
import { BROWSER_LEASE_MS } from "../automation/lease";
import {
  externalExecutionCapabilities,
  executionCapabilities,
  manualExternal,
} from "./external-capability";

export async function managedApi(
  request: Request,
  segments: string[],
  dependencies: { ensureTokens?: typeof ensureManagedTokens } = {},
): Promise<Response> {
  try {
    const method = request.method;
    if (method === "GET" && segments.join("/") === "catalog")
      return ok({
        catalog: strategyCatalog,
        capabilities: { ...capabilities, manualExternal },
        executionCapabilities,
        leaseTimeoutMs: BROWSER_LEASE_MS,
        service: { kind: "uncharged-development", price: null },
      });
    const { owner } = requireOwner(request),
      store = openManagedStore();
    if (segments.join("/") === "proposals" && method === "GET")
      return ok({ proposals: proposalHistory(store, owner) });
    if (
      segments[0] === "proposals" &&
      segments.length === 1 &&
      method === "POST"
    ) {
      const input = z
        .strictObject({ idempotencyKey: idSchema, intent: intentSchema })
        .parse(await body(request));
      return ok(await proposeIntent(owner, input.idempotencyKey, input.intent));
    }
    if (
      segments.length === 1 &&
      segments[0] === "funding-route" &&
      method === "POST"
    )
      return ok(await checkManagedFundingRoute(owner, await body(request)));
    if (segments[0] !== "groups")
      throw new ManagedError("not_found", "Managed endpoint not found.", 404);
    if (segments.length === 1) {
      if (method === "GET")
        return ok({
          groups: store.list("group", owner),
          bots: store.list("bot", owner),
          serverTime: Date.now(),
        });
      if (method === "POST") {
        const input = groupInputSchema.parse(await body(request));
        const tokens = await (dependencies.ensureTokens ?? ensureManagedTokens)(
          input.config.chainId,
          input.config.policy.allowedAssets.value,
        );
        return ok(createGroup(owner, input.config, input.mode, store, tokens));
      }
    }
    const id = idSchema.parse(segments[1]);
    const group = ownedGroup(store, owner, id);
    if (segments.length === 2) {
      if (method === "GET")
        return ok({
          group,
          executionCapabilities: await externalExecutionCapabilities(
            owner,
            group.chainId,
            group.maker,
          ),
          bot: groupBot(store, owner, id),
          reviews: store.list("review", owner, id),
          plans: store.list("plan", owner, id),
          strategies: store.list("strategy", owner, id),
          transactions: store.list("transaction", owner, id),
          movements: store.list("movement", owner, id),
          payments: store.list("payment", owner, id),
          observation:
            store.getDocument("group-observation", id, owner)?.data ?? null,
          serverTime: Date.now(),
          leaseTimeoutMs: BROWSER_LEASE_MS,
        });
      if (method === "PATCH") {
        const input = z
          .strictObject({
            config: strategyConfigSchema,
            authorizePolicy: z.literal(true).optional(),
          })
          .parse(await body(request));
        const tokens = await (dependencies.ensureTokens ?? ensureManagedTokens)(
          input.config.chainId,
          input.config.policy.allowedAssets.value,
          group.config.pairs.flatMap((pair) => [
            pair.baseToken,
            pair.quoteToken,
          ]),
        );
        const result = editGroup(
          owner,
          id,
          input.config,
          store,
          tokens,
          input.authorizePolicy,
        );
        cancelGroupReview(id);
        return ok(result);
      }
    }
    if (
      method === "GET" &&
      segments.length === 3 &&
      segments[2] === "inventory"
    ) {
      const tokens = group.config.pairs.flatMap((pair) => [
        pair.baseToken,
        pair.quoteToken,
      ]);
      const snapshot = await walletSnapshot({
        chainId: group.chainId,
        maker: group.maker,
        assets: [...new Set(tokens.map((token) => token.address))],
        storedTokens: tokens,
        maxAgeMs: 60000,
      });
      return ok({
        balances: snapshot.balances,
        blockNumber: snapshot.blockNumber,
        observedAt: snapshot.observedAt,
        attribution: "user-quantity-review-required",
      });
    }
    if (method !== "POST")
      throw new ManagedError(
        "method_not_allowed",
        "This managed action requires POST.",
        405,
      );
    const action = segments[2];
    if (action === "bot" && segments.length === 3) {
      const input = botInputSchema.parse(await body(request));
      if (["start", "resume", "takeover"].includes(input.action)) {
        const hasTransactions = store.list("transaction", owner, id).length > 0;
        const hasStrategies = store.list("strategy", owner, id).length > 0;
        if (hasTransactions) await reconcileManagedTransactions(owner, id);
        const observed = hasStrategies
          ? await observeManagedGroup(owner, id)
          : null;
        const coverage = observed?.history.coverage;
        const checkedAt =
          typeof coverage?.checkedAt === "string"
            ? Date.parse(coverage.checkedAt)
            : NaN;
        if (
          observed &&
          (observed.positions.health !== "current" ||
            !coverage ||
            coverage.health !== "current" ||
            !coverage.indexedThrough ||
            coverage.indexedThrough.number !== coverage.targetBlock ||
            !Number.isFinite(checkedAt) ||
            checkedAt > Date.now() + 10000 ||
            Date.now() - checkedAt >
              group.config.policy.maxReferenceAgeMs.value)
        )
          throw new ManagedError(
            "reconciliation_required",
            "Fresh position and fill reconciliation is required before resuming.",
          );
      }
      const result = updateBot(
        owner,
        id,
        input.action,
        input.sessionId,
        input.generation,
      );
      if (input.action === "stop" || input.action === "takeover")
        cancelGroupReview(id);
      return ok(result);
    }
    if (action === "reviews" && segments.length === 3) {
      const input = reviewInputSchema.parse(await body(request));
      return ok({
        review: await runGroupReview(owner, id, {
          ...input,
          purpose: "interval",
        }),
      });
    }
    if (action === "proposals" && segments.length === 3) {
      const input = z
        .strictObject({ idempotencyKey: idSchema })
        .parse(await body(request));
      return ok({
        review: await runGroupReview(owner, id, {
          ...input,
          purpose: "proposal",
        }),
      });
    }
    if (action === "plans" && segments.length === 3) {
      const input = planInputSchema.parse(await body(request));
      if (input.action === "close" || input.action === "close-and-convert") {
        updateBot(owner, id, "stop", input.sessionId ?? "owner-close");
        cancelGroupReview(id);
      }
      return ok(await createManagedPlan(owner, id, input));
    }
    if (
      action === "plans" &&
      segments.length === 5 &&
      segments[4] === "confirm"
    ) {
      const input = z
        .strictObject({
          digest: hashSchema,
          sessionId: idSchema.optional(),
          generation: z.number().int().nonnegative().optional(),
        })
        .parse(await body(request));
      return ok({
        plan: confirmManagedPlan({
          owner,
          groupId: id,
          planId: idSchema.parse(segments[3]),
          ...input,
        }),
      });
    }
    if (action === "attempts")
      return await attemptApi(request, segments, owner, id, store);
    if (action === "reconcile" && segments.length === 3) {
      const attempts = await reconcileManagedTransactions(owner, id);
      const observation = await observeManagedGroup(owner, id);
      return ok({ attempts, observation });
    }
    throw new ManagedError("not_found", "Managed endpoint not found.", 404);
  } catch (error) {
    if (error instanceof AuthError)
      return okError(error.status, "authentication_failed", error.message);
    if (error instanceof StoreError)
      return okError(
        error.code === "NOT_FOUND"
          ? 404
          : error.code === "FORBIDDEN"
            ? 403
            : 409,
        error.code.toLowerCase(),
        error.message,
      );
    if (error instanceof ZodError)
      return okError(
        400,
        "invalid_request",
        "The request does not match the managed API schema.",
      );
    return managedFailure(error);
  }
}
function okError(status: number, code: string, error: string) {
  return Response.json(
    { code, error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
