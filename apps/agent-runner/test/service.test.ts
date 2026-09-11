import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createReviewServer, validateServerToken } from "../src/service/http";
import { ReviewStore } from "../src/service/store";
import { Reviews, type ReviewLimits } from "../src/service/reviews";
import { fingerprint, parseRequest, validateResult, type ProviderReview } from "../src/service/contract";
import { requestFixture, stubReview } from "./service-fixtures";
import { lockDatabase } from "../src/service/database-lock";

async function fixture(t: test.TestContext, provider: ProviderReview = async () => stubReview(), limits: Partial<ReviewLimits> = {}) {
  const directory = await mkdtemp(join(tmpdir(), "aquamux-service-"));
  const path = join(directory, "reviews.sqlite");
  const store = new ReviewStore(path);
  const reviews = new Reviews(store, provider, limits);
  const token = randomBytes(32).toString("base64url");
  const server = createReviewServer(reviews, token);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => { server.close(); await reviews.close(); server.closeAllConnections(); await rm(directory, { recursive: true, force: true }); });
  const post = (body = requestFixture(), headers: Record<string, string> = {}) => fetch(`${url}/reviews`, {
    method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json", "idempotency-key": body.requestId, ...headers }, body: JSON.stringify(body),
  });
  return { store, reviews, token, url, post, path };
}

test("HTTP authenticates, rejects unsafe endpoints/payloads, and returns validated persisted result", async t => {
  let calls = 0;
  const f = await fixture(t, async () => { calls++; return stubReview(); });
  assert.throws(() => validateServerToken("a".repeat(64)));
  assert.equal((await f.post(undefined, { authorization: "Bearer wrong" })).status, 401);
  assert.equal((await f.post(undefined, { origin: "https://evil.invalid" })).status, 403);
  assert.equal((await f.post(undefined, { "idempotency-key": "wrong" })).status, 400);
  assert.equal((await f.post(undefined, { "content-type": "text/plain" })).status, 415);
  const auth = { authorization: `Bearer ${f.token}` };
  assert.equal((await fetch(`${f.url}/shell`, { method: "POST", headers: auth })).status, 404);
  assert.equal((await fetch(`${f.url}/reviews`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: "x".repeat(140_000) })).status, 413);
  const response = await f.post();
  assert.equal(response.status, 200);
  const value = await response.json();
  assert.equal(value.result.decision, "hold");
  assert.equal(value.usage.cost, null);
  assert.equal(f.store.get("review-1")?.status, "succeeded");
  assert.equal(calls, 1);
});

test("concurrent and completed retries dedupe, changed bodies conflict", async t => {
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(t, async () => { calls++; await gate; return stubReview(); });
  const request = requestFixture();
  const first = f.post(request);
  const duplicate = f.post(request);
  await new Promise(resolve => setTimeout(resolve, 30));
  release();
  assert.deepEqual(await (await first).json(), await (await duplicate).json());
  assert.equal((await f.post(request)).status, 200);
  assert.equal((await f.post({ ...request, runGeneration: 1 })).status, 409);
  assert.equal(calls, 1);
});

test("freshness, identity, and model policy or raw transaction mutations fail closed", async t => {
  const f = await fixture(t);
  const stale = requestFixture(); stale.snapshot.blockTimestamp = 0;
  assert.equal((await f.post(stale)).status, 422);
  const foreign = requestFixture(); foreign.snapshot.maker = "0x0000000000000000000000000000000000000099";
  assert.equal((await f.post(foreign)).status, 400);
  const request = requestFixture();
  assert.throws(() => validateResult({ ...stubReview().result, calldata: "0x1234" }, request), /invalid_review_result/);
  const config = structuredClone(request.config!); config.policy.maxActions.value++;
  assert.throws(() => validateResult({ ...stubReview().result, proposedConfig: config }, request), /model_policy_mutation/);
  assert.throws(() => parseRequest({ ...request, shell: "anything" }, request.requestId), /invalid_request/);
});

test("invalid provider output and errors persist without exposing provider diagnostics", async t => {
  const f = await fixture(t, async () => { throw new Error("sensitive-provider-diagnostic"); });
  const request = requestFixture();
  const response = await f.post(request);
  assert.equal(response.status, 502);
  assert.equal(await response.text(), '{"error":{"code":"review_failed"}}');
  assert.equal((await f.post(request)).status, 502);
  assert.equal(f.store.get(request.requestId)?.error_code, "review_failed");
});

test("cancellation aborts active inference and durable retry never restarts it", async t => {
  let aborted = false;
  const f = await fixture(t, async (_request, signal) => {
    await new Promise((_resolve, reject) => signal.addEventListener("abort", () => { aborted = true; reject(signal.reason); }, { once: true }));
    return stubReview();
  });
  const request = requestFixture();
  const pending = f.post(request);
  await new Promise(resolve => setTimeout(resolve, 30));
  const response = await fetch(`${f.url}/reviews/${request.requestId}`, { method: "DELETE", headers: { authorization: `Bearer ${f.token}` } });
  assert.equal((await response.json()).status, "cancelled");
  assert.equal((await pending).status, 409);
  assert.equal(aborted, true);
  assert.equal((await f.post(request)).status, 409);
});

test("time and concurrency limits are enforced and development quota persists", async t => {
  const f = await fixture(t, async (_request, signal) => {
    await new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }));
    return stubReview();
  }, { timeoutMs: 100, concurrency: 1, reviewsPerDay: 1 });
  const first = f.post(requestFixture("first"));
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal((await f.post(requestFixture("second"))).status, 429);
  assert.equal((await first).status, 504);
  assert.equal((await f.post(requestFixture("third"))).status, 429);
});

test("SQLite restart preserves completed usage and terminally interrupts unfinished requests", async t => {
  const directory = await mkdtemp(join(tmpdir(), "aquamux-restart-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "reviews.sqlite");
  const request = requestFixture();
  const store = new ReviewStore(path);
  store.insert(request.requestId, fingerprint(request), request);
  const completed = requestFixture("complete");
  store.insert(completed.requestId, fingerprint(completed), completed);
  store.finish(completed.requestId, "succeeded", { ...stubReview(), requestId: completed.requestId });
  store.close();
  const restarted = new ReviewStore(path);
  const reviews = new Reviews(restarted, async () => { assert.fail("Restart must not invoke inference"); });
  await assert.rejects(reviews.submit(request), /runner_restarted/);
  assert.equal((await reviews.submit(completed)).usage.cost, null);
  await reviews.close();
});

test("a second process cannot recover a database while its owner is live", async t => {
  const directory = await mkdtemp(join(tmpdir(), "aquamux-lock-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const path = join(directory, "reviews.sqlite");
  const unlock = lockDatabase(path);
  assert.throws(() => lockDatabase(path), /live owner/);
  unlock();
  lockDatabase(path)();
});
