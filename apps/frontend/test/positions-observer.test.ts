import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encodeAbiParameters,
  encodeEventTopics,
  parseAbi,
  type Log,
} from "viem";
import { decodePositionLog } from "../lib/server/positions/decode";
import { observeChain } from "../lib/server/positions/observer";
import { getPositionHistory } from "../lib/server/positions/history";
import {
  app,
  aqua,
  blockHash,
  config,
  hash,
  maker,
  position,
  repository,
  rpc,
  shipped,
  tokenA,
  tokenB,
} from "./positions-fixtures";

test("actual SDK non-indexed Shipped fixture decodes with program and chain identity", () => {
  const log = shipped();
  assert.equal(log.topics.length, 1);
  const result = decodePositionLog(log, config)!;
  assert.equal(result.kind, "Shipped");
  assert.equal(result.strategy, "0x1234");
  assert.equal(result.maker, maker);
  assert.equal(decodePositionLog({ ...log, address: maker }, config), null);
  assert.throws(() => decodePositionLog({ ...log, data: "0x" }, config));
});
test("bounded backfill deduplicates logs and covers only declared start through finality target", async () => {
  const store = repository();
  const client = rpc({
    logs: async (_addresses, from) =>
      from === 10n ? [shipped(), shipped()] : [],
  });
  const first = await observeChain(client, store, config);
  assert.equal(first.health, "backfilling");
  assert.equal(first.indexedThrough?.number, "19");
  assert.equal(first.events.length, 1);
  const next = await observeChain(client, store, config);
  assert.equal(next.health, "current");
  assert.equal(next.indexedThrough?.number, "20");
  assert.equal(next.events.length, 1);
  const repeated = await observeChain(client, store, config);
  assert.deepEqual(repeated.events, next.events);
});
test("reorg invalidates old history and restarts canonical backfill", async () => {
  const store = repository();
  await observeChain(rpc({ logs: async () => [shipped()] }), store, config);
  const changed = await observeChain(
    rpc({
      block: async (n) => ({ hash: blockHash(n, 1) }),
      logs: async () => [shipped(11n, 1)],
    }),
    store,
    config,
  );
  assert.equal(changed.events.length, 1);
  assert.equal(changed.events[0].blockNumber, "11");
  assert.equal(changed.events[0].blockHash, blockHash(11n, 1));
  assert.equal(changed.health, "backfilling");
});
test("RPC outage does not fabricate zero history or advance checkpoint; retry backfills", async () => {
  const store = repository();
  const first = await observeChain(
    rpc({ logs: async () => [shipped()] }),
    store,
    config,
  );
  const failed = await observeChain(
    rpc({
      logs: async () => {
        throw new Error("secret endpoint must not leak");
      },
    }),
    store,
    config,
  );
  assert.equal(failed.health, "unavailable");
  assert.deepEqual(failed.indexedThrough, first.indexedThrough);
  assert.equal(failed.events.length, 1);
  assert.equal(JSON.stringify(failed).includes("secret endpoint"), false);
  assert.equal((await observeChain(rpc(), store, config)).health, "current");
});
test("log hash mismatch and wrong chain cannot create successful coverage", async () => {
  const mismatched = await observeChain(
    rpc({ logs: async () => [shipped(10n, 1)] }),
    repository(),
    config,
  );
  assert.equal(mismatched.indexedThrough, null);
  assert.equal(mismatched.health, "unavailable");
  const wrong = await observeChain(
    rpc({ chainId: async () => 1 }),
    repository(),
    config,
  );
  assert.equal(wrong.health, "unavailable");
});
test("movement and fill history retain separate facts without double-counting or owner leakage", async () => {
  const abi = parseAbi([
    "event Pushed(address maker,address app,bytes32 strategyHash,address token,uint256 amount)",
    "event Swapped(bytes32 orderHash,address maker,address taker,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)",
  ]);
  const logs: Log[] = [
    shipped(),
    {
      ...shipped(),
      logIndex: 1,
      topics: [encodeEventTopics({ abi, eventName: "Pushed" })[0]],
      data: encodeAbiParameters(abi[0].inputs, [maker, app, hash, tokenA, 20n]),
    },
    {
      ...shipped(),
      address: app,
      logIndex: 2,
      topics: [encodeEventTopics({ abi, eventName: "Swapped" })[0]],
      data: encodeAbiParameters(abi[1].inputs, [
        hash,
        maker,
        aqua,
        tokenA,
        tokenB,
        20n,
        10n,
      ]),
    },
  ];
  const state = await observeChain(
    rpc({ head: async () => 12n, logs: async () => logs }),
    repository(),
    config,
  );
  const history = getPositionHistory(state, [position], maker, "g");
  assert.equal(history.positions[0].observedFills, 1);
  assert.equal(history.positions[0].resolverDiscovery, "unknown");
  assert.equal(history.activity.filter((a) => a.delta).length, 1);
  assert.equal(history.activity[1].delta?.amount, "20");
  assert.equal(history.performance.fees, null);
  assert.equal(
    getPositionHistory(state, [position], aqua, "g").activity.length,
    0,
  );
  assert.equal(getPositionHistory(null, [position], maker, "g").coverage, null);
});

