import assert from "node:assert/strict";
import test from "node:test";
import { estimate, initialDrafts, numeric, row } from "./model";

const near = (actual: number, expected: number) =>
  assert.ok(Math.abs(actual - expected) < 0.000001, `${actual} != ${expected}`);

test("multi-out exact input splits value and deducts each output fee", () => {
  const draft = initialDrafts()["multi-out"];
  const quote = estimate(draft, "multi-out", "0.5");
  assert.equal(quote.valid, true);
  near(quote.amounts.output[0], 0.5997);
  near(quote.amounts.output[1], 0.009995);
  near(quote.fees, 1.25);
  draft.output[0].fee = "1";
  const changed = estimate(draft, "multi-out", "0.5");
  near(changed.amounts.output[0], 0.594);
  near(changed.amounts.output[1], quote.amounts.output[1]);
});

test("multi-in exact input charges independent input fees", () => {
  const draft = initialDrafts()["multi-in"];
  draft.input[0].fee = "1";
  draft.input[1].fee = "0.3";
  const quote = estimate(draft, "multi-in", "0.5");
  assert.equal(quote.valid, true);
  near(quote.amounts.output[0], 2482);
  near(quote.fees, 18);
});

test("multi-out exact output derives the required single input", () => {
  const draft = initialDrafts()["multi-out"];
  draft.exact = "output";
  const quote = estimate(draft, "multi-out", "0.5");
  assert.equal(quote.valid, true);
  near(quote.amounts.input[0], 2500);
  near(quote.outputTotal, 2498.75);
});

test("multi-in exact output allocates required inputs with their fees", () => {
  const draft = initialDrafts()["multi-in"];
  draft.exact = "output";
  const quote = estimate(draft, "multi-in", "0.5");
  assert.equal(quote.valid, true);
  near(quote.amounts.input[0], 0.6);
  near(quote.amounts.input[1], 0.01);
});

test("rejects invalid amounts and non-finite decimal input", () => {
  for (const value of [
    "",
    ".",
    "NaN",
    "Infinity",
    "1e3",
    "-1",
    "abc",
    "9".repeat(400),
  ])
    assert.ok(Number.isNaN(numeric(value)));
  const draft = initialDrafts()["multi-out"];
  for (const amount of ["", "0", "-1", "abc"]) {
    draft.input[0].amount = amount;
    assert.equal(estimate(draft, "multi-out", "0.5").valid, false);
  }
});

test("rejects invalid fees and global slippage", () => {
  const draft = initialDrafts()["multi-out"];
  for (const fee of ["", "-1", "3.1", "abc"]) {
    draft.output[0].fee = fee;
    assert.equal(estimate(draft, "multi-out", "0.5").valid, false);
  }
  draft.output[0].fee = "0";
  assert.equal(estimate(draft, "multi-out", "0.5").valid, true);
  for (const slip of ["", "0", "-1", "5.1", "abc"])
    assert.equal(estimate(draft, "multi-out", slip).valid, false);
});

test("requires positive allocations totaling 100 percent only on estimated side", () => {
  const draft = initialDrafts()["multi-out"];
  draft.output[0].weight = "70";
  assert.equal(estimate(draft, "multi-out", "0.5").valid, false);
  draft.exact = "output";
  assert.equal(estimate(draft, "multi-out", "0.5").valid, true);
  draft.exact = "input";
  draft.output[0].weight = "100";
  draft.output[1].weight = "0";
  assert.equal(estimate(draft, "multi-out", "0.5").valid, false);
});

test("validates balances including slippage for exact output", () => {
  const draft = initialDrafts()["multi-in"];
  draft.input[0].amount = "3";
  assert.equal(estimate(draft, "multi-in", "0.5").valid, false);
  draft.exact = "output";
  draft.output[0].amount = "10000";
  assert.equal(estimate(draft, "multi-in", "0.5").valid, true);
  assert.equal(estimate(draft, "multi-in", "5").valid, false);
});

test("rejects duplicate tokens, empty sides, and multiple tokens on the fixed side", () => {
  const draft = initialDrafts()["multi-out"];
  draft.output[0].symbol = "USDC";
  assert.equal(estimate(draft, "multi-out", "0.5").valid, false);
  draft.output = [];
  assert.equal(estimate(draft, "multi-out", "0.5").valid, false);
  draft.output = [row("ETH", "1", "100")];
  draft.input = [];
  assert.equal(estimate(draft, "multi-out", "0.5").valid, false);
  draft.input = [row("USDC", "1000"), row("DAI", "1000")];
  assert.equal(estimate(draft, "multi-out", "0.5").valid, false);
});

for (const mode of ["multi-in", "multi-out"] as const) {
  for (const exact of ["input", "output"] as const) {
    test(`single-to-single works in ${mode} with exact ${exact}`, () => {
      const draft = initialDrafts()[mode];
      draft.exact = exact;
      if (mode === "multi-out") {
        draft.output = [row("ETH", "0.9995")];
      } else {
        draft.input = [row("ETH", "0.6")];
        draft.output[0].amount = "1499.25";
      }
      // A single estimated token receives 100%, regardless of an old weight.
      const quote = estimate(draft, mode, "0.5");
      assert.equal(quote.valid, true);
      assert.equal(quote.amounts.input.length, 1);
      assert.equal(quote.amounts.output.length, 1);
      near(quote.amounts.input[0], mode === "multi-out" ? 2500 : 0.6);
      near(quote.amounts.output[0], mode === "multi-out" ? 0.9995 : 1499.25);
      near(quote.fees, mode === "multi-out" ? 1.25 : 0.75);
    });
  }
}

test("slippage changes protection, not the sample quote", () => {
  const draft = initialDrafts()["multi-out"];
  assert.deepEqual(
    estimate(draft, "multi-out", "0.1").amounts,
    estimate(draft, "multi-out", "1").amounts,
  );
});
