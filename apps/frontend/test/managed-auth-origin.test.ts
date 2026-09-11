import test from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { requireOwner, WalletAuth, AuthError } from "../lib/server/auth";
import { ManagedStore } from "../lib/server/store";

const origin = "http://127.0.0.1:33127";

test("owner authentication permits only constrained local URL aliases", async () => {
  const store = new ManagedStore(":memory:");
  const state = globalThis as typeof globalThis & {
    aquamuxManagedStore?: ManagedStore;
  };
  const previousStore = state.aquamuxManagedStore;
  const previousOrigin = process.env.AQUAMUX_AUTH_ORIGIN;
  state.aquamuxManagedStore = store;
  process.env.AQUAMUX_AUTH_ORIGIN = origin;
  try {
    const auth = new WalletAuth(store, origin);
    const owner = privateKeyToAccount(generatePrivateKey());
    const challenge = auth.challenge(owner.address, origin, 42161);
    const session = await auth.verify(
      challenge.id,
      await owner.signMessage({ message: challenge.message }),
      origin,
    );
    const request = (
      url = "http://localhost:33127/api/managed/groups",
      overrides: Record<string, string | null> = {},
      method = "POST",
    ) => {
      const headers = new Headers({
        origin,
        host: "127.0.0.1:33127",
        authorization: `Bearer ${session.token}`,
        "sec-fetch-site": "same-origin",
        "x-forwarded-host": "127.0.0.1:33127",
        "x-forwarded-port": "33127",
        "x-forwarded-proto": "http",
        "x-forwarded-for": "127.0.0.1",
      });
      for (const [name, value] of Object.entries(overrides)) {
        if (value === null) headers.delete(name);
        else headers.set(name, value);
      }
      return new Request(url, { method, headers });
    };
    for (const hostname of ["localhost", "[::1]", "127.0.0.1"]) {
      assert.equal(
        requireOwner(request(`http://${hostname}:33127/api/managed/groups`))
          .owner,
        session.owner,
      );
    }
    for (const method of ["GET", "HEAD"]) {
      assert.equal(
        requireOwner(request(undefined, { origin: null }, method)).owner,
        session.owner,
      );
      for (const site of [null, "cross-site", "same-site", "none"]) {
        assert.throws(
          () =>
            requireOwner(
              request(
                undefined,
                {
                  origin: null,
                  "sec-fetch-site": site,
                },
                method,
              ),
            ),
          (error: unknown) =>
            error instanceof AuthError && error.status === 403,
        );
      }
    }
    const refused: [string, Record<string, string | null>][] = [
      ["http://evil.test:33127/api/managed/groups", {}],
      ["http://127.0.0.2:33127/api/managed/groups", {}],
      ["http://localhost.evil.test:33127/api/managed/groups", {}],
      ["http://localhost:33128/api/managed/groups", {}],
      ["https://localhost:33127/api/managed/groups", {}],
      [
        "http://localhost:33127/api/managed/groups",
        { origin: "http://localhost:33127" },
      ],
      [
        "http://localhost:33127/api/managed/groups",
        { origin: "http://evil.test:33127" },
      ],
      ["http://localhost:33127/api/managed/groups", { origin: "null" }],
      ["http://localhost:33127/api/managed/groups", { origin: null }],
      ["http://localhost:33127/api/managed/groups", { host: null }],
      [
        "http://localhost:33127/api/managed/groups",
        { host: "localhost:33127" },
      ],
      [
        "http://localhost:33127/api/managed/groups",
        { host: "127.0.0.1:33128" },
      ],
      [
        "http://localhost:33127/api/managed/groups",
        { forwarded: "for=127.0.0.1" },
      ],
      [
        "http://localhost:33127/api/managed/groups",
        { "x-forwarded-host": "evil.test" },
      ],
      [
        "http://localhost:33127/api/managed/groups",
        { "x-forwarded-for": "203.0.113.8, 127.0.0.1" },
      ],
      [
        "http://localhost:33127/api/managed/groups",
        { "x-forwarded-proto": "https" },
      ],
      [
        "http://localhost:33127/api/managed/groups",
        { "x-forwarded-port": "33128" },
      ],
      [
        "http://localhost:33127/api/managed/groups",
        { "sec-fetch-site": "cross-site" },
      ],
    ];
    for (const [url, headers] of refused) {
      assert.throws(
        () => requireOwner(request(url, headers)),
        (error: unknown) => error instanceof AuthError && error.status === 403,
        `${url} ${JSON.stringify(headers)}`,
      );
    }
    assert.throws(
      () => requireOwner(request(undefined, { authorization: null })),
      (error: unknown) => error instanceof AuthError && error.status === 401,
    );
    process.env.AQUAMUX_AUTH_ORIGIN = "https://app.example";
    assert.throws(
      () =>
        requireOwner(
          request("https://localhost/api/managed/groups", {
            origin: "https://app.example",
            host: "app.example",
          }),
        ),
      (error: unknown) => error instanceof AuthError && error.status === 403,
    );
    process.env.AQUAMUX_AUTH_ORIGIN = origin;
    auth.revoke(session.token);
    assert.throws(() => requireOwner(request()), /unavailable/);
  } finally {
    state.aquamuxManagedStore = previousStore;
    store.close();
    if (previousOrigin === undefined) delete process.env.AQUAMUX_AUTH_ORIGIN;
    else process.env.AQUAMUX_AUTH_ORIGIN = previousOrigin;
  }
});
