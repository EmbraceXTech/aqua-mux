import test from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { walletAuth } from "../lib/server/auth";
import { managedApi } from "../lib/server/managed-service/http";
import { ManagedStore } from "../lib/server/store";
import { reviewNotImplemented } from "../lib/server/managed-service/runner";
import { groupFixture } from "./managed-fixtures";

test("non-development managed review endpoints return 501 before local inference", async () => {
  const store = new ManagedStore(":memory:");
  const state = globalThis as typeof globalThis & {
    aquamuxManagedStore?: ManagedStore;
  };
  const environment = process.env as Record<string, string | undefined>;
  const previousStore = state.aquamuxManagedStore;
  const previousEnvironment = environment.NODE_ENV;
  const previousOrigin = environment.AQUAMUX_AUTH_ORIGIN;
  const origin = "http://127.0.0.1:3100";
  state.aquamuxManagedStore = store;
  environment.NODE_ENV = "production";
  environment.AQUAMUX_AUTH_ORIGIN = origin;
  try {
    const account = privateKeyToAccount(generatePrivateKey());
    const auth = walletAuth();
    const challenge = auth.challenge(account.address, origin, 42161);
    const session = await auth.verify(
      challenge.id,
      await account.signMessage({ message: challenge.message }),
      origin,
    );
    const group = groupFixture();
    group.owner = session.owner;
    group.maker = session.owner;
    group.config.maker = session.owner;
    store.put("group", group, session.owner);
    const response = await managedApi(
      new Request(`${origin}/api/managed/groups/${group.id}/reviews`, {
        method: "POST",
        headers: {
          Origin: origin,
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
        },
        body: "{}",
      }),
      ["groups", group.id, "reviews"],
    );
    assert.equal(response.status, 501);
    assert.deepEqual(await response.json(), {
      code: reviewNotImplemented.code,
      error: reviewNotImplemented.message,
    });
  } finally {
    state.aquamuxManagedStore = previousStore;
    if (previousEnvironment === undefined) delete environment.NODE_ENV;
    else environment.NODE_ENV = previousEnvironment;
    if (previousOrigin === undefined) delete environment.AQUAMUX_AUTH_ORIGIN;
    else environment.AQUAMUX_AUTH_ORIGIN = previousOrigin;
    store.close();
  }
});
