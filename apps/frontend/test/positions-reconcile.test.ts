import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcilePositions } from "../lib/server/positions/reconcile";
import { recoverSubmittedTransactions } from "../lib/server/positions/recovery";
import { attributeGroupInventory } from "../lib/server/positions/inventory";
import { observeChain } from "../lib/server/positions/observer";
import {
  aqua,
  blockHash,
  config,
  hash,
  maker,
  position,
  repository,
  rpc,
  tokenA,
} from "./positions-fixtures";

test("siblings share wallet reads and retain independent virtual upper bounds at one block", async () => {
  let reads = 0;
  const result = await reconcilePositions(
    rpc({
      balance: async (_token, _maker, block) => {
        assert.equal(block, 22n);
        reads++;
        return 100n;
      },
    }),
    [position, { ...position, id: "sibling" }],
    aqua,
    { baselineBlock: { number: "9", hash: blockHash(9n) } },
  );
  assert.equal(reads, 2);
  assert.equal(result.health, "current");
  assert.equal(result.positions[0].registration, "active");
  assert.equal(result.positions[0].backing[0].inventoryUpperBound, "80");
});
test("docked sentinel, unregistered and unavailable remain distinct", async () => {
  assert.equal(
    (
      await reconcilePositions(
        rpc({ virtual: async () => [0n, 255] }),
        [position],
        aqua,
      )
    ).positions[0].registration,
    "docked",
  );
  assert.equal(
    (
      await reconcilePositions(
        rpc({ virtual: async () => [0n, 0] }),
        [position],
        aqua,
      )
    ).positions[0].registration,
    "unregistered",
  );
  const unavailable = await reconcilePositions(
    rpc({
      balance: async () => {
        throw new Error("offline");
      },
    }),
    [position],
    aqua,
  );
  assert.equal(unavailable.health, "partial");
  assert.equal(unavailable.positions[0].backing[0].walletBalance, null);
  assert.equal(unavailable.positions[0].backing[0].inventoryUpperBound, null);
});
test("reorg during near-submission reads discards mixed snapshot", async () => {
  let calls = 0;
  const result = await reconcilePositions(
    rpc({ block: async (n) => ({ hash: blockHash(n, calls++) }) }),
    [position],
    aqua,
  );
  assert.equal(result.health, "unavailable");
  assert.equal(result.block, null);
  assert.equal(result.positions[0].registration, "unknown");
});
test("receipt recovery distinguishes pending, outage, reorg, reverted and final success", async () => {
  const receipt = {
    status: "success" as const,
    blockNumber: 20n,
    blockHash: blockHash(20n),
    gasUsed: 5n,
    effectiveGasPrice: 3n,
  };
  assert.equal(
    (await recoverSubmittedTransactions(rpc(), [hash], 2))[0].status,
    "submitted",
  );
  assert.equal(
    (
      await recoverSubmittedTransactions(
        rpc({
          receipt: async () => {
            throw new Error("offline");
          },
        }),
        [hash],
        2,
      )
    )[0].status,
    "unknown",
  );
  assert.equal(
    (
      await recoverSubmittedTransactions(
        rpc({
          receipt: async () => ({ ...receipt, blockHash: blockHash(20n, 1) }),
        }),
        [hash],
        2,
      )
    )[0].status,
    "unknown",
  );
  assert.equal(
    (
      await recoverSubmittedTransactions(
        rpc({ receipt: async () => ({ ...receipt, status: "reverted" }) }),
        [hash],
        2,
      )
    )[0].status,
    "failed",
  );
  const confirmed = await recoverSubmittedTransactions(
    rpc({ receipt: async () => receipt }),
    [hash, hash],
    2,
  );
  assert.equal(confirmed.length, 1);
  assert.equal(confirmed[0].status, "confirmed");
  assert.equal(confirmed[0].gasCost, "15");
});
test("inventory counts shared token once and refuses unexplained or unaudited wallet use", async () => {
  const state = await observeChain(
    rpc({ head: async () => 12n }),
    repository(),
    config,
  );
  const reconciled = await reconcilePositions(
    rpc({ head: async () => 10n }),
    [position, { ...position, id: "sibling" }],
    aqua,
    { baselineBlock: { number: "9", hash: blockHash(9n) } },
  );
  const baseline = {
    chainId: 42161,
    maker,
    blockHash: blockHash(9n),
    audit: {
      chainId: 42161,
      maker,
      from: { number: "9", hash: blockHash(9n) },
      through: { number: "10", hash: blockHash(10n) },
    },
    blockNumber: "9",
    tokens: [{ token: tokenA, walletBalance: "100", allocated: "60" }],
    externalActivityCoverage: "complete" as const,
  };
  const inventory = attributeGroupInventory(
    state,
    reconciled,
    [position],
    maker,
    "g",
    baseline,
  );
  assert.equal(inventory.length, 1);
  assert.equal(inventory[0].attributableAmount, "60");
  assert.equal(
    attributeGroupInventory(state, reconciled, [position], maker, "g", {
      ...baseline,
      externalActivityCoverage: "unknown",
    })[0].attributableAmount,
    null,
  );
  assert.ok(
    attributeGroupInventory(
      state,
      reconciled,
      [position, { ...position, groupId: "other" }],
      maker,
      "g",
      baseline,
    )[0].reasons.includes("shared_with_other_group"),
  );
  const changed = {
    ...baseline,
    tokens: [{ ...baseline.tokens[0], walletBalance: "101" }],
  };
  assert.ok(
    attributeGroupInventory(
      state,
      reconciled,
      [position],
      maker,
      "g",
      changed,
    )[0].reasons.includes("unexplained_wallet_change"),
  );
});

