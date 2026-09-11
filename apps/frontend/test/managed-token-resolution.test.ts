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
