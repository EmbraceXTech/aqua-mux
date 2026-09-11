import test from "node:test";
import assert from "node:assert/strict";
import { assertReviewSnapshotFresh } from "../lib/server/managed-service/freshness";
import type { WalletSnapshot } from "../lib/server/managed-service/snapshot";
import { base, quote } from "./lifecycle-fixtures";
const now = Date.now();
const snapshot: WalletSnapshot = {
  observedAt: now,
  blockTimestamp: now,
  blockNumber: "1",
  blockHash: `0x${"1".repeat(64)}`,
  chainId: 42161,
  maker: "0x1111111111111111111111111111111111111111",
  nativeBalanceWei: "0",
  balances: [],
  allowances: [],
  coverage: [
    { source: "direct-rpc-wallet", observedAt: now, status: "complete" },
  ],
  routeQuotes: [
    {
      source: "quote",
      fromToken: base,
      toToken: quote,
      amountIn: "1",
      amountOut: "2",
      observedAt: now,
      expiresAt: now + 30000,
    },
  ],
};
test("a completed proposal cannot retain expired route evidence while wallet data remains fresh", () => {
  assertReviewSnapshotFresh(snapshot, 60000, now + 29999);
  assert.throws(
    () => assertReviewSnapshotFresh(snapshot, 60000, now + 30000),
    /route quote expired/,
  );
  assert.throws(
    () =>
      assertReviewSnapshotFresh(
        { ...snapshot, routeQuotes: [] },
        60000,
        now + 60001,
      ),
    /became stale/,
  );
});
