import assert from "node:assert/strict";
import { test } from "node:test";
import { requireOwner } from "../auth";
import { ManagedStore } from "../store";
import { developmentWalletAvailability } from "./config";
import { handleDevWallet } from "./http";
import { requireDevSession } from "./session";

test("connect proves core ownership without exposing a key or signature; request schema and disconnect revoke access", async () => {
  const original = { ...process.env };
  const globalStore = globalThis as typeof globalThis & {
    aquamuxManagedStore?: ManagedStore;
  };
  const previousStore = globalStore.aquamuxManagedStore;
  const store = new ManagedStore(":memory:");
  globalStore.aquamuxManagedStore = store;
  const origin = "http://127.0.0.1:3100";
  const request = (action: string, body: unknown, token?: string, extra = {}) =>
    new Request(`${origin}/api/dev-wallet/${action}`, {
      method: "POST",
      headers: {
        host: "127.0.0.1:3100",
        origin,
        "content-type": "application/json",
        "x-aquamux-dev-wallet": "manual",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...extra,
      },
      body: JSON.stringify(body),
    });
  try {
    Object.assign(process.env, {
      NODE_ENV: "development",
      AQUAMUX_DEV_WALLET_ORIGIN: origin,
      AQUAMUX_AUTH_ORIGIN: origin,
      AQUAMUX_DEV_WALLET_MAX_FEE_WEI: "1000000000000000",
      PRIVATE_KEY: "01".repeat(32),
    });
    const connected = await handleDevWallet(request("connect", {}), "connect");
    assert.equal(connected.status, 200);
    assert.equal(connected.headers.get("cache-control"), "no-store");
    const payload = await connected.json();
    assert.equal(payload.mode, "local-development");
    assert.match(payload.label, /real mainnet/);
    assert.equal(payload.networks.length, 4);
    assert.ok(!JSON.stringify(payload).includes(process.env.PRIVATE_KEY!));
    assert.ok(!("signature" in payload));
    assert.deepEqual(developmentWalletAvailability(), { available: true });
    delete process.env.PRIVATE_KEY;
    assert.deepEqual(developmentWalletAvailability(), {
      available: false,
      error:
        "Configure a valid server-only PRIVATE_KEY for the local development wallet.",
    });
    process.env.PRIVATE_KEY = "01".repeat(32);
    const authorized = request("status", { id: "missing" }, payload.token);
    assert.equal(requireOwner(authorized).owner, payload.account.toLowerCase());
    assert.equal(
      requireDevSession(authorized).owner,
      payload.account.toLowerCase(),
    );
    assert.equal(
      (
        await handleDevWallet(
          request(
            "execute",
            { id: "missing", digest: "00".repeat(32), confirmed: false },
            payload.token,
          ),
          "execute",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await handleDevWallet(
          request(
            "execute",
            {
              id: "missing",
              digest: "00".repeat(32),
              confirmed: true,
              calls: [],
            },
            payload.token,
          ),
          "execute",
        )
      ).status,
      400,
    );
    assert.equal(
      (await handleDevWallet(request("status", { id: "missing" }), "status"))
        .status,
      401,
    );
    assert.equal(
      (
        await handleDevWallet(
          request("connect", {}, undefined, {
            origin: "https://attacker.example",
          }),
          "connect",
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await handleDevWallet(
          request("disconnect", {}, payload.token),
          "disconnect",
        )
      ).status,
      200,
    );
    assert.throws(() => requireOwner(authorized), /expired or unavailable/);
    assert.throws(
      () => requireDevSession(authorized),
      /expired or unavailable/,
    );
    Object.assign(process.env, { NODE_ENV: "production" });
    const disabled = await handleDevWallet(request("connect", {}), "connect");
    assert.equal(disabled.status, 400);
    assert.deepEqual(await disabled.json(), {
      error: "Local development wallet is disabled outside development.",
    });
  } finally {
    process.env = original;
    globalStore.aquamuxManagedStore = previousStore;
    store.close();
  }
});
