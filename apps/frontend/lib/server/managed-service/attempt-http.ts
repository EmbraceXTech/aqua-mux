import { z } from "zod";
import { hashSchema, idSchema } from "../../managed";
import type { ManagedStore } from "../store";
import { ManagedError } from "./errors";
import { recordManagedSubmission } from "./execution";
import {
  recordWalletStatus,
  rejectPreparedAttempt,
  walletStatusSchema,
} from "./wallet-status";
import {
  prepareExternalExecution,
  relayExternalExecution,
} from "./external-capability";
import { body, ok } from "./http-body";

export async function attemptApi(
  request: Request,
  segments: string[],
  owner: string,
  id: string,
  store: ManagedStore,
) {
  if (segments.length === 3) {
    const input = z
      .strictObject({
        planId: idSchema,
        idempotencyKey: idSchema,
        sessionId: idSchema.optional(),
        generation: z.number().int().nonnegative().optional(),
      })
      .parse(await body(request));
    return ok(
      await prepareExternalExecution({ owner, groupId: id, ...input }, store),
    );
  }
  if (segments.length === 5 && segments[4] === "signed") {
    const input = z
      .strictObject({
        serializedTransaction: z
          .string()
          .max(262144)
          .regex(/^0x02[0-9a-fA-F]+$/),
        sessionId: idSchema.optional(),
        generation: z.number().int().nonnegative().optional(),
      })
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
      attempt: await relayExternalExecution(
        {
          owner,
          groupId: id,
          planId: attempt.planId,
          attemptId: attempt.id,
          ...input,
          serializedTransaction: input.serializedTransaction as `0x${string}`,
        },
        store,
      ),
    });
  }
  if (segments.length === 5 && segments[4] === "submitted") {
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
  if (segments.length === 5 && segments[4] === "wallet-status")
    return ok({
      attempt: recordWalletStatus(
        owner,
        id,
        idSchema.parse(segments[3]),
        walletStatusSchema.parse(await body(request)),
      ),
    });
  if (segments.length === 5 && segments[4] === "rejected") {
    z.strictObject({ code: z.literal(4001) }).parse(await body(request));
    return ok({
      attempt: rejectPreparedAttempt(owner, id, idSchema.parse(segments[3])),
    });
  }
  if (segments.length === 5 && segments[4] === "not-sent") {
    const input = z
      .strictObject({
        reason: z.enum(["workspace_changed", "preflight_refused"]),
      })
      .parse(await body(request));
    return ok({
      attempt: rejectPreparedAttempt(
        owner,
        id,
        idSchema.parse(segments[3]),
        input.reason,
      ),
    });
  }
  throw new ManagedError("not_found", "Transaction endpoint not found.", 404);
}
