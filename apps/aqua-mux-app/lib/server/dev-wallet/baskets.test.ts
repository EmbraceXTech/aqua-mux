import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { encodeFunctionData, parseAbi, type Hex } from "viem";
import { AQUA, SWAP_VM } from "../../config";
import type { Plan } from "../../model";
import { ManagedStore } from "../store";
import { DevBasketService } from "./baskets";

const session = {
  owner: "0x0000000000000000000000000000000000000001" as const,
  sessionId: "fixture-session",
};
const hash = `0x${"12".repeat(32)}` as Hex;
const fixture = (): Plan => ({
  account: session.owner,
  chainId: 56,
  mode: "liquidity",
  createdAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  calls: [
    {
      to: AQUA,
      value: "0x0",
      label: "Fixture dock",
      data: encodeFunctionData({
        abi: parseAbi([
          "function dock(address app,bytes32 strategyHash,address[] tokens)",
        ]),
        functionName: "dock",
        args: [SWAP_VM, `0x${"00".repeat(32)}`, []],
      }),
    },
  ],
  strategies: [],
  summary: [],
});

test("preparation reports a safe balance refusal without exposing transport details", async () => {
  const store = new ManagedStore(":memory:");
  try {
    const insufficient = new DevBasketService(store, async () => {
      throw new Error("Insufficient USDC balance.");
    });
    await assert.rejects(
      () => insufficient.prepare(session, {}),
      /Insufficient USDC balance/,
    );
    const unavailable = new DevBasketService(store, async () => {
      throw new Error("https://rpc.example/private-credential");
    });
    await assert.rejects(
      () => unavailable.prepare(session, {}),
      /Local wallet plan could not be prepared/,
    );
  } finally {
    store.close();
  }
});

test("durable review binding, shared nonce lock and ambiguous submission survive restart", async () => {
  const directory = mkdtempSync(join(tmpdir(), "aquamux-dev-wallet-"));
  const path = join(directory, "test.sqlite");
  let store = new ManagedStore(path);
  let broadcasts = 0;
  let receipt: "pending" | "confirmed" | "reverted" | "unknown" = "pending";
  const createService = () =>
    new DevBasketService(
      store,
      async () => fixture(),
      async (_plan, assertCurrent) => {
        await assertCurrent();
        return {
          hash,
          nonce: 7,
          broadcast: async (beforeSend) => {
            await assertCurrent();
            beforeSend?.();
            const journal = store.listDocuments<{ transactionHash: string }>(
              "dev-wallet-operation",
              session.owner,
            );
            assert.equal(
              journal[0].data.transactionHash,
              hash,
              "hash persisted before network side effect",
            );
            broadcasts++;
            throw new Error(
              "Ambiguous RPC response containing a secret must not reach callers",
            );
          },
        };
      },
      async () => receipt,
      () => 1000000000000000n,
    );
  try {
    let service = createService();
    const review = await service.prepare(session, {});
    await assert.rejects(
      () => service.execute(session, review.id, "00".repeat(32), () => {}),
      /changed/,
    );
    await assert.rejects(
      () =>
        service.execute(
          { ...session, sessionId: "other-session" },
          review.id,
          review.digest,
          () => {},
        ),
      /changed/,
    );
    await assert.rejects(
      () =>
        service.execute(
          { ...session, owner: AQUA },
          review.id,
          review.digest,
          () => {},
        ),
      /unavailable/,
    );
    const result = await service.execute(
      session,
      review.id,
      review.digest,
      () => {},
    );
    assert.deepEqual(result, {
      id: review.id,
      state: "unknown",
      transactionHash: hash,
    });
    assert.equal(broadcasts, 1);
    assert.deepEqual(
      await service.execute(session, review.id, review.digest, () => {}),
      result,
    );
    assert.equal(broadcasts, 1);
    const second = await service.prepare(session, {});
    await assert.rejects(
      () => service.execute(session, second.id, second.digest, () => {}),
      /active or unresolved/,
    );
    store.close();
    store = new ManagedStore(path);
    service = createService();
    assert.equal((await service.status(session, review.id)).state, "unknown");
    await assert.rejects(
      () => service.execute(session, second.id, second.digest, () => {}),
      /active or unresolved/,
    );
    receipt = "confirmed";
    assert.equal((await service.status(session, review.id)).state, "confirmed");
    const lock = store.acquireExecutionLock(
      56,
      session.owner,
      session.owner,
      "next-operation",
      1000,
    );
    store.releaseExecutionLock(lock);
    assert.equal(broadcasts, 1);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a revoked session before signing releases only a definitely unsent attempt", async () => {
  const store = new ManagedStore(":memory:");
  let signed = false;
  const service = new DevBasketService(
    store,
    async () => fixture(),
    async (_plan, assertCurrent) => {
      await assertCurrent();
      signed = true;
      return { hash, nonce: 1, broadcast: async () => hash };
    },
    undefined,
    () => 1000000000000000n,
  );
  try {
    const review = await service.prepare(session, {});
    await assert.rejects(
      () =>
        service.execute(session, review.id, review.digest, () => {
          throw new Error("Session revoked");
        }),
      /revoked/,
    );
    assert.equal(signed, false);
    const lock = store.acquireExecutionLock(
      56,
      session.owner,
      session.owner,
      "next-operation",
      1000,
    );
    store.releaseExecutionLock(lock);
  } finally {
    store.close();
  }
});

test("a final guard refusal after signing creates no impossible transaction hash lock", async () => {
  const store = new ManagedStore(":memory:");
  const service = new DevBasketService(
    store,
    async () => fixture(),
    async () => ({
      hash,
      nonce: 1,
      broadcast: async () => {
        throw new Error("Final guard refused before journal callback");
      },
    }),
    undefined,
    () => 1000000000000000n,
  );
  try {
    const review = await service.prepare(session, {});
    await assert.rejects(
      () => service.execute(session, review.id, review.digest, () => {}),
      /Final guard/,
    );
    const result = await service.status(session, review.id);
    assert.equal(result.transactionHash, undefined);
    const lock = store.acquireExecutionLock(
      56,
      session.owner,
      session.owner,
      "next-operation",
      1000,
    );
    store.releaseExecutionLock(lock);
  } finally {
    store.close();
  }
});
