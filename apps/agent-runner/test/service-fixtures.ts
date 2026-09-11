import { configFixture, ownerA } from "../../frontend/test/managed-fixtures";
import type { ReviewRequest, ReviewResponse } from "../src/service/contract";

export function requestFixture(requestId = "review-1"): ReviewRequest {
  const config = configFixture();
  if (config.family !== "lp") throw new Error("LP fixture required");
  const now = Date.now();
  return {
    requestId,
    owner: ownerA,
    groupId: "group-1",
    botId: "bot-1",
    runGeneration: 0,
    purpose: "interval",
    config,
    snapshot: {
      observedAt: now,
      blockTimestamp: now,
      blockNumber: "123",
      blockHash: `0x${"a".repeat(64)}`,
      chainId: config.chainId,
      maker: config.maker,
      nativeBalanceWei: "10000000000000000",
      balances: config.pairs.flatMap((p) => [
        { token: p.baseToken, amount: p.baseAmount },
        { token: p.quoteToken, amount: p.quoteAmount },
      ]),
      allowances: [],
      coverage: [
        {
          source: "test-fixture-wallet",
          observedAt: now,
          status: "partial",
          detail: "Synthetic test balances; no live market observations.",
        },
      ],
    },
  };
}

export function stubReview(): Omit<ReviewResponse, "requestId"> {
  return {
    provider: "test-only",
    model: "stub",
    runtimeVersion: "test",
    usage: { cost: null },
    result: {
      version: 1,
      decision: "hold",
      rationale: "Test fixture hold.",
      evidence: [],
      expectedEffects: [],
      uncertainties: ["Synthetic test input."],
    },
  };
}
