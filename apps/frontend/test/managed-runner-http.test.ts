import test from "node:test";
import assert from "node:assert/strict";
import {
  HttpReviewRunner,
  type RunnerRequest,
} from "../lib/server/managed-service/runner";
const request: RunnerRequest = {
  requestId: "review",
  owner: "owner",
  groupId: "group",
  botId: "bot",
  runGeneration: 1,
  purpose: "interval",
  deadline: Date.now() + 1000,
  snapshot: {
    observedAt: Date.now(),
    blockTimestamp: Date.now(),
    blockNumber: "1",
    blockHash: `0x${"1".repeat(64)}`,
    chainId: 42161,
    maker: "0x1111111111111111111111111111111111111111",
    nativeBalanceWei: "0",
    balances: [],
    allowances: [],
    coverage: [],
  },
};
test("runner client requires safe transport and sends authenticated request identity", async () => {
  assert.throws(
    () => new HttpReviewRunner("http://untrusted.test", "test-only"),
    /HTTPS or loopback/,
  );
  let called = false;
  const fetcher: typeof fetch = async (_url, init) => {
    called = true;
    assert.equal(
      new Headers(init?.headers).get("authorization"),
      "Bearer test-only",
    );
    assert.equal(new Headers(init?.headers).get("idempotency-key"), "review");
    assert.equal(init?.redirect, "error");
    return Response.json({
      requestId: "review",
      provider: "fixture",
      model: "fixture",
      runtimeVersion: "fixture",
      usage: { cost: null },
      result: {
        version: 1,
        decision: "hold",
        rationale: "Fixture hold.",
        evidence: [],
        expectedEffects: [],
        uncertainties: [],
      },
    });
  };
  const result = await new HttpReviewRunner(
    "http://127.0.0.1:4444",
    "test-only",
    fetcher,
  ).review(request, new AbortController().signal);
  assert.equal(result.result.decision, "hold");
  assert.equal(called, true);
});
test("runner malformed, wrong identity and private error payloads never become valid reviews", async () => {
  for (const response of [
    Response.json({ secret: "do not expose" }, { status: 500 }),
    Response.json({ requestId: "other" }),
    new Response("not JSON"),
  ]) {
    await assert.rejects(
      new HttpReviewRunner(
        "http://127.0.0.1:4444",
        "test-only",
        async () => response,
      ).review(request, new AbortController().signal),
      (error) =>
        error instanceof Error && !error.message.includes("do not expose"),
    );
  }
});
