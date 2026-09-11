import { z } from "zod";
import { AuthError } from "../auth";
import { DevBasketService } from "./baskets";
import { assertLocalRequest, DevWalletError } from "./config";
import {
  devManagedStatus,
  executeDevManagedPlan,
  isDevManagedReview,
  prepareDevManagedPlan,
} from "./managed";
import {
  connectLocalWallet,
  disconnectLocalWallet,
  requireDevSession,
} from "./session";

const id = z
  .string()
  .min(1)
  .max(160)
  .regex(/^[a-zA-Z0-9_-]+$/);
const execution = z.strictObject({
  id,
  digest: z.string().regex(/^(0x)?[a-fA-F0-9]{64}$/),
  confirmed: z.literal(true),
});
async function body(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new DevWalletError("A JSON request is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 65_536) {
        await reader.cancel();
        throw new DevWalletError("Local wallet request is too large.");
      }
      chunks.push(chunk.value);
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally {
    reader.releaseLock();
  }
}

export async function handleDevWallet(request: Request, action: string) {
  try {
    assertLocalRequest(request);
    const input = await body(request);
    let result: unknown;
    if (action === "connect") {
      z.strictObject({}).parse(input);
      result = await connectLocalWallet(request);
    } else {
      const session = requireDevSession(request);
      const baskets = new DevBasketService();
      const assertSession = () => {
        requireDevSession(request);
      };
      switch (action) {
        case "plan": {
          const parsed = z.strictObject({ basket: z.unknown() }).parse(input);
          result = await baskets.prepare(session, parsed.basket);
          break;
        }
        case "lifecycle-plan": {
          const parsed = z
            .strictObject({
              planId: id,
              context: z
                .strictObject({
                  sessionId: id,
                  generation: z.number().int().nonnegative(),
                })
                .optional(),
            })
            .parse(input);
          result = prepareDevManagedPlan(
            session,
            parsed.planId,
            parsed.context,
          );
          break;
        }
        case "execute": {
          const parsed = execution.parse(input);
          result = isDevManagedReview(session, parsed.id)
            ? await executeDevManagedPlan(
                session,
                parsed.id,
                parsed.digest,
                assertSession,
              )
            : await baskets.execute(
                session,
                parsed.id,
                parsed.digest,
                assertSession,
              );
          break;
        }
        case "status": {
          const parsed = z.strictObject({ id }).parse(input);
          result = isDevManagedReview(session, parsed.id)
            ? await devManagedStatus(session, parsed.id)
            : await baskets.status(session, parsed.id);
          break;
        }
        case "disconnect":
          z.strictObject({}).parse(input);
          result = disconnectLocalWallet(request);
          break;
        default:
          throw new DevWalletError("Unknown local wallet action.");
      }
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // Never reflect RPC errors, URLs, raw transactions, signatures or environment values.
    const message =
      error instanceof DevWalletError || error instanceof AuthError
        ? error.message
        : error instanceof z.ZodError
          ? "Invalid local wallet request."
          : "Local wallet operation failed. Review its status before retrying.";
    return Response.json(
      { error: message },
      {
        status: error instanceof AuthError ? error.status : 400,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
