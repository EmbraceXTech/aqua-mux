import assert from "node:assert/strict";
import { test } from "node:test";
import {
  moveRange,
  presetRange,
  rangeDomain,
  rangeStep,
  selectedPreset,
  validRange,
} from "./range-model";

test("range boundaries cannot cross or leave the chart domain", () => {
  const start = { low: 90, high: 110 };
  const domain = { min: 50, max: 150 };
  assert.deepEqual(moveRange(start, "low", 100, domain, 1), {
    low: 109,
    high: 110,
  });
  assert.deepEqual(moveRange(start, "high", -100, domain, 1), {
    low: 90,
    high: 91,
  });
  assert.equal(moveRange(start, "low", -100, domain, 1).low, 50);
  assert.equal(moveRange(start, "high", 100, domain, 1).high, 150);
});

test("moving the band preserves width and stops at both edges", () => {
  const start = { low: 90, high: 110 };
  const domain = { min: 50, max: 150 };
  assert.deepEqual(moveRange(start, "band", 10, domain, 1), {
    low: 100,
    high: 120,
  });
  assert.deepEqual(moveRange(start, "band", 100, domain, 1), {
    low: 130,
    high: 150,
  });
  assert.deepEqual(moveRange(start, "band", -100, domain, 1), {
    low: 50,
    high: 70,
  });
});

test("small-price pairs retain useful precision", () => {
  const price = 0.00042;
  const start = { low: 0.00036, high: 0.00048 };
  const step = rangeStep(price);
  assert.equal(step, 1e-8);
  const next = moveRange(start, "low", step, rangeDomain(price, start), step);
  assert.equal(next.low, 0.00036001);
  assert.equal(next.high, start.high);
});

test("presets center on the fixed market price and custom ranges clear selection", () => {
  for (const price of [1.0845, 0.00042]) {
    for (const percent of [5, 10, 20]) {
      const range = presetRange(price, percent);
      assert.equal(selectedPreset(price, range), percent);
      assert.ok(validRange(range));
    }
  }
  assert.equal(selectedPreset(100, { low: 99, high: 106 }), undefined);
});

test("invalid ranges are rejected and the chart can recover", () => {
  for (const range of [
    { low: -1, high: 1 },
    { low: 1, high: 1 },
    { low: 2, high: 1 },
    { low: 1, high: Infinity },
    { low: NaN, high: 2 },
  ]) {
    assert.equal(validRange(range), false);
    const domain = rangeDomain(1, range);
    assert.ok(Number.isFinite(domain.min) && Number.isFinite(domain.max));
    assert.ok(domain.min < 1 && domain.max > 1);
  }
});
