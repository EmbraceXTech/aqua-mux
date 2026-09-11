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
  );
  const baseline = {
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
