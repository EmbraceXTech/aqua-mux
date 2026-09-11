import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { ManagedStore } from "../lib/server/store";
import { groupFixture, ownerA, ownerB } from "./managed-fixtures";

function database() {
  const directory = mkdtempSync(join(tmpdir(), "aquamux-store-"));
  return {
    path: join(directory, "managed.sqlite"),
    cleanup: () => rmSync(directory, { recursive: true, force: true }),
  };
}
test("migration and records survive process-style close/reopen with exact integers", () => {
  const fixture = database();
  let store = new ManagedStore(fixture.path);
  try {
    const group = groupFixture();
    group.inventory = [
      {
        token: group.config.pairs[0].baseToken,
        amount: "9007199254740993000000001",
      },
    ];
    store.put("group", group, ownerA);
    store.close();
    store = new ManagedStore(fixture.path);
    assert.deepEqual(store.get("group", group.id, ownerA), group);
    assert.equal(store.revision("group", group.id, ownerA), 1);
    assert.equal(store.history(ownerA).length, 1);
    assert.equal(
      store.db.prepare("PRAGMA user_version").get()?.user_version,
      1,
    );
  } finally {
    store.close();
    fixture.cleanup();
  }
});
test("owner isolation covers reads, overwrites, child records and history", () => {
  const store = new ManagedStore(":memory:");
  try {
    store.put("group", groupFixture(), ownerA);
    assert.equal(store.get("group", "group-1", ownerB), null);
    assert.deepEqual(store.list("group", ownerB), []);
    assert.deepEqual(store.history(ownerB, "group-1"), []);
    assert.throws(
      () => store.put("group", { ...groupFixture(), owner: ownerB }, ownerB),
      /not found/,
    );
    assert.throws(
      () =>
        store.put(
          "bot",
          {
            id: "bot-1",
            owner: ownerB,
            groupId: "group-1",
            mode: "manual",
            state: "idle",
            intervalMs: 60000,
            nextDueAt: 1,
            runGeneration: 0,
            policyId: "policy-1",
            stopReason: null,
            lease: null,
          },
          ownerB,
        ),
      /not found/,
    );
    assert.throws(
      () => store.put("group", groupFixture("another"), ownerA),
      /already owns/,
    );
  } finally {
    store.close();
  }
});
test("idempotency binds content, revisions prevent lost updates and transactions rollback events", () => {
  const store = new ManagedStore(":memory:");
  try {
    const group = groupFixture();
    store.put("group", group, ownerA, {
      idempotencyKey: "create-1",
      expectedRevision: 0,
    });
    store.put("group", group, ownerA, {
      idempotencyKey: "create-1",
      expectedRevision: 0,
    });
    assert.equal(store.history(ownerA).length, 1);
    assert.throws(
      () =>
        store.put("group", { ...group, state: "paused" }, ownerA, {
          idempotencyKey: "create-1",
        }),
      /different request/,
    );
    assert.throws(
      () => store.put("group", group, ownerA, { expectedRevision: 0 }),
      /revision/,
    );
    assert.throws(
      () =>
        store.transaction(() => {
          store.put("group", { ...group, state: "paused" }, ownerA);
          throw new Error("rollback");
        }),
      /rollback/,
    );
    assert.equal(store.get("group", group.id, ownerA)?.state, "draft");
    assert.equal(store.history(ownerA).length, 1);
    assert.throws(
      () => store.transaction(() => Promise.resolve(1)),
      /synchronous/,
    );
  } finally {
    store.close();
  }
});
test("document compare-and-swap is durable, isolated, and atomic with records", () => {
  const store = new ManagedStore(":memory:");
  try {
    store.putDocument(
      "observer",
      "chain-1",
      ownerA,
      { cursor: "100", events: [] },
      0,
    );
    assert.equal(store.getDocument("observer", "chain-1", ownerB), null);
    assert.throws(
      () =>
        store.putDocument("observer", "chain-1", ownerA, { cursor: "101" }, 0),
      /revision/,
    );
    assert.throws(() =>
      store.transaction(() => {
        store.putDocument("observer", "chain-1", ownerA, { cursor: "101" }, 1);
        throw new Error("rollback");
      }),
    );
    assert.equal(
      store.getDocument<{ cursor: string }>("observer", "chain-1", ownerA)?.data
        .cursor,
      "100",
    );
  } finally {
    store.close();
  }
});
test("ambiguous submission blocks other workers across restart and uses fencing", () => {
  const fixture = database();
  let store = new ManagedStore(fixture.path);
  try {
    store.put("group", groupFixture(), ownerA);
    const lock = store.acquireExecutionLock(
      42161,
      ownerA,
      ownerA,
      "attempt-1",
      60000,
    );
    store.markExecutionUnresolved(lock);
    store.close();
    store = new ManagedStore(fixture.path);
    assert.throws(
      () =>
        store.acquireExecutionLock(42161, ownerA, ownerA, "attempt-2", 60000),
      /unresolved/,
    );
    store.releaseExecutionLock(lock);
    const next = store.acquireExecutionLock(
      42161,
      ownerA,
      ownerA,
      "attempt-2",
      60000,
    );
    assert.ok(next.fence > lock.fence);
    assert.throws(() => store.releaseExecutionLock(lock), /fence/);
    assert.throws(
      () =>
        store.acquireExecutionLock(42161, ownerA, ownerB, "attacker", 60000),
      /not found/,
    );
  } finally {
    store.close();
    fixture.cleanup();
  }
});
test("exports omit raw execution data and private internal documents", () => {
  const store = new ManagedStore(":memory:");
  try {
    store.put("group", groupFixture(), ownerA);
    store.putDocument("secrets", "private", ownerA, {
      privateKey: "private-fixture",
      rawTransaction: "signed-fixture",
    });
    const exported = JSON.stringify(store.exportOwner(ownerA));
    assert.ok(exported.includes("group-1"));
    assert.equal(exported.includes("private-fixture"), false);
    assert.equal(exported.includes("signed-fixture"), false);
    assert.equal(
      JSON.stringify(store.exportOwner(ownerB)).includes("group-1"),
      false,
    );
  } finally {
    store.close();
  }
});
test("future database versions are refused without mutation", () => {
  const fixture = database();
  try {
    const db = new DatabaseSync(fixture.path);
    db.exec("PRAGMA user_version=99");
    db.close();
    assert.throws(() => new ManagedStore(fixture.path), /newer/);
    const db2 = new DatabaseSync(fixture.path);
    assert.equal(db2.prepare("PRAGMA user_version").get()?.user_version, 99);
    db2.close();
  } finally {
    fixture.cleanup();
  }
});
