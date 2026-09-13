import assert from "node:assert/strict";
import test from "node:test";
import { swapTransactionStatus } from "../lib/swap-transaction-status";

test("wallet hash alone is not evidence of broadcast or success", () => {
  assert.equal(swapTransactionStatus(null, null, 0), "pending");
  assert.equal(swapTransactionStatus(null, null, 60000), "unlocated");
  assert.equal(swapTransactionStatus(null, null, 3600000), "unlocated");
});
test("visible transaction without a receipt remains pending", () => {
  assert.equal(swapTransactionStatus(null, { hash: "test" }, 60000), "pending");
});
test("only explicit receipt status settles a transaction", () => {
  assert.equal(swapTransactionStatus({ status: "0x1" }, null, 0), "confirmed");
  assert.equal(swapTransactionStatus({ status: "0x0" }, null, 0), "reverted");
  assert.throws(() => swapTransactionStatus({}, null, 0), /recognized/);
});