test("inventory refuses matching block numbers from a different fork or chain", async () => {
  const state = await observeChain(
    rpc({ head: async () => 12n }),
    repository(),
    config,
  );
  const reconciled = await reconcilePositions(
    rpc({ head: async () => 10n }),
    [position],
    aqua,
    { baselineBlock: { number: "9", hash: blockHash(9n) } },
  );
  const baseline = {
    chainId: 42161,
    maker,
    blockHash: blockHash(9n),
    audit: {
      chainId: 42161,
      maker,
      from: { number: "9", hash: blockHash(9n) },
      through: { number: "10", hash: blockHash(10n) },
    },
    blockNumber: "9",
    tokens: [{ token: tokenA, walletBalance: "100", allocated: "60" }],
    externalActivityCoverage: "complete" as const,
  };
  for (const snapshot of [
    { ...reconciled, block: { number: "10", hash: blockHash(10n, 1) } },
    { ...reconciled, chainId: 56 },
  ]) {
    assert.equal(
      attributeGroupInventory(
        state,
        snapshot,
        [position],
        maker,
        "g",
        baseline,
      )[0].attributableAmount,
      null,
    );
  }
  assert.equal(
    attributeGroupInventory(state, reconciled, [position], maker, "g", {
      ...baseline,
      blockNumber: "11",
    })[0].attributableAmount,
    null,
  );
});

test("accounting can reconcile the finalized cursor while submission reads stay at head", async () => {
  const client = rpc({ head: async () => 12n });
  const state = await observeChain(client, repository(), config);
  const finalized = await reconcilePositions(client, [position], aqua, {
    atBlock: state.indexedThrough!,
    baselineBlock: { number: "9", hash: blockHash(9n) },
  });
  assert.equal(finalized.block?.number, "10");
  assert.equal(
    (await reconcilePositions(client, [position], aqua)).block?.number,
    "12",
  );
  const baseline = {
    chainId: 42161,
    maker,
    blockHash: blockHash(9n),
    audit: {
      chainId: 42161,
      maker,
      from: { number: "9", hash: blockHash(9n) },
      through: { number: "10", hash: blockHash(10n) },
    },
    blockNumber: "9",
    tokens: [{ token: tokenA, walletBalance: "100", allocated: "60" }],
    externalActivityCoverage: "complete" as const,
  };
  assert.equal(
    attributeGroupInventory(
      state,
      finalized,
      [position],
      maker,
      "g",
      baseline,
    )[0].attributableAmount,
    "60",
  );
  const orphan = await reconcilePositions(client, [position], aqua, {
    atBlock: { number: "10", hash: blockHash(10n, 1) },
  });
  assert.equal(orphan.health, "unavailable");
  assert.equal(orphan.block, null);
});

test("baseline and transfer audit must cover the same maker, chain and canonical interval", async () => {
  const client = rpc({ head: async () => 12n });
  const state = await observeChain(client, repository(), config);
  const from = { number: "9", hash: blockHash(9n) };
  const through = state.indexedThrough!;
  const snapshot = await reconcilePositions(client, [position], aqua, {
    atBlock: through,
    baselineBlock: from,
  });
  const baseline = {
    chainId: 42161,
    maker,
    blockNumber: "9",
    blockHash: from.hash,
    tokens: [{ token: tokenA, walletBalance: "100", allocated: "60" }],
    externalActivityCoverage: "complete" as const,
    audit: { chainId: 42161, maker, from, through },
  };
  assert.equal(
    attributeGroupInventory(
      state,
      snapshot,
      [position],
      maker,
      "g",
      baseline,
    )[0].attributableAmount,
    "60",
  );
  for (const invalid of [
    { ...baseline, chainId: 56 },
    { ...baseline, maker: aqua },
    { ...baseline, blockHash: blockHash(9n, 1) },
    { ...baseline, audit: undefined },
    { ...baseline, audit: { ...baseline.audit, through: from } },
    { ...baseline, audit: { ...baseline.audit, maker: aqua } },
  ]) {
    assert.equal(
      attributeGroupInventory(
        state,
        snapshot,
        [position],
        maker,
        "g",
        invalid,
      )[0].attributableAmount,
      null,
    );
  }
  assert.equal(
    (
      await reconcilePositions(client, [position], aqua, {
        atBlock: through,
        baselineBlock: { number: "9", hash: blockHash(9n, 1) },
      })
    ).health,
    "unavailable",
  );
});
