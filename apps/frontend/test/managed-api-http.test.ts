import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { managedApi } from "../lib/server/managed-service/http";
import { walletAuth } from "../lib/server/auth";
import { ManagedStore } from "../lib/server/store";
import { lifecycleFixture } from "./lifecycle-fixtures";

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
        { ensureTokens: async () => {} },
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
