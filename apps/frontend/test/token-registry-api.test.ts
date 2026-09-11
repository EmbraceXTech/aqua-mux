import assert from "node:assert/strict";
import test from "node:test";
import { GET } from "../app/api/tokens/route";
import { AuthError, type OwnerSession } from "../lib/server/auth";
import { createTokenValidationPost } from "../lib/server/token-validation-http";
import {
  TokenValidationLimitError,
  TokenValidationLimiter,
} from "../lib/server/token-validation-limit";

test("token search endpoint rejects unsupported chains and unbounded input", async () => {
  const unsupported = await GET(
    new Request("http://localhost/api/tokens?chainId=8453"),
  );
  assert.equal(unsupported.status, 400);
  assert.match((await unsupported.json()).error, /Unsupported/);

  const longQuery = await GET(
    new Request(`http://localhost/api/tokens?chainId=1&q=${"a".repeat(81)}`),
  );
  assert.equal(longQuery.status, 400);
  assert.match((await longQuery.json()).error, /too long/);

  const zeroLimit = await GET(
    new Request("http://localhost/api/tokens?chainId=1&limit=0"),
  );
  assert.equal(zeroLimit.status, 400);
  assert.match((await zeroLimit.json()).error, /positive/);
});

const ownerSession: OwnerSession = {
  owner: "0x0000000000000000000000000000000000000001",
  sessionId: "test-session",
  expiresAt: Number.MAX_SAFE_INTEGER,
};

function validationRequest(body: unknown): Request {
  return new Request("http://127.0.0.1:3100/api/tokens/validate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "http://127.0.0.1:3100",
    },
    body: JSON.stringify(body),
  });
}

const validBody = {
  chainId: 1 as const,
  src: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  dst: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
  amount: "1",
};

test("token validation authenticates before reading the body or calling upstream", async () => {
  let upstreamCalls = 0;
  const post = createTokenValidationPost({
    authenticate: () => {
      throw new AuthError(401, "Authentication required.");
    },
    validate: async () => {
      upstreamCalls++;
      return {} as never;
    },
  });
  const response = await post(
    new Request("http://127.0.0.1:3100/api/tokens/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    }),
  );
  assert.equal(response.status, 401);
  assert.equal(upstreamCalls, 0);
});

test("token validation rejects oversized bodies and uint256 overflow before upstream", async () => {
  let upstreamCalls = 0;
  const post = createTokenValidationPost({
    authenticate: () => ownerSession,
    validate: async () => {
      upstreamCalls++;
      return {} as never;
    },
  });
  const oversized = await post(
    validationRequest({ ...validBody, pad: "x".repeat(1_024) }),
  );
  assert.equal(oversized.status, 413);
  const overflow = await post(
    validationRequest({ ...validBody, amount: (1n << 256n).toString() }),
  );
  assert.equal(overflow.status, 400);
  assert.equal(upstreamCalls, 0);
});

test("token validation overload never starts a second upstream operation", async () => {
  let upstreamCalls = 0;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const post = createTokenValidationPost({
    authenticate: () => ownerSession,
    limiter: new TokenValidationLimiter({ maxOwnerConcurrent: 1 }),
    validate: async () => {
      upstreamCalls++;
      await held;
      return {} as never;
    },
  });
  const first = post(validationRequest(validBody));
  await new Promise((resolve) => setImmediate(resolve));
  const overloaded = await post(validationRequest(validBody));
  assert.equal(overloaded.status, 429);
  assert.equal(overloaded.headers.get("Retry-After"), "1");
  assert.equal(upstreamCalls, 1);
  release?.();
  assert.equal((await first).status, 200);
});

test("token validation applies a process-local per-owner request rate", async () => {
  let upstreamCalls = 0;
  const post = createTokenValidationPost({
    authenticate: () => ownerSession,
    limiter: new TokenValidationLimiter({ maxOwnerRequestsPerWindow: 1 }),
    validate: async () => {
      upstreamCalls++;
      return {} as never;
    },
  });
  assert.equal((await post(validationRequest(validBody))).status, 200);
  assert.equal((await post(validationRequest(validBody))).status, 429);
  assert.equal(upstreamCalls, 1);
});

test("token validation limiter bounds process concurrency and request rate", async () => {
  let started = 0;
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const concurrencyLimiter = new TokenValidationLimiter({
    maxOwnerConcurrent: 2,
    maxProcessConcurrent: 1,
  });
  const first = concurrencyLimiter.run("owner-a", async () => {
    started++;
    await held;
  });
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(
    concurrencyLimiter.run("owner-b", async () => {
      started++;
    }),
    TokenValidationLimitError,
  );
  assert.equal(started, 1);
  release?.();
  await first;

  const rateLimiter = new TokenValidationLimiter({
    maxOwnerRequestsPerWindow: 2,
    maxProcessRequestsPerWindow: 1,
  });
  await rateLimiter.run("owner-a", async () => undefined);
  await assert.rejects(
    rateLimiter.run("owner-b", async () => undefined),
    TokenValidationLimitError,
  );
});
