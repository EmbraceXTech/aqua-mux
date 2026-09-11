import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { once } from "node:events";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { POST as challengeRoute } from "../app/api/auth/challenge/route";
import { POST as verifyRoute } from "../app/api/auth/verify/route";
import { POST as logoutRoute } from "../app/api/auth/logout/route";
import { requireOwner } from "../lib/server/auth";
import { ManagedStore } from "../lib/server/store";

/** Exercise actual route handlers through HTTP and wallet signing without browser mocks. */
test("HTTP challenge, wallet signature, authorized read, replay refusal and logout", async () => {
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
        body: incoming.method === "POST" ? Buffer.concat(chunks) : undefined,
      });
      const handler =
        incoming.url === "/api/auth/challenge"
          ? challengeRoute
          : incoming.url === "/api/auth/verify"
            ? verifyRoute
            : logoutRoute;
      const response = await handler(request);
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
    throw new Error("HTTP listener missing");
  origin = `http://127.0.0.1:${address.port}`;
  process.env.AQUAMUX_AUTH_ORIGIN = origin;
  const post = (
    path: string,
    body: unknown,
    token?: string,
    originHeader = origin,
  ) =>
    fetch(`${origin}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: originHeader,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
  try {
    const owner = privateKeyToAccount(generatePrivateKey());
    assert.equal(
      (
        await post(
          "/api/auth/challenge",
          { owner: owner.address, chainId: 42161 },
          undefined,
          "http://evil.test",
        )
      ).status,
      403,
    );
    const challengeResponse = await post("/api/auth/challenge", {
      owner: owner.address,
      chainId: 42161,
    });
    assert.equal(challengeResponse.status, 200);
    assert.equal(challengeResponse.headers.get("cache-control"), "no-store");
    const challenge = (await challengeResponse.json()) as {
      id: string;
      message: string;
    };
    const signature = await owner.signMessage({ message: challenge.message });
    const verified = await post("/api/auth/verify", {
      id: challenge.id,
      signature,
    });
    assert.equal(verified.status, 200);
    const session = (await verified.json()) as { token: string; owner: string };
    const authenticated = requireOwner(
      new Request(`${origin}/api/managed/groups`, {
        headers: { Authorization: `Bearer ${session.token}` },
      }),
    );
    assert.equal(authenticated.owner, owner.address.toLowerCase());
    assert.throws(
      () =>
        requireOwner(
          new Request(`${origin}/api/managed/groups`, {
            method: "POST",
            headers: { Authorization: `Bearer ${session.token}` },
          }),
        ),
      /origin/,
    );
    assert.equal(
      (await post("/api/auth/verify", { id: challenge.id, signature })).status,
      401,
    );
    assert.equal(
      (await post("/api/auth/logout", {}, session.token)).status,
      200,
    );
    assert.throws(
      () =>
        requireOwner(
          new Request(`${origin}/api/managed/groups`, {
            headers: { Authorization: `Bearer ${session.token}` },
          }),
        ),
      /unavailable/,
    );
  } finally {
    server.close();
    await once(server, "close");
    store.close();
    state.aquamuxManagedStore = previous;
    if (previousOrigin === undefined) delete process.env.AQUAMUX_AUTH_ORIGIN;
    else process.env.AQUAMUX_AUTH_ORIGIN = previousOrigin;
  }
});
