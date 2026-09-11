import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { ManagedStore } from "../lib/server/store";
import { WalletAuth } from "../lib/server/auth";
const origin = "http://127.0.0.1:3100";

test("wallet proof binds address/origin, is consumed once, and persists sessions over restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "aquamux-auth-"));
  const path = join(directory, "auth.sqlite");
  let store = new ManagedStore(path);
  const owner = privateKeyToAccount(generatePrivateKey());
  try {
    let auth = new WalletAuth(store, origin);
    const challenge = auth.challenge(owner.address, origin, 42161);
    const signature = await owner.signMessage({ message: challenge.message });
    await assert.rejects(
      auth.verify(challenge.id, signature, "http://evil.test"),
      /origin/,
    );
    const results = await Promise.allSettled([
      auth.verify(challenge.id, signature, origin),
      auth.verify(challenge.id, signature, origin),
    ]);
    assert.equal(results.filter((v) => v.status === "fulfilled").length, 1);
    const success = results.find((v) => v.status === "fulfilled");
    if (!success || success.status !== "fulfilled")
      throw new Error("Expected successful auth");
    const session = success.value;
    assert.equal(
      auth.authenticate(session.token, origin).owner,
      owner.address.toLowerCase(),
    );
    assert.equal(
      store.db
        .prepare("SELECT count(*) AS count FROM sessions WHERE token_hash=?")
        .get(session.token)?.count,
      0,
    );
    store.close();
    store = new ManagedStore(path);
    auth = new WalletAuth(store, origin);
    assert.equal(
      auth.authenticate(session.token, origin).sessionId,
      session.sessionId,
    );
    await assert.rejects(
      auth.verify(challenge.id, signature, origin),
      /already used/,
    );
    auth.revoke(session.token);
    assert.throws(
      () => auth.authenticate(session.token, origin),
      /unavailable/,
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("wrong wallet and expired proof/session are refused", async () => {
  const store = new ManagedStore(":memory:");
  let now = Date.now();
  try {
    const owner = privateKeyToAccount(generatePrivateKey());
    const attacker = privateKeyToAccount(generatePrivateKey());
    const auth = new WalletAuth(store, origin, () => now);
    const challenge = auth.challenge(owner.address, origin, 42161);
    await assert.rejects(
      auth.verify(
        challenge.id,
        await attacker.signMessage({ message: challenge.message }),
        origin,
      ),
      /Invalid wallet proof/,
    );
    const session = await auth.verify(
      challenge.id,
      await owner.signMessage({ message: challenge.message }),
      origin,
    );
    const expired = auth.challenge(owner.address, origin, 42161);
    now += 8 * 60 * 60_000 + 1;
    await assert.rejects(
      auth.verify(
        expired.id,
        await owner.signMessage({ message: expired.message }),
        origin,
      ),
      /expired/,
    );
    assert.throws(() => auth.authenticate(session.token, origin), /expired/);
  } finally {
    store.close();
  }
});
