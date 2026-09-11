import test from "node:test";
import assert from "node:assert/strict";
import {
  assertCapability,
  lifecycleRegistrationSchema,
  quantityHexSchema,
  integerAmountSchema,
  rawPriceRatio,
  strategyConfigSchema,
  strategyGroupSchema,
  reviewResultSchema,
} from "../lib/managed";
import {
  baseToken,
  configFixture,
  groupFixture,
  quoteToken,
} from "./managed-fixtures";

test("one LP pair is valid without changing Basket and integer quantities reject lossy numbers", () => {
  assert.equal(strategyConfigSchema.parse(configFixture()).pairs.length, 1);
  for (const bad of [1, "1.5", "-1", "01", (2n ** 256n).toString()])
    assert.equal(integerAmountSchema.safeParse(bad).success, false);
  assert.equal(
    integerAmountSchema.parse("9007199254740993"),
    "9007199254740993",
  );
});
test("denomination and range validation preserves human price across decimals", () => {
  const config = configFixture();
  if (config.family !== "lp") throw new Error("fixture");
  const pair = config.pairs[0];
  assert.deepEqual(rawPriceRatio(pair.openingPrice, baseToken, quoteToken), {
    numerator: 2000000n,
    denominator: 1000000000000000000n,
  });
  pair.range = {
    kind: "bounded",
    lower: { ...pair.openingPrice, numerator: "1" },
    upper: { ...pair.openingPrice, numerator: "3" },
  };
  assert.equal(strategyConfigSchema.safeParse(config).success, true);
  pair.range.lower = {
    ...pair.range.lower,
    baseToken: quoteToken.address,
    quoteToken: baseToken.address,
  };
  assert.equal(strategyConfigSchema.safeParse(config).success, false);
});
test("per-pair fee settings are independent and duplicate inventory is refused", () => {
  const config = configFixture();
  if (config.family !== "lp") throw new Error("fixture");
  const second = structuredClone(config.pairs[0]);
  second.quoteToken.address = "0x0000000000000000000000000000000000000013";
  second.openingPrice.quoteToken = second.quoteToken.address;
  second.feeBps = 50;
  config.policy.allowedAssets.value.push(second.quoteToken.address);
  config.pairs.push(second);
  assert.deepEqual(
    strategyConfigSchema
      .parse(config)
      .pairs.map((p) => ("feeBps" in p ? p.feeBps : null)),
    [30, 50],
  );
  const group = groupFixture();
  group.inventory = [
    { token: baseToken, amount: "1" },
    { token: baseToken, amount: "2" },
  ];
  assert.equal(strategyGroupSchema.safeParse(group).success, false);
});
test("schema versions, invented actions and unproven delegated execution fail closed", () => {
  assert.equal(
    strategyConfigSchema.safeParse({ ...configFixture(), version: 2 }).success,
    false,
  );
  assert.equal(
    reviewResultSchema.safeParse({
      version: 1,
      decision: "send-raw-calldata",
      rationale: "unsafe",
      evidence: [],
      expectedEffects: [],
      uncertainties: [],
    }).success,
    false,
  );
  assert.throws(
    () => assertCapability(configFixture(), "delegated"),
    /authenticated/,
  );
});

test("shared token metadata cannot change decimals between pair claims", () => {
  const config = configFixture();
  if (config.family !== "lp") throw new Error("fixture");
  const pair = structuredClone(config.pairs[0]);
  pair.quoteToken.address = "0x0000000000000000000000000000000000000013";
  pair.openingPrice.quoteToken = pair.quoteToken.address;
  pair.baseToken.decimals = 6;
  config.pairs.push(pair);
  config.policy.allowedAssets.value.push(pair.quoteToken.address);
  assert.equal(strategyConfigSchema.safeParse(config).success, false);
});

test("registration vectors agree and native values use RPC quantity encoding", () => {
  const registration = {
    hash: `0x${"11".repeat(32)}`,
    app: baseToken.address,
    tokens: [baseToken.address, quoteToken.address],
    amounts: ["1", "2"],
    program: "0x",
    strategy: "0x",
  };
  assert.equal(
    lifecycleRegistrationSchema.safeParse(registration).success,
    true,
  );
  assert.equal(
    lifecycleRegistrationSchema.safeParse({
      ...registration,
      amounts: ["1", "2", "3"],
    }).success,
    false,
  );
  assert.equal(
    lifecycleRegistrationSchema.safeParse({
      ...registration,
      tokens: [baseToken.address, baseToken.address],
    }).success,
    false,
  );
  for (const value of ["0x0", "0x1", "0xff"])
    assert.equal(quantityHexSchema.safeParse(value).success, true);
  for (const value of ["0x", "0x00", "0x01"])
    assert.equal(quantityHexSchema.safeParse(value).success, false);
});
