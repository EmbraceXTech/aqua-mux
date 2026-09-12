import assert from "node:assert/strict";
import { test } from "node:test";
import { encodeFunctionData, erc20Abi, type PublicClient } from "viem";
import { AQUA } from "../../config";
import { devPlanAssets, verifyDevAssets } from "./assets";
import type { DevBatchPlan } from "./batch";
import { validateDevPlan } from "./policy";

const maker = "0x0000000000000000000000000000000000000001";
const token = {
  address: "0x0000000000000000000000000000000000000012" as const,
  decimals: 6,
  symbol: "FIXTURE",
};
const fixture = (): DevBatchPlan => ({
  account: maker,
  chainId: 56,
  mode: "liquidity",
  createdAt: Date.now(),
  expiresAt: Date.now() + 30_000,
  strategies: [],
  summary: [],
  assetMetadata: [token],
  calls: [
    {
      to: token.address,
      value: "0x0",
      label: "Approve registry token",
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "approve",
        args: [AQUA, 10n],
      }),
    },
  ],
});

test("stored dynamic token metadata permits only verified assets and rejects conflicts", () => {
  const plan = fixture();
  validateDevPlan(plan, maker);
  assert.throws(
    () => validateDevPlan({ ...plan, assetMetadata: [] }, maker),
    /Unapproved call target/,
  );
  assert.throws(
    () =>
      devPlanAssets({
        ...plan,
        assetMetadata: [token, { ...token, decimals: 18 }],
      }),
    /Conflicting/,
  );
});

test("dynamic asset signing checks deployed code and current decimals", async () => {
  const plan = fixture();
  let code = "0x6000";
  let decimals = 6;
  const rpc = {
    getCode: async () => code,
    readContract: async () => decimals,
  } as unknown as Pick<PublicClient, "getCode" | "readContract">;
  await verifyDevAssets(plan, rpc);
  decimals = 18;
  await assert.rejects(() => verifyDevAssets(plan, rpc), /decimals changed/);
  decimals = 6;
  code = "0x";
  await assert.rejects(
    () => verifyDevAssets(plan, rpc),
    /no deployed contract/,
  );
});
