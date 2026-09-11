import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureManagedTokens,
  verifiedToken,
} from "../lib/server/managed-service/tokens";
import {
  walletSnapshot,
  validateConfigTokens,
  type WalletSnapshot,
} from "../lib/server/managed-service/snapshot";
import { proposeIntent } from "../lib/server/managed-service/proposals";
import { ManagedStore } from "../lib/server/store";
import { NATIVE } from "../lib/config";
import type { Token } from "../lib/managed";
import type { ProposalIntent } from "../lib/server/managed-service/inputs";
import { lifecycleFixture, native, quote } from "./lifecycle-fixtures";
import { ownerA } from "./managed-fixtures";
import type { client } from "../lib/server/rpc";

const full: Token = {
  address: "0x1234567890123456789012345678901234567888",
  decimals: 18,
  symbol: "FULL",
};
const verify = (tokens: Token[]) =>
  ensureManagedTokens(
    42161,
    tokens.map((t) => t.address),
    tokens,
    {
      storedDecimals: async (_chain, token) => token.decimals,
    },
  );
async function evictCache() {
  const tokens = Array.from(
    { length: 257 },
    (_, index): Token => ({
      address: `0x${(1000 + index).toString(16).padStart(40, "0")}`,
      decimals: 18,
      symbol: "OTHER",
    }),
  );
  await verify(tokens);
}

test("request metadata survives concurrent refresh and eviction during wallet RPC", async () => {
  const saved = { ...full };
  const metadata = await verify([saved, quote]);
  saved.symbol = "CHANGED_AFTER_VERIFICATION";
  assert.ok(Object.isFrozen(metadata));
  assert.ok(Object.isFrozen(metadata.tokens));
  assert.ok(Object.isFrozen(metadata.tokens[0]));
  const snapshot = await walletSnapshot(
    {
      chainId: 42161,
      maker: ownerA,
      assets: [full.address, quote.address],
      maxAgeMs: 60_000,
    },
    {
      ensureTokens: async () => metadata,
      rpc: () =>
        ({
          getBlock: async () => {
            await verify([{ ...full, decimals: 6, symbol: "OTHER_REQUEST" }]);
            await evictCache();
            return {
              number: 1n,
              timestamp: BigInt(Math.floor(Date.now() / 1000)),
              hash: `0x${"1".repeat(64)}`,
            };
          },
          getChainId: async () => 42161,
          getBalance: async () => 100n,
          readContract: async () => 100n,
        }) as unknown as ReturnType<typeof client>,
    },
  );
  assert.deepEqual(snapshot.balances[0].token, full);
  assert.throws(
    () => verifiedToken(42161, full.address),
    /not in the verified list/,
  );
  assert.deepEqual(verifiedToken(42161, full.address, metadata), full);
  assert.throws(
    () => verifiedToken(56, full.address, metadata),
    /absent from this request/,
  );
  assert.throws(
    () => verifiedToken(42161, NATIVE, metadata),
    /absent from this request/,
  );
});

for (const source of [full, native]) {
  test(`proposal preserves ${source.symbol} funding and pair metadata across the model wait`, async () => {
    const store = new ManagedStore(":memory:");
    const state = globalThis as typeof globalThis & {
      aquamuxManagedStore?: ManagedStore;
    };
    const previous = state.aquamuxManagedStore;
    state.aquamuxManagedStore = store;
    try {
      const tokenMetadata = await verify([full, quote, native]);
      const now = Date.now();
      const snapshot: WalletSnapshot = {
        tokenMetadata,
        observedAt: now,
        blockTimestamp: now,
        blockNumber: "1",
        blockHash: `0x${"1".repeat(64)}`,
        chainId: 42161,
        maker: ownerA,
        nativeBalanceWei: "10000000000000000000",
        balances: [{ token: full, amount: "1000000000000000000" }],
        allowances: [],
        coverage: [],
      };
      const intent: ProposalIntent = {
        recipeId: "wide-range-lp",
        chainId: 42161,
        maker: ownerA,
        fundingToken: source.address,
        permittedAssets: [full.address, quote.address],
        budget: "1000000000000000000",
        gasReserveWei: "10000000000000000",
        holdingPeriodMs: 86_400_000,
        intervalMs: 60_000,
      };
      const response = await proposeIntent(
        ownerA,
        `metadata-${source.symbol}`,
        intent,
        {
          snapshot: async () => snapshot,
          runner: {
            cancel: async () => {},
            review: async (request) => {
              await verify([{ ...full, decimals: 6, symbol: "OTHER_REQUEST" }]);
              await evictCache();
              const config = lifecycleFixture().config;
              assert.equal(config.family, "lp");
              if (config.family !== "lp")
                throw new Error("LP fixture required");
              config.pairs[0].baseToken = { ...full };
              config.pairs[0].openingPrice.baseToken = full.address;
              config.policy = request.policyTemplate!;
              return {
                requestId: request.requestId,
                provider: "fixture",
                model: "fixture",
                runtimeVersion: "fixture",
                usage: { cost: null },
                result: {
                  version: 1,
                  decision: "fund-and-open",
                  rationale: "Fixture proposal.",
                  evidence: [],
                  expectedEffects: [],
                  uncertainties: [],
                  proposedConfig: config,
                },
              };
            },
          },
        },
      );
      assert.equal(
        response.review.status,
        "succeeded",
        response.review.errors.join("; "),
      );
      assert.deepEqual(response.group?.config.pairs[0].baseToken, full);
      assert.deepEqual(response.group?.inventory, [
        { token: source, amount: intent.budget },
      ]);
      const bad = structuredClone(response.group!.config);
      bad.pairs[0].baseToken.decimals = 6;
      assert.throws(
        () => validateConfigTokens(bad, tokenMetadata),
        /metadata must match/,
      );
    } finally {
      state.aquamuxManagedStore = previous;
      store.close();
    }
  });
}
