import { ZodError } from "zod";
import { AuthError, requireOwner, type OwnerSession } from "./auth";
import {
  TokenValidationLimitError,
  TokenValidationLimiter,
} from "./token-validation-limit";

const MAX_BODY_BYTES = 8_192;

class LegacyBodyError extends Error {
  constructor(
    readonly status: 400 | 413,
    message: string,
  ) {
    super(message);
  }
}

export type LegacyAdmission = Pick<TokenValidationLimiter, "run">;

type LegacyPostDependencies = {
  authenticate?: (request: Request) => OwnerSession;
  limiter?: LegacyAdmission;
};

export const legacyApiLimiter = new TokenValidationLimiter({
  maxOwnerConcurrent: 2,
  maxProcessConcurrent: 8,
  maxOwnerRequestsPerWindow: 30,
  maxProcessRequestsPerWindow: 120,
});

async function boundedJsonBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new LegacyBodyError(400, "JSON request required.");
  }
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    throw new LegacyBodyError(413, "Request body is too large.");
  }
  if (!request.body) {
    throw new LegacyBodyError(400, "JSON body required.");
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
      throw new LegacyBodyError(413, "Request body is too large.");
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
    throw new LegacyBodyError(400, "Invalid JSON body.");
  }
}

export async function legacyPost<T>(
  request: Request,
  operation: (body: unknown, session: OwnerSession) => Promise<T>,
  dependencies: LegacyPostDependencies = {},
): Promise<T> {
  const session = (dependencies.authenticate ?? requireOwner)(request);
  const body = await boundedJsonBody(request);
  return (dependencies.limiter ?? legacyApiLimiter).run(session.owner, () =>
    operation(body, session),
  );
}

export function legacyFailure(error: unknown): Response {
  const status =
    error instanceof AuthError
      ? error.status
      : error instanceof LegacyBodyError
        ? error.status
        : error instanceof TokenValidationLimitError
          ? 429
          : 400;
  const message =
    error instanceof AuthError || error instanceof LegacyBodyError
      ? error.message
      : error instanceof TokenValidationLimitError
        ? "Request capacity is exhausted. Retry shortly."
        : error instanceof ZodError
          ? "Invalid request."
          : error instanceof Error
            ? /https?:|fetch failed|HTTP request|timeout|timed out/i.test(
                error.message,
              )
              ? "Network request failed. Please retry."
              : error.message.slice(0, 300)
            : "Request failed.";
  const headers: Record<string, string> = { "Cache-Control": "no-store" };
  if (error instanceof TokenValidationLimitError) {
    headers["Retry-After"] = String(error.retryAfterSeconds);
  }
  return Response.json({ error: message }, { status, headers });
}
