import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { managedApi } from "../lib/server/managed-service/http";
import { walletAuth } from "../lib/server/auth";
import { ManagedStore } from "../lib/server/store";
import { lifecycleFixture, dependenciesFixture } from "./lifecycle-fixtures";
import { buildLifecyclePlan } from "../lib/server/lifecycle";
import { planDigest } from "../lib/managed";

test("authenticated managed HTTP creates a group, fences two tabs, stops and isolates owners", async () => {
  const store = new ManagedStore(":memory:");
  const state = globalThis as typeof globalThis & {
    aquamuxManagedStore?: ManagedStore;
  };
  const previous = state.aquamuxManagedStore;
  state.aquamuxManagedStore = store;
  const previousOrigin = process.env.AQUAMUX_AUTH_ORIGIN;
  let origin = "";
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const request = new Request(`${origin}${incoming.url}`, {
        method: incoming.method,
        headers: incoming.headers as Record<string, string>,
        ...(["POST", "PATCH"].includes(incoming.method ?? "")
          ? { body: Buffer.concat(chunks) }
          : {}),
      });
      const response = await managedApi(
        request,
        incoming.url!.replace("/api/managed/", "").split("/"),
        {
          ensureTokens: async (chainId) => ({
            chainId,
            tokens: [
              lifecycleFixture().config.pairs[0].baseToken,
              lifecycleFixture().config.pairs[0].quoteToken,
            ],
          }),
        },
      );
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(await response.text());
    } catch {
      outgoing.writeHead(500);
      outgoing.end("Request failed");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing listener");
  origin = `http://127.0.0.1:${address.port}`;
  process.env.AQUAMUX_AUTH_ORIGIN = origin;
  const send = (
    path: string,
    method = "GET",
    value?: unknown,
    token?: string,
    requestOrigin = origin,
  ) =>
    fetch(`${origin}/api/managed/${path}`, {
      method,
      headers: {
        Origin: requestOrigin,
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    });
  try {
    assert.equal((await send("groups")).status, 401);
    const account = privateKeyToAccount(generatePrivateKey()),
      auth = walletAuth();
    const challenge = auth.challenge(account.address, origin, 42161);
    const session = await auth.verify(
      challenge.id,
      await account.signMessage({ message: challenge.message }),
      origin,
    );
    const config = lifecycleFixture().config;
    config.maker = session.owner;
    const response = await send("groups", "POST", { config }, session.token);
    assert.equal(response.status, 200);
    assert.equal(
      (await send("groups", "POST", { config }, session.token)).status,
      409,
    );
    const created = await response.json();
    const path = `groups/${created.group.id}`;
    const generated = await buildLifecyclePlan(
      {
        ...lifecycleFixture(),
        config,
        owner: session.owner,
        groupId: created.group.id,
        runGeneration: created.bot.runGeneration,
      },
      dependenciesFixture(),
    );
    const plan = {
      ...generated,
      createdAt: Date.now(),
      expiresAt: Date.now() + 60_000,
    };
    store.put("plan", plan, session.owner);
    store.putDocument("plan-context", plan.id, session.owner, {
      requiresLease: false,
      sessionId: null,
      generation: created.bot.runGeneration,
      reviewId: null,
    });
    assert.equal(
      (
        await send(
          `${path}/plans/${plan.id}/confirm`,
          "POST",
          {
            digest: planDigest(plan),
          },
          session.token,
        )
      ).status,
      200,
    );
    const attemptResponse = await send(
      `${path}/attempts`,
      "POST",
      { planId: plan.id, idempotencyKey: "external-attempt" },
      session.token,
    );
    assert.equal(attemptResponse.status, 409);
    assert.equal(
      (await attemptResponse.json()).code,
      "external_execution_unverified",
    );
    assert.equal(store.list("transaction", session.owner).length, 0);
    const forged = await send(
      `${path}/attempts`,
      "POST",
      {
        planId: plan.id,
        idempotencyKey: "forged-capability",
        executionCapabilities: {
          external: { verified: true, adapter: "forged" },
        },
      },
      session.token,
    );
    assert.equal((await forged.json()).code, "external_execution_unverified");
    const lock = store.acquireExecutionLock(
      42161,
      session.owner,
      session.owner,
      "refusal-left-no-lock",
      1000,
    );
    store.releaseExecutionLock(lock);
    const catalog = await (await send("catalog")).json();
    assert.equal(catalog.executionCapabilities.external.verified, false);
    assert.equal(catalog.executionCapabilities.external.adapter, "none");
    assert.equal(catalog.capabilities.manualExternal.enabled, false);
    const initialDetail = await (
      await send(path, "GET", undefined, session.token)
    ).json();
    assert.deepEqual(
      initialDetail.executionCapabilities,
      catalog.executionCapabilities,
    );
    const firstResponse = await send(
      `${path}/bot`,
      "POST",
      { action: "start", sessionId: "tab-a" },
      session.token,
    );
    assert.equal(firstResponse.status, 200);
    const first = await firstResponse.json();
    assert.equal(
      (
        await send(
          `${path}/bot`,
          "POST",
          { action: "start", sessionId: "tab-b" },
          session.token,
        )
      ).status,
      409,
    );
    const takeover = await send(
      `${path}/bot`,
      "POST",
      { action: "takeover", sessionId: "tab-b" },
      session.token,
    );
    assert.equal(takeover.status, 200);
    assert.equal(
      (
        await send(
          `${path}/bot`,
          "POST",
          {
            action: "heartbeat",
            sessionId: "tab-a",
            generation: first.bot.runGeneration,
          },
          session.token,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await send(
          `${path}/bot`,
          "POST",
          { action: "stop", sessionId: "tab-b" },
          session.token,
          "http://other.test",
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await send(
          `${path}/bot`,
          "POST",
          { action: "stop", sessionId: "tab-b" },
          session.token,
        )
      ).status,
      200,
    );
    const detail = await (
      await send(path, "GET", undefined, session.token)
    ).json();
    assert.equal(detail.bot.state, "stopped");
    assert.match(detail.bot.stopReason, /Passive positions remain open/);
    const second = privateKeyToAccount(generatePrivateKey()),
      secondChallenge = auth.challenge(second.address, origin, 42161);
    const secondSession = await auth.verify(
      secondChallenge.id,
      await second.signMessage({ message: secondChallenge.message }),
      origin,
    );
    assert.equal(
      (await send(path, "GET", undefined, secondSession.token)).status,
      404,
    );
    const list = await (
      await send("groups", "GET", undefined, secondSession.token)
    ).json();
    assert.equal(list.groups.length, 0);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
    state.aquamuxManagedStore = previous;
    if (previousOrigin === undefined) delete process.env.AQUAMUX_AUTH_ORIGIN;
    else process.env.AQUAMUX_AUTH_ORIGIN = previousOrigin;
    store.close();
  }
});