test("reorg after retained-prefix check cannot commit a mixed-chain chunk", async () => {
  const store = repository();
  await observeChain(rpc({ logs: async () => [shipped()] }), store, config);
  let prefixReads = 0;
  const next = await observeChain(
    rpc({
      block: async (number) => ({
        hash: blockHash(
          number,
          number === 19n ? (prefixReads++ === 0 ? 0 : 1) : 1,
        ),
      }),
    }),
    store,
    config,
  );
  assert.equal(next.health, "unavailable");
  assert.equal(next.indexedThrough?.number, "19");
  assert.equal(next.events.length, 1);
});

test("both fill directions and docking retain exact Aqua movements", async () => {
  const abi = parseAbi([
    "event Pushed(address maker,address app,bytes32 strategyHash,address token,uint256 amount)",
    "event Pulled(address maker,address app,bytes32 strategyHash,address token,uint256 amount)",
    "event Docked(address maker,address app,bytes32 strategyHash)",
    "event Swapped(bytes32 orderHash,address maker,address taker,address tokenIn,address tokenOut,uint256 amountIn,uint256 amountOut)",
  ]);
  const eventLog = (
    index: number,
    name: "Pushed" | "Pulled" | "Docked" | "Swapped",
    data: Log["data"],
  ): Log => ({
    ...shipped(),
    logIndex: index,
    address: name === "Swapped" ? app : aqua,
    topics: [encodeEventTopics({ abi, eventName: name })[0]],
    data,
  });
  const logs = [
    shipped(),
    eventLog(
      1,
      "Pushed",
      encodeAbiParameters(abi[0].inputs, [maker, app, hash, tokenA, 20n]),
    ),
    eventLog(
      2,
      "Pulled",
      encodeAbiParameters(abi[1].inputs, [maker, app, hash, tokenB, 10n]),
    ),
    eventLog(
      3,
      "Swapped",
      encodeAbiParameters(abi[3].inputs, [
        hash,
        maker,
        aqua,
        tokenA,
        tokenB,
        20n,
        10n,
      ]),
    ),
    eventLog(
      4,
      "Pushed",
      encodeAbiParameters(abi[0].inputs, [maker, app, hash, tokenB, 5n]),
    ),
    eventLog(
      5,
      "Pulled",
      encodeAbiParameters(abi[1].inputs, [maker, app, hash, tokenA, 8n]),
    ),
    eventLog(
      6,
      "Swapped",
      encodeAbiParameters(abi[3].inputs, [
        hash,
        maker,
        aqua,
        tokenB,
        tokenA,
        5n,
        8n,
      ]),
    ),
    eventLog(
      7,
      "Docked",
      encodeAbiParameters(abi[2].inputs, [maker, app, hash]),
    ),
  ];
  const state = await observeChain(
    rpc({ head: async () => 12n, logs: async () => logs }),
    repository(),
    config,
  );
  const history = getPositionHistory(state, [position], maker, "g");
  assert.equal(history.positions[0].registration?.state, "docked");
  assert.equal(history.positions[0].observedFills, 2);
  const deltas = history.activity.flatMap((item) =>
    item.delta ? [item.delta] : [],
  );
  assert.equal(
    deltas
      .filter((item) => item.token === tokenA)
      .reduce((sum, item) => sum + BigInt(item.amount), 0n),
    12n,
  );
  assert.equal(
    deltas
      .filter((item) => item.token === tokenB)
      .reduce((sum, item) => sum + BigInt(item.amount), 0n),
    -5n,
  );
});

test("local history capacity refuses excess events without claiming complete coverage", async () => {
  const store = repository();
  const log = shipped();
  const limited = await observeChain(
    rpc({
      logs: async () =>
        Array.from({ length: 10_001 }, (_, logIndex) => ({ ...log, logIndex })),
    }),
    store,
    config,
  );
  assert.equal(limited.health, "limited");
  assert.equal(limited.error, "history_limit");
  assert.equal(limited.indexedThrough, null);
  assert.equal(limited.events.length, 0);
});
