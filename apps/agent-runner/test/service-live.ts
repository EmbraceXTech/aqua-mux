import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { requestFixture } from "./service-fixtures";
import { reviewResultSchema } from "../src/service/contract";

// Opt-in executable HTTP proof. Inputs are labelled fixtures; inference is real.
const provider = process.argv[2] ?? "codex";
if (!["codex", "claude"].includes(provider))
  throw new Error("Use codex or claude");
const directory = resolve(".runtime", `service-live-${provider}-${Date.now()}`);
await mkdir(directory, { recursive: true, mode: 0o700 });
const database = resolve(directory, "reviews.sqlite");
const token = randomBytes(32).toString("base64url");
const port = await freePort();
const url = `http://127.0.0.1:${port}`;
const env = Object.fromEntries(
  [
    "PATH",
    "HOME",
    "USER",
    "CODEX_HOME",
    "DOCKER_HOST",
    "DOCKER_CONTEXT",
    "TMPDIR",
  ]
    .filter((k) => process.env[k])
    .map((k) => [k, process.env[k]]),
);
Object.assign(env, {
  AQUAMUX_AGENT_RUNNER_TOKEN: token,
  AQUAMUX_AGENT_RUNNER_PROVIDER: provider,
  AQUAMUX_AGENT_RUNNER_DATABASE: database,
  AQUAMUX_AGENT_RUNNER_PORT: String(port),
});
let child: ChildProcess | undefined;
const evidence: Record<string, unknown> = {
  provider,
  startedAt: new Date().toISOString(),
  input: "synthetic wallet snapshot with explicitly missing market data",
  checks: {},
};
const checks = evidence.checks as Record<string, unknown>;
const post = (body: ReturnType<typeof requestFixture>) =>
  fetch(`${url}/reviews`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "idempotency-key": body.requestId,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(155_000),
  });

try {
  child = await start();
  assert.equal((await fetch(`${url}/reviews`, { method: "POST" })).status, 401);
  checks.authentication = true;
  const request = requestFixture("real-review");
  request.config!.policy.maxReferenceAgeMs.value = 120_000;
  request.config!.policy.allowedActions.value = ["hold"];
  const before = Date.now();
  const response = await post(request);
  const body = await response.json();
  if (response.status !== 200)
    throw new Error(`HTTP_${response.status}_${body.error?.code ?? "unknown"}`);
  const result = reviewResultSchema.parse(body.result);
  assert.equal(result.decision, "hold");
  assert.equal(body.provider, provider);
  checks.realReview = {
    passed: true,
    elapsedMs: Date.now() - before,
    decision: result.decision,
    usage: body.usage,
    model: body.model,
    runtimeVersion: body.runtimeVersion,
  };
  assert.deepEqual(await (await post(request)).json(), body);
  checks.dedupe = true;
  await stop(child);
  child = await start();
  assert.deepEqual(await (await post(request)).json(), body);
  checks.completedRestartRecovery = true;

  const cancellation = requestFixture("real-cancel");
  const pending = post(cancellation);
  await waitResource();
  const cancel = await fetch(`${url}/reviews/real-cancel`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal((await cancel.json()).status, "cancelled");
  assert.equal((await pending).status, 409);
  assert.equal((await post(cancellation)).status, 409);
  assert.equal(resourceCount(), 0);
  checks.cancelAndRetire = true;

  const interrupted = requestFixture("real-interrupted");
  const disconnected = post(interrupted).catch(() => null);
  await waitResource();
  await stop(child, "SIGKILL");
  child = undefined;
  await disconnected;
  child = await start();
  const recovered = await post(interrupted);
  assert.equal(recovered.status, 503);
  assert.equal((await recovered.json()).error.code, "runner_restarted");
  assert.equal(resourceCount(), 0);
  checks.interruptedRestartAndContainerCleanup = true;
  evidence.passed = true;
} catch (error) {
  evidence.passed = false;
  // Only allow our own fixed HTTP failure code through; never provider or assertion text.
  evidence.failure =
    error instanceof Error && /^HTTP_\d+_[a-z_]+$/.test(error.message)
      ? error.message
      : "live_service_check_failed";
  process.exitCode = 1;
} finally {
  if (child) await stop(child);
  await writeFile(
    resolve(directory, "evidence.json"),
    JSON.stringify(evidence, null, 2),
    { mode: 0o600 },
  );
  console.log(JSON.stringify(evidence));
}

async function start(): Promise<ChildProcess> {
  const proc = spawn(
    process.execPath,
    ["--import", "tsx", "src/service/main.ts"],
    { env, stdio: ["ignore", "pipe", "pipe"] },
  );
  proc.stderr!.resume();
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("startup_timeout"));
    }, 25_000);
    proc.once("exit", () => {
      clearTimeout(timeout);
      reject(new Error("startup_failed"));
    });
    proc.stdout!.on("data", (chunk) => {
      if (String(chunk).includes('"event":"review_service_listening"')) {
        clearTimeout(timeout);
        resolve();
      }
    });
  });
  return proc;
}

async function stop(
  proc: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
): Promise<void> {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => proc.kill("SIGKILL"), 20_000);
    proc.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    proc.kill(signal);
  });
}

function resourceCount(): number {
  const db = new DatabaseSync(database, { readOnly: true });
  try {
    return Number(
      db.prepare("SELECT COUNT(*) AS count FROM review_resources").get()!.count,
    );
  } finally {
    db.close();
  }
}
async function waitResource(): Promise<void> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    if (resourceCount()) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("resource_not_started");
}
async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}
