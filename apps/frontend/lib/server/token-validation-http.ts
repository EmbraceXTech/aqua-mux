import { z, ZodError } from "zod";
import { isAddress } from "viem";
import { isPositiveUint256Decimal } from "../token-registry";
import { AuthError, requireOwner, type OwnerSession } from "./auth";
import { validateTokenPair } from "./token-registry";
import {
  TokenValidationLimitError,
  tokenValidationLimiter,
  type TokenValidationLimiter,
} from "./token-validation-limit";

const MAX_BODY_BYTES = 1_024;

const requestSchema = z
  .object({
    chainId: z.union([
      z.literal(1),
      z.literal(56),
      z.literal(42161),
      z.literal(4663),
    ]),
    src: z
      .string()
      .length(42)
      .refine((value) => isAddress(value)),
    dst: z
      .string()
      .length(42)
      .refine((value) => isAddress(value)),
    amount: z.string().refine(isPositiveUint256Decimal),
  })
  .strict();

class TokenValidationBodyError extends Error {
  constructor(
    readonly status: 400 | 413,
    message: string,
  ) {
    super(message);
  }
}

async function boundedJsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new TokenValidationBodyError(400, "JSON request required.");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new TokenValidationBodyError(413, "Request body is too large.");
  }
  if (!request.body) {
    throw new TokenValidationBodyError(400, "JSON body required.");
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new TokenValidationBodyError(413, "Request body is too large.");
    }
    chunks.push(value);
  }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(body));
  } catch {
    throw new TokenValidationBodyError(400, "Invalid JSON body.");
  }
}

type HandlerDependencies = {
  authenticate?: (request: Request) => OwnerSession;
  limiter?: TokenValidationLimiter;
  validate?: typeof validateTokenPair;
};

export function createTokenValidationPost(
  dependencies: HandlerDependencies = {},
) {
  const authenticate = dependencies.authenticate ?? requireOwner;
  const limiter = dependencies.limiter ?? tokenValidationLimiter;
  const validate = dependencies.validate ?? validateTokenPair;

  return async function tokenValidationPost(
    request: Request,
  ): Promise<Response> {
    try {
      const session = authenticate(request);
      const input = requestSchema.parse(await boundedJsonBody(request));
      const result = await limiter.run(session.owner, () => validate(input));
      return Response.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (error) {
      const status =
        error instanceof AuthError
          ? error.status
          : error instanceof TokenValidationBodyError
            ? error.status
            : error instanceof TokenValidationLimitError
              ? 429
              : 400;
      const message =
        error instanceof AuthError ||
        error instanceof TokenValidationBodyError ||
        error instanceof TokenValidationLimitError
          ? error.message
          : error instanceof ZodError
            ? "Invalid token validation request."
            : "Token validation failed.";
      const headers: Record<string, string> = { "Cache-Control": "no-store" };
      if (error instanceof TokenValidationLimitError) {
        headers["Retry-After"] = String(error.retryAfterSeconds);
      }
      return Response.json({ error: message }, { status, headers });
    }
  };
}

export const tokenValidationPost = createTokenValidationPost();
