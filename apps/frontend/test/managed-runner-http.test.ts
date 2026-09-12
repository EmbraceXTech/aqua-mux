import test from "node:test";
import assert from "node:assert/strict";
import {
  claudeSubscriptionEnvironment,
  reviewNotImplemented,
  reviewRunnerForEnvironment,
  type ClaudeCodeInvocation,
  type RunnerRequest,
} from "../lib/server/managed-service/runner";
import { ManagedError } from "../lib/server/managed-service/errors";

const request: RunnerRequest = {
  requestId: "review",
  owner: "0x1111111111111111111111111111111111111111",
  groupId: "group",
  botId: "bot",
  runGeneration: 1,
  purpose: "interval",
  deadline: Date.now() + 1_000,
  snapshot: {
    tokenMetadata: { chainId: 42161, tokens: [] },
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

function cliResult(result: unknown) {
  return JSON.stringify({
    type: "result",
    subtype: "success",
    is_error: false,
    duration_ms: 1,
    result: JSON.stringify(result),
  });
}

const hold = {
  version: 1,
  decision: "hold",
  rationale: "The fixture snapshot has no action to take.",
  evidence: [],
  proposedConfig: null,
  expectedEffects: [],
  uncertainties: ["The fixture has no market observations."],
  previewId: null,
};

test("development reviews call the restricted local Claude Code CLI and validate its result", async () => {
  let invocation: ClaudeCodeInvocation | undefined;
  const runner = reviewRunnerForEnvironment("development", async (input) => {
    invocation = input;
    return cliResult(hold);
  });
  const result = await runner.review(request, new AbortController().signal);
  assert.equal(result.result.decision, "hold");
  assert.equal(result.provider, "claude-code-subscription");
  assert.equal(result.usage.cost, null);
  assert.ok(invocation);
  assert.equal(invocation.args.includes("--no-session-persistence"), true);
  assert.equal(invocation.args.includes("--safe-mode"), true);
  assert.equal(invocation.args.includes("--restricted"), true);
  assert.equal(invocation.args.includes("--strict-mcp-config"), true);
  const tools = invocation.args.indexOf("--tools");
  assert.equal(invocation.args[tools + 1], "");
  const prompt = JSON.parse(invocation.input);
  assert.equal(prompt.request.requestId, request.requestId);
  assert.equal(prompt.request.snapshot.maker, request.snapshot.maker);
});

test("development review cancellation aborts the local command result", async () => {
  let started!: () => void;
  const running = new Promise<void>((resolve) => {
    started = resolve;
  });
  const runner = reviewRunnerForEnvironment(
    "development",
    async ({ signal }) => {
      started();
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        }),
      );
      return cliResult(hold);
    },
  );
  const controller = new AbortController();
  const pending = runner.review(request, controller.signal);
  await running;
  controller.abort();
  await assert.rejects(
    pending,
    (error) =>
      error instanceof ManagedError && error.code === "review_cancelled",
  );
});

test("non-development reviews return the stable not-implemented response without a local process", async () => {
  let called = false;
  const runner = reviewRunnerForEnvironment("production", async () => {
    called = true;
    return cliResult(hold);
  });
  await assert.rejects(
    runner.review(request, new AbortController().signal),
    (error) =>
      error instanceof ManagedError &&
      error.code === reviewNotImplemented.code &&
      error.message === reviewNotImplemented.message &&
      error.status === 501,
  );
  assert.equal(called, false);
});

test("Claude Code receives only subscription runtime variables and provider output stays private on failure", async () => {
  const environment = claudeSubscriptionEnvironment({
    HOME: "/home/aquamux",
    PATH: "/usr/bin",
    PRIVATE_KEY: "wallet-secret",
    ONEINCH_API_KEY: "route-secret",
    ANTHROPIC_API_KEY: "provider-secret",
    CLAUDE_CODE_OAUTH_TOKEN: "provider-secret",
  });
  assert.deepEqual(environment, { HOME: "/home/aquamux", PATH: "/usr/bin" });
  const runner = reviewRunnerForEnvironment("development", async () =>
    JSON.stringify({ privateDiagnostic: "provider-secret" }),
  );
  await assert.rejects(
    runner.review(request, new AbortController().signal),
    (error) =>
      error instanceof ManagedError &&
      error.code === "runner_failed" &&
      !error.message.includes("provider-secret"),
  );
});
