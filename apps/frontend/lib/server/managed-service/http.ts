import { ensureManagedTokens } from "./tokens";
import {
  recordWalletStatus,
  rejectPreparedAttempt,
  walletStatusSchema,
} from "./wallet-status";
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
import {
  confirmManagedPlan,
  prepareManagedExecution,
  recordManagedSubmission,
} from "./execution";
import {
  observeManagedGroup,
  reconcileManagedTransactions,
} from "./reconciliation";
import { proposeIntent } from "./proposals";
import { BROWSER_LEASE_MS } from "../automation/lease";

async function body(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ManagedError("invalid_request", "Send a JSON request.", 400);
  const reader = request.body?.getReader();
  if (!reader)
    throw new ManagedError("invalid_request", "A JSON body is required.", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.byteLength;
    if (size > 128_000) {
      await reader.cancel();
      throw new ManagedError(
        "request_too_large",
        "The request body is too large.",
        413,
      );
    }
    chunks.push(item.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ManagedError(
      "invalid_request",
      "The request body is not valid JSON.",
      400,
    );
  }
}
const ok = (value: unknown) =>
  Response.json(value, { headers: { "Cache-Control": "no-store" } });
export async function managedApi(
  request: Request,
  segments: string[],
): Promise<Response> {
  try {
    const method = request.method;
    if (method === "GET" && segments.join("/") === "catalog")
      return ok({
        catalog: strategyCatalog,
        capabilities,
        leaseTimeoutMs: BROWSER_LEASE_MS,
        service: { kind: "uncharged-development", price: null },
      });
    const { owner } = requireOwner(request),
      store = openManagedStore();
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
        await ensureManagedTokens(
          input.config.chainId,
          input.config.policy.allowedAssets.value,
        );
        return ok(createGroup(owner, input.config, input.mode));
      }
    }
    const id = idSchema.parse(segments[1]);
    const group = ownedGroup(store, owner, id);
    if (segments.length === 2) {
      if (method === "GET")
        return ok({
          group,
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
          .strictObject({ config: strategyConfigSchema })
          .parse(await body(request));
        await ensureManagedTokens(
          input.config.chainId,
          input.config.policy.allowedAssets.value,
          group.config.pairs.flatMap((pair) => [
            pair.baseToken,
            pair.quoteToken,
          ]),
        );
        const result = editGroup(owner, id, input.config);
        cancelGroupReview(id);
        return ok(result);
      }
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
    if (action === "plans" && segments.length === 3)
      return ok(
        await createManagedPlan(
          owner,
          id,
          planInputSchema.parse(await body(request)),
        ),
      );
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
    if (action === "attempts" && segments.length === 3) {
      const input = z
        .strictObject({
          planId: idSchema,
          idempotencyKey: idSchema,
          sessionId: idSchema.optional(),
          generation: z.number().int().nonnegative().optional(),
        })
        .parse(await body(request));
      const prepared = prepareManagedExecution({
        owner,
        groupId: id,
        ...input,
      });
      return ok({ plan: prepared.plan, attempt: prepared.attempt });
    }
    if (
      action === "attempts" &&
      segments.length === 5 &&
      segments[4] === "submitted"
    ) {
      const input = z
        .strictObject({
          transactionHash: hashSchema.optional(),
          walletBatchId: z.string().min(1).max(240).optional(),
        })
        .refine((v) => v.transactionHash || v.walletBatchId)
        .parse(await body(request));
      const attempt = store.get(
        "transaction",
        idSchema.parse(segments[3]),
        owner,
      );
      if (!attempt || attempt.groupId !== id)
        throw new ManagedError(
          "not_found",
          "Transaction attempt not found.",
          404,
        );
      return ok({
        attempt: recordManagedSubmission({
          owner,
          attemptId: attempt.id,
          ...input,
        }),
      });
    }
    if (
      action === "attempts" &&
      segments.length === 5 &&
      segments[4] === "wallet-status"
    )
      return ok({
        attempt: recordWalletStatus(
          owner,
          id,
          idSchema.parse(segments[3]),
          walletStatusSchema.parse(await body(request)),
        ),
      });
    if (
      action === "attempts" &&
      segments.length === 5 &&
      segments[4] === "rejected"
    ) {
      z.strictObject({ code: z.literal(4001) }).parse(await body(request));
      return ok({
        attempt: rejectPreparedAttempt(owner, id, idSchema.parse(segments[3])),
      });
    }
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
