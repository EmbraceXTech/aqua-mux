import assert from "node:assert/strict";
import test from "node:test";
import {
  createSwapDraftState,
  isValidSlippage,
  swapDraftReducer,
} from "../lib/swap-draft";

test("draft edits are immutable and mode drafts stay independent", () => {
  const initial = createSwapDraftState();
  const edited = swapDraftReducer(initial, {
    type: "patch",
    side: "input",
    index: 0,
    values: { amount: "0.1" },
  });
  assert.equal(initial.drafts["multi-out"].input[0].amount, "");
  assert.equal(edited.drafts["multi-out"].input[0].amount, "0.1");
  const switched = swapDraftReducer(edited, { type: "mode", mode: "multi-in" });
  assert.equal(switched.drafts["multi-in"].input[0].amount, "");
  assert.equal(
    swapDraftReducer(switched, { type: "mode", mode: "multi-out" }).drafts[
      "multi-out"
    ].input[0].amount,
    "0.1",
  );
});
test("exact-side switching seeds only supplied fresh amounts without rounding", () => {
  const state = createSwapDraftState();
  const amounts = {
    input: ["0.000000000000000123"],
    output: ["0.123456", "0.00000123"],
  };
  const output = swapDraftReducer(state, {
    type: "exact",
    side: "output",
    amounts,
  });
  assert.equal(output.drafts["multi-out"].exact, "output");
  assert.deepEqual(
    output.drafts["multi-out"].output.map((r) => r.amount),
    amounts.output,
  );
  const input = swapDraftReducer(output, { type: "exact", side: "input" });
  assert.equal(input.drafts["multi-out"].input[0].amount, "");
  assert.equal(
    swapDraftReducer(input, { type: "exact", side: "input" }),
    input,
  );
});
test("token additions rebalance allocations and reject duplicates", () => {
  const state = createSwapDraftState();
  const added = swapDraftReducer(state, {
    type: "token",
    target: { side: "output" },
    symbol: "ARB",
  });
  assert.deepEqual(
    added.drafts["multi-out"].output.map((r) => r.weight),
    ["33", "33", "34"],
  );
  assert.equal(
    swapDraftReducer(added, {
      type: "token",
      target: { side: "output" },
      symbol: "ETH",
    }),
    added,
  );
  assert.equal(
    swapDraftReducer(added, {
      type: "token",
      target: { side: "input" },
      symbol: "DAI",
    }),
    added,
  );
});
test("removal keeps at least one row and cannot expand the single side", () => {
  const state = createSwapDraftState();
  assert.equal(
    swapDraftReducer(state, { type: "remove", side: "input", index: 0 }),
    state,
  );
  const removed = swapDraftReducer(state, {
    type: "remove",
    side: "output",
    index: 1,
  });
  assert.deepEqual(
    removed.drafts["multi-out"].output.map((r) => r.weight),
    ["100"],
  );
  assert.equal(
    swapDraftReducer(removed, { type: "remove", side: "output", index: 0 }),
    removed,
  );
});
test("token replacement clears amount but preserves fee and allocation", () => {
  const state = swapDraftReducer(createSwapDraftState(), {
    type: "patch",
    side: "output",
    index: 0,
    values: { amount: "1", fee: "0.3", weight: "70" },
  });
  const replaced = swapDraftReducer(state, {
    type: "token",
    target: { side: "output", index: 0 },
    symbol: "ARB",
  });
  assert.deepEqual(replaced.drafts["multi-out"].output[0], {
    symbol: "ARB",
    amount: "",
    fee: "0.3",
    weight: "70",
  });
});
test("slippage is shared across modes and rejects unsupported precision", () => {
  const state = swapDraftReducer(createSwapDraftState(), {
    type: "slippage",
    value: "0.25",
  });
  assert.equal(
    swapDraftReducer(state, { type: "mode", mode: "multi-in" }).slippage,
    "0.25",
  );
  for (const value of ["0.01", "0.25", "5"]) assert.ok(isValidSlippage(value));
  for (const value of ["", ".", "0", "5.01", "0.001", "1e0", "-1"])
    assert.equal(isValidSlippage(value), false);
});
