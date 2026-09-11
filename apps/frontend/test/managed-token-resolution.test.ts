import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureManagedTokens,
  verifiedToken,
} from "../lib/server/managed-service/tokens";
import type { TokenRegistrySnapshot } from "../lib/server/token-registry-source";
const address = "0x1234567890123456789012345678901234567890";
const registry: TokenRegistrySnapshot = {
  chainId: 42161,
  source: "fixture-registry",
  fetchedAt: new Date().toISOString(),
  stale: false,
  degraded: false,
  rejected: 0,
  tokens: [
    {
      chainId: 42161,
      address,
      decimals: 6,
      symbol: "FULL",
      name: "Full registry fixture",
      tags: [],
      providers: [],
      registryStatus: "listed",
      routeStatus: "not_checked",
      risk: "unknown",
      selectable: true,
    },
  ],
};
test("full registry selection resolves only after independent onchain metadata verification", async () => {
  assert.throws(
    () => verifiedToken(42161, address),
    /not in the verified list/,
  );
  await assert.rejects(
    ensureManagedTokens(42161, [address], [], {
      registry: async () => registry,
      metadata: async () => ({
        status: "mismatch",
        checkedAt: new Date().toISOString(),
        registryDecimals: 6,
        onchainDecimals: 18,
        warnings: ["Mismatch"],
      }),
    }),
    /could not be verified/,
  );
  await ensureManagedTokens(42161, [address], [], {
    registry: async () => registry,
    metadata: async () => ({
      status: "verified",
      checkedAt: new Date().toISOString(),
      registryDecimals: 6,
      onchainDecimals: 6,
      warnings: [],
    }),
  });
  const { validateConfigTokens } =
    await import("../lib/server/managed-service/snapshot");
  const { lifecycleFixture } = await import("./lifecycle-fixtures");
  const config = lifecycleFixture().config;
  config.pairs[0].baseToken = { address, decimals: 18, symbol: "FULL" };
  assert.throws(() => validateConfigTokens(config), /metadata must match/);
  assert.deepEqual(verifiedToken(42161, address), {
    address,
    decimals: 6,
    symbol: "FULL",
  });
});

test("stale registry cannot authorize a new token and persisted metadata can recover without registry", async () => {
  const next = "0x1234567890123456789012345678901234567891";
  await assert.rejects(
    ensureManagedTokens(42161, [next], [], {
      registry: async () => ({ ...registry, stale: true }),
    }),
    /Refresh the token registry/,
  );
  const saved = {
    address: next as `0x${string}`,
    decimals: 6,
    symbol: "SAVED",
  };
  await assert.rejects(
    ensureManagedTokens(42161, [next], [saved], {
      registry: async () => {
        throw new Error("Registry must not be needed for recovery");
      },
      storedDecimals: async () => 18,
    }),
    /Stored token decimals/,
  );
  await ensureManagedTokens(42161, [next], [saved], {
    registry: async () => {
      throw new Error("Registry must not be needed for recovery");
    },
    storedDecimals: async () => 6,
  });
  assert.deepEqual(verifiedToken(42161, next), saved);
});

test("fallback catalog selection still requires current registry risk and onchain decimals", async () => {
  const { base } = await import("./lifecycle-fixtures");
  let checked = 0;
  const listed = { ...registry.tokens[0], ...base, name: base.symbol };
  await assert.rejects(
    ensureManagedTokens(42161, [base.address], [], {
      registry: async () => ({
        ...registry,
        tokens: [{ ...listed, selectable: false, risk: "malicious" }],
      }),
      metadata: async () => {
        checked++;
        throw new Error("Must refuse risk first");
      },
    }),
    /not selectable/,
  );
  assert.equal(checked, 0);
  await assert.rejects(
    ensureManagedTokens(42161, [base.address], [], {
      registry: async () => ({ ...registry, tokens: [listed] }),
      metadata: async () => ({
        status: "mismatch",
        checkedAt: new Date().toISOString(),
        registryDecimals: 18,
        onchainDecimals: 6,
        warnings: ["Mismatch"],
      }),
    }),
    /could not be verified/,
  );
});

test("verified token cache evicts excess entries and removes expired metadata", async () => {
  const { VerifiedTokenCache } =
    await import("../lib/server/managed-service/token-cache");
  let now = 100;
  const cache = new VerifiedTokenCache(2, 10, () => now);
  const token = {
    address: address as `0x${string}`,
    decimals: 6,
    symbol: "CACHE",
  };
  cache.set("one", token);
  cache.set("two", token);
  cache.set("three", token);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("one"), undefined);
  now = 111;
  assert.equal(cache.size, 0);
  assert.equal(cache.get("three"), undefined);
});

test("stored native funding metadata recovers without ERC20 calls or registry access", async () => {
  const { NATIVE } = await import("../lib/config");
  const native = { address: NATIVE, decimals: 18, symbol: "ETH" };
  await ensureManagedTokens(42161, [NATIVE], [native], {
    registry: async () => {
      throw new Error("No registry call allowed");
    },
    storedDecimals: async () => {
      throw new Error("Native sentinel is not an ERC20");
    },
  });
  assert.deepEqual(verifiedToken(42161, NATIVE), native);
  await assert.rejects(
    ensureManagedTokens(42161, [NATIVE], [{ ...native, decimals: 6 }], {
      storedDecimals: async () => {
        throw new Error("No ERC20 call allowed");
      },
    }),
    /Stored token decimals/,
  );
});

test("display label drift uses the contract symbol only after matching decimals", async () => {
  const resolved = await ensureManagedTokens(42161, [address], [], {
    registry: async () => registry,
    metadata: async () => ({
      status: "mismatch",
      checkedAt: new Date().toISOString(),
      registryDecimals: 6,
      onchainDecimals: 6,
      onchainSymbol: "CHAIN",
      warnings: ["Registry symbol differs from the token contract."],
    }),
  });
  assert.equal(verifiedToken(42161, address, resolved).symbol, "CHAIN");
});
