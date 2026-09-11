import test from "node:test";
import assert from "node:assert/strict";
import { quoteBasket } from "../lib/server/swap";
import {
  intentSnapshot,
  type WalletSnapshot,
} from "../lib/server/managed-service/snapshot";
import { planFunding } from "../lib/server/managed-service/funding";
import { lifecycleFixture, base, quote, native } from "./lifecycle-fixtures";
import type { ProposalIntent } from "../lib/server/managed-service/inputs";

const maximum = ((1n << 256n) - 1n).toString();
const intent: ProposalIntent = {
  chainId: 42161,
  recipeId: "wide-range-lp",
  maker: lifecycleFixture().owner,
  fundingToken: native.address,
  budget: "1000000000000000000",
  gasReserveWei: "1000000000000000",
  permittedAssets: [native.address, quote.address],
  intervalMs: 60000,
  holdingPeriodMs: 86400000,
};
const metadata = { chainId: 42161, tokens: [native, base, quote] };
const wallet = (): WalletSnapshot => ({
  tokenMetadata: metadata,
  observedAt: Date.now(),
  blockNumber: "100",
  blockHash: `0x${"12".repeat(32)}`,
  blockTimestamp: Date.now(),
  chainId: 42161,
  maker: intent.maker,
  nativeBalanceWei: "2000000000000000000",
  balances: [],
  allowances: [],
  coverage: [],
});

test("every quote consumer rejects non-string, zero, malformed and overflowing output", async () => {
  const previousFetch = globalThis.fetch,
    previousKey = process.env.ONEINCH_API_KEY;
  process.env.ONEINCH_API_KEY = "labelled-test-key";
  try {
    for (const output of [
      9007199254740993,
      (1n << 256n).toString(),
      "0",
      "01",
      "1.5",
      "-1",
      null,
      undefined,
    ]) {
      globalThis.fetch = async () => Response.json({ dstAmount: output });
      await assert.rejects(
        quoteBasket({
          chainId: 42161,
          mode: "swap",
          source: native.address,
          amount: "1",
          slippageBps: 50,
          feeBps: 5,
          range: "full",
          legs: [
            { address: quote.address, bps: 5000, amount: "0" },
            { address: base.address, bps: 5000, amount: "0" },
          ],
        }),
        /invalid output amount/,
      );
      await assert.rejects(
        planFunding(lifecycleFixture().config, [], intent, metadata),
        /funding quote is unavailable/,
      );
      const snapshot = await intentSnapshot(intent, {
        wallet: async () => wallet(),
        quote: async () => ({ dstAmount: output }),
      });
      assert.deepEqual(snapshot.routeQuotes, []);
      assert.equal(snapshot.coverage[0].status, "unavailable");
    }
    globalThis.fetch = async () =>
      new Response("{", { headers: { "content-type": "application/json" } });
    await assert.rejects(
      planFunding(lifecycleFixture().config, [], intent, metadata),
    );
    globalThis.fetch = async () => Response.json({ dstAmount: maximum });
    const funding = await planFunding(
      lifecycleFixture().config,
      [],
      intent,
      metadata,
    );
    assert.equal(funding?.purchases[0].amountIn, "1");
    const snapshot = await intentSnapshot(intent, {
      wallet: async () => wallet(),
      quote: async () => ({ dstAmount: maximum }),
    });
    assert.equal(snapshot.routeQuotes?.[0].amountOut, maximum);
    const basket = await quoteBasket({
      chainId: 42161,
      mode: "swap",
      source: native.address,
      amount: "1",
      slippageBps: 50,
      feeBps: 5,
      range: "full",
      legs: [
        { address: quote.address, bps: 5000, amount: "0" },
        { address: base.address, bps: 5000, amount: "0" },
      ],
    });
    assert.equal(basket.legs[0].amountOut, maximum);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.ONEINCH_API_KEY;
    else process.env.ONEINCH_API_KEY = previousKey;
  }
});
