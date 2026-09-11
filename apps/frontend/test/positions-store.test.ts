import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { ManagedStore } from "../lib/server/store";
import { createObservationRepository } from "../lib/server/positions/store";
import { observationKey, observeChain } from "../lib/server/positions/observer";
import { aqua, config, maker, rpc, shipped } from "./positions-fixtures";

test("common SQLite persists checkpoints across reopen and isolates authenticated owner", async () => {
  const directory = mkdtempSync(join(tmpdir(), "aquamux-observer-"));
  let store = new ManagedStore(join(directory, "store.sqlite"));
  try {
    await observeChain(
      rpc({ logs: async () => [shipped()] }),
      createObservationRepository(store, maker),
      config,
    );
    store.close();
    store = new ManagedStore(join(directory, "store.sqlite"));
    const repository = createObservationRepository(store, maker);
    const saved = repository.read(observationKey(config))!;
    assert.equal(saved.value.events.length, 1);
    assert.equal(saved.value.indexedThrough?.number, "19");
    assert.equal(
      createObservationRepository(store, aqua).read(observationKey(config)),
      null,
    );
    const completed = await observeChain(rpc(), repository, config);
    assert.equal(completed.health, "current");
    assert.throws(
      () =>
        repository.write(observationKey(config), saved.revision, saved.value),
      /revision changed/,
    );
    assert.equal(
      repository.read(observationKey(config))?.value.indexedThrough?.number,
      "20",
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
