import { test } from "node:test";
import assert from "node:assert/strict";
import {
  settlePosition,
  type PositionEvent,
} from "../lib/server/benchmark/accounting";
import {
  rankWallets,
  defaultFilters,
  type VerifiedPosition,
} from "../lib/benchmark/model";
import { BenchmarkStore } from "../lib/server/benchmark/store";
const wallet = "0x1111111111111111111111111111111111111111";
const zero = "0x0000000000000000000000000000000000000000";
const event = (
  kind: PositionEvent["kind"],
  logIndex: number,
  rest: Partial<PositionEvent> = {},
): PositionEvent => ({
  kind,
  logIndex,
  block: 1,
  transactionIndex: 0,
  transaction: "0xabc",
  ...rest,
});
const mint = [
  event("increase", 0, { liquidity: 10n }),
  event("transfer", 1, { from: zero, to: wallet }),
];
test("replays mint, burn and collect; excludes withdrawn principal with bigint precision", () => {
  const large = 2n ** 100n;
  const result = settlePosition(
    [
      ...mint,
      event("decrease", 2, { liquidity: 10n, amount0: large, amount1: 100n }),
      event("collect", 3, { amount0: large + 7n, amount1: 109n }),
    ].reverse(),
  );
  assert.equal(result.wallet, wallet);
  assert.equal(result.fees0, 7n);
  assert.equal(result.fees1, 9n);
});
test("settles partial principal collections and keeps earlier fee collections", () => {
  const result = settlePosition([
    ...mint,
    event("collect", 2, { amount0: 5n }),
    event("decrease", 3, { liquidity: 10n, amount0: 100n }),
    event("collect", 4, { amount0: 60n }),
    event("collect", 5, { amount0: 47n }),
  ]);
  assert.equal(result.fees0, 12n);
});
test("excludes transferred positions instead of attributing lifetime fees to the current owner", () => {
  assert.throws(
    () =>
      settlePosition([
        ...mint,
        event("transfer", 2, {
          from: wallet,
          to: "0x2222222222222222222222222222222222222222",
        }),
      ]),
    /Transferred/,
  );
});
test("excludes missing mint, missing history, unsettled principal and open positions", () => {
  assert.throws(
    () => settlePosition([event("collect", 1, { amount0: 5n })]),
    /Mint/,
  );
  assert.throws(
    () => settlePosition([...mint, event("decrease", 2, { liquidity: 20n })]),
    /Incomplete/,
  );
  assert.throws(
    () =>
      settlePosition([
        ...mint,
        event("decrease", 2, { liquidity: 10n, amount0: 100n }),
        event("collect", 3, { amount0: 50n }),
      ]),
    /settled/,
  );
  assert.throws(() => settlePosition(mint), /settled/);
});
test("open-position collection histories require settled principal and do not include accrued fees", () => {
  const history = [
    ...mint,
    event("decrease", 2, { liquidity: 4n, amount0: 100n }),
    event("collect", 3, { amount0: 109n }),
  ];
  const result = settlePosition(history, false);
  assert.equal(result.closed, false);
  assert.equal(result.fees0, 9n);
  assert.throws(() => settlePosition(history, true), /settled/);
  assert.throws(
    () =>
      settlePosition(
        [
          ...mint,
          event("decrease", 2, { liquidity: 4n, amount0: 100n }),
          event("collect", 3, { amount0: 90n }),
        ],
        false,
      ),
    /settled/,
  );
});
const position = (
  id: string,
  sourceId: string,
  feesUSD: number,
  owner = wallet,
): VerifiedPosition => ({
  id,
  sourceId,
  feesUSD,
  wallet: owner,
  tokenId: id,
  manager: wallet,
  pool: wallet,
  pair: "WETH / USDC",
  feesToken0: "0.01",
  feesToken1: "2",
  openedAt: 100,
  closedAt: 200,
  valuationBlock: 20,
  auditedThroughBlock: 20,
  depositUSD: 1000,
  transaction: "0xabc",
});
const data = {
  coverage: [],
  updatedAt: 1,
  positions: [
    position("1", "uniswap-v3-ethereum", 20),
    position("2", "sushiswap-v3-arbitrum", 30),
    position(
      "3",
      "uniswap-v3-base",
      15,
      "0x2222222222222222222222222222222222222222",
    ),
  ],
};
test("filters contributions before wallet aggregation across DEXes and chains", () => {
  assert.equal(rankWallets(data, defaultFilters)[0].feesUSD, 50);
  const eth = rankWallets(data, { ...defaultFilters, chain: "ethereum" });
  assert.equal(eth.length, 1);
  assert.equal(eth[0].feesUSD, 20);
  assert.equal(
    rankWallets(data, { ...defaultFilters, dex: "SushiSwap" })[0].feesUSD,
    30,
  );
  assert.equal(
    rankWallets(data, { ...defaultFilters, version: "v2" }).length,
    0,
  );
  assert.equal(rankWallets(data, { ...defaultFilters, minFees: 40 }).length, 1);
  assert.equal(
    rankWallets(data, { ...defaultFilters, search: " 0X1111 " }).length,
    1,
  );
});
test("sorts numbers, deduplicates positions, applies closure windows, and never mutates inputs", () => {
  assert.equal(
    rankWallets(data, { ...defaultFilters, direction: "asc" })[0].feesUSD,
    15,
  );
  assert.equal(
    rankWallets(
      { ...data, positions: [...data.positions, data.positions[0]] },
      defaultFilters,
    )[0].feesUSD,
    50,
  );
  assert.equal(
    rankWallets(data, { ...defaultFilters, closedDays: 7 }, 1000000).length,
    0,
  );
  assert.equal(
    rankWallets(data, { ...defaultFilters, sort: "positions" })[0].positions
      .length,
    2,
  );
  assert.equal(data.positions[0].feesUSD, 20);
});
test("unpriced fees are not fabricated as zero income and sort after priced wallets", () => {
  const unpriced = {
    ...position(
      "unpriced",
      "sushiswap-v3-ethereum",
      1,
      "0x3333333333333333333333333333333333333333",
    ),
    feesUSD: null,
  };
  const sample = { ...data, positions: [...data.positions, unpriced] };
  for (const direction of ["asc", "desc"] as const) {
    const rows = rankWallets(sample, { ...defaultFilters, direction });
    assert.equal(rows.at(-1)?.wallet, unpriced.wallet);
    assert.equal(rows.at(-1)?.unpricedPositions, 1);
  }
  assert.equal(
    rankWallets(sample, { ...defaultFilters, minFees: 1 }).length,
    2,
  );
  const mixed = rankWallets(
    { ...data, positions: [...data.positions, { ...unpriced, wallet }] },
    defaultFilters,
  )[0];
  assert.equal(mixed.feesUSD, 50);
  assert.equal(mixed.unpricedPositions, 1);
});

test("SQLite persistence is idempotent and single-writer locked", () => {
  const store = new BenchmarkStore(":memory:");
  try {
    assert.equal(store.lock(), true);
    assert.equal(store.lock(), false);
    store.unlock();
    assert.equal(store.lock(), true);
    assert.equal(store.renew(), true);
    store.saveScan("test", { block: 100, since: 1, skip: 20, days: 30 });
    assert.equal(store.scan("test")?.skip, 20);
    store.resetScan("test");
    assert.equal(store.scan("test"), undefined);
    store.position(data.positions[0]);
    store.position(data.positions[0]);
    assert.equal(store.read().positions.length, 1);
    assert.equal(store.read().coverage.length, 22);
  } finally {
    store.close();
  }
});
