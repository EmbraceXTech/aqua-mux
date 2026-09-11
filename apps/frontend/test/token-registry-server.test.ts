import assert from "node:assert/strict";
import test from "node:test";
import type { PublicClient } from "viem";
import {
  checkTokenMetadata,
  getTokenRegistry,
  resetTokenRegistryCacheForTests,
  validateTokenPair,
} from "../lib/server/token-registry";
import { parseTokenRegistry } from "../lib/token-registry";

const native = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";
const usdc = "0x0000000000000000000000000000000000000001";

function registryPayload() {
  return {
    tokens: {
      [native]: {
        chainId: 1,
        address: native,
        symbol: "ETH",
        name: "Ether",
        decimals: 18,
        tags: ["bluechip"],
      },
      [usdc]: {
        chainId: 1,
        address: usdc,
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        tags: ["stablecoin"],
      },
    },
  };
}

function metadataClient(decimals = 6): PublicClient {
  return {
    getCode: async () => "0x1234",
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "decimals") return decimals;
      if (functionName === "symbol") return "USDC";
      return "USD Coin";
    },
  } as unknown as PublicClient;
}

test("server registry caches a validated 1inch response", async () => {
  resetTokenRegistryCacheForTests();
  let calls = 0;
  const request = async () => {
    calls++;
    return Response.json(registryPayload());
  };
  const first = await getTokenRegistry(1, {
    apiKey: "test-key",
    fetch: request as typeof fetch,
    now: () => 1_000,
  });
  const second = await getTokenRegistry(1, {
    apiKey: "test-key",
    fetch: request as typeof fetch,
    now: () => 2_000,
  });

  assert.equal(calls, 1);
  assert.equal(first.tokens.length, 2);
  assert.equal(first.degraded, false);
  assert.equal(second.fetchedAt, first.fetchedAt);
});

test("server registry falls back to the committed catalog without a key", async () => {
  resetTokenRegistryCacheForTests();
  const snapshot = await getTokenRegistry(42161, {
    apiKey: "",
    now: () => Date.now(),
  });
  assert.equal(snapshot.degraded, true);
  assert.ok(snapshot.tokens.length >= 1);
});

test("metadata validation detects decimals mismatches", async () => {
  const token = parseTokenRegistry(1, registryPayload()).tokens.find(
    (item) => item.address === usdc,
  );
  assert.ok(token);
  const result = await checkTokenMetadata(1, token, {
    publicClient: metadataClient(18),
    now: () => 1_000,
  });
  assert.equal(result.status, "mismatch");
  assert.equal(result.registryDecimals, 6);
  assert.equal(result.onchainDecimals, 18);
});

test("pair validation distinguishes metadata checks from route availability", async () => {
  resetTokenRegistryCacheForTests();
  const request = async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/tokens")) return Response.json(registryPayload());
    if (url.includes("/quote?")) return Response.json({ dstAmount: "2500000" });
    throw new Error("Unexpected request");
  };
  const result = await validateTokenPair(
    { chainId: 1, src: native, dst: usdc, amount: "1000000000000000" },
    {
      apiKey: "test-key",
      fetch: request as typeof fetch,
      publicClient: metadataClient(),
      now: () => 1_000,
    },
  );

  assert.equal(result.metadata.source.status, "verified");
  assert.equal(result.metadata.destination.status, "verified");
  assert.deepEqual(result.route, {
    status: "available",
    checkedAt: "1970-01-01T00:00:01.000Z",
    amountIn: "1000000000000000",
    amountOut: "2500000",
  });
});

test("a failed quote stays distinct from registry membership", async () => {
  resetTokenRegistryCacheForTests();
  const request = async (input: string | URL | Request) =>
    String(input).endsWith("/tokens")
      ? Response.json(registryPayload())
      : Response.json({ description: "No route" }, { status: 400 });
  const result = await validateTokenPair(
    { chainId: 1, src: native, dst: usdc, amount: "1" },
    {
      apiKey: "test-key",
      fetch: request as typeof fetch,
      publicClient: metadataClient(),
      now: () => 1_000,
    },
  );

  assert.equal(result.destination.registryStatus, "listed");
  assert.equal(result.route.status, "unavailable");
  assert.equal(result.route.reason, "no_route");
});
