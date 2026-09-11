import test from "node:test";
import assert from "node:assert/strict";
import { toHex, type Address } from "viem";
import { createPlanPost } from "../app/api/plan/route";
import { createQuotePost } from "../app/api/quote/route";
import { NATIVE, tokens } from "../lib/config";
import { AuthError, type OwnerSession } from "../lib/server/auth";
import { resolveLegacyBasket } from "../lib/server/legacy-token-resolution";
import { buildPlan } from "../lib/server/plan";
import { TokenValidationLimitError } from "../lib/server/token-validation-limit";
import {
  resetTokenRegistryCacheForTests,
  type TokenRegistrySnapshot,
} from "../lib/server/token-registry-source";

const chainId = 42161 as const;
const account = "0x0000000000000000000000000000000000000001";
const bridgedUsdc = "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8" as Address;
const fallback = tokens(chainId);
const arb = fallback.find((token) => token.symbol === "ARB")!;
const weth = fallback.find((token) => token.symbol === "WETH")!;
const session: OwnerSession = {
  owner: account,
  sessionId: "fixture-session",
  expiresAt: Date.now() + 60_000,
};
const authenticate = () => session;
const limiter = {
  run: async <T>(_owner: string, operation: () => Promise<T>) => operation(),
};

function registry(
  overrides: Partial<TokenRegistrySnapshot["tokens"][number]> = {},
): TokenRegistrySnapshot {
  const dynamic = {
    chainId,
    address: bridgedUsdc,
    decimals: 6,
    symbol: "USDC.e",
    name: "Bridged USDC",
    tags: [],
    providers: ["fixture"],
    registryStatus: "listed" as const,
    routeStatus: "not_checked" as const,
    risk: "unknown" as const,
    selectable: true,
    ...overrides,
  };
  return {
    chainId,
    source: "fixture-registry",
    fetchedAt: new Date().toISOString(),
    stale: false,
    degraded: false,
    rejected: 0,
    tokens: [
      dynamic,
      ...[arb, weth].map((token) => ({
        chainId,
        address: token.address,
        decimals: token.decimals,
        symbol: token.symbol,
        name: token.name,
        tags: [],
        providers: ["fixture"],
        registryStatus: "listed" as const,
        routeStatus: "not_checked" as const,
        risk: "unknown" as const,
        selectable: true,
      })),
    ],
  };
}

function basket(mode: "swap" | "liquidity" = "swap") {
  return {
    chainId,
    mode,
    source: NATIVE,
    amount: "1",
    slippageBps: 50,
    feeBps: 5,
    range: "full" as const,
    legs: [
      { address: bridgedUsdc, bps: 5000, amount: "1" },
      { address: arb.address, bps: 5000, amount: "1" },
    ],
  };
}

test("legacy basket resolves a real registry token only with matching onchain decimals", async () => {
  const resolved = await resolveLegacyBasket(basket(), {
    registry: async () => registry(),
    metadata: async (_chain, token) => ({
      status: "verified",
      checkedAt: new Date().toISOString(),
      registryDecimals: token.decimals,
      onchainDecimals: token.decimals,
      warnings: [],
    }),
  });
  assert.equal(resolved.basket.legs.length, 2);
  assert.equal(
    resolved.tokens.find((token) => token.address === bridgedUsdc)?.decimals,
    6,
  );
  assert.equal(Object.isFrozen(resolved.tokens), true);
  assert.equal(Object.isFrozen(resolved.tokens[0]), true);
});

test("verified onchain metadata takes precedence over fallback metadata", async () => {
  const fallbackBasket = {
    ...basket(),
    legs: [
      { address: arb.address, bps: 5000, amount: "1" },
      { address: weth.address, bps: 5000, amount: "1" },
    ],
  };
  const resolved = await resolveLegacyBasket(fallbackBasket, {
    registry: async () =>
      registry({
        address: arb.address,
        decimals: arb.decimals,
        symbol: "REGISTRY-ARB",
        name: "Registry Arbitrum",
      }),
    metadata: async (_chain, token) => ({
      status: "mismatch",
      checkedAt: new Date().toISOString(),
      registryDecimals: token.decimals,
      onchainDecimals: token.decimals,
      onchainSymbol: token.address === arb.address ? "CHAIN-ARB" : token.symbol,
      onchainName:
        token.address === arb.address ? "Chain Arbitrum" : token.name,
      warnings: ["Registry display metadata differs."],
    }),
  });
  const verifiedArb = resolved.resolveToken(chainId, arb.address);
  assert.equal(verifiedArb.symbol, "CHAIN-ARB");
  assert.equal(verifiedArb.name, "Chain Arbitrum");
});

test("legacy basket rejects risk-flagged tokens and decimal mismatches", async () => {
  await assert.rejects(
    resolveLegacyBasket(basket(), {
      registry: async () => registry({ risk: "suspicious", selectable: false }),
    }),
    /risk-flagged token/,
  );
  await assert.rejects(
    resolveLegacyBasket(basket(), {
      registry: async () => registry(),
      metadata: async (_chain, token) => ({
        status: "mismatch",
        checkedAt: new Date().toISOString(),
        registryDecimals: token.decimals,
        onchainDecimals:
          token.address === bridgedUsdc ? token.decimals + 12 : token.decimals,
        warnings: ["Registry decimals do not match."],
      }),
    }),
    /decimals do not match/,
  );
});

function rpcResponse(body: string): Response {
  const request = JSON.parse(body) as {
    id: number;
    method: string;
    params?: Array<{ to?: string; data?: string }>;
  };
  const call = request.params?.[0] ?? {};
  if (request.method === "eth_chainId") {
    return Response.json({
      jsonrpc: "2.0",
      id: request.id,
      result: toHex(chainId),
    });
  }
  if (request.method === "eth_getCode") {
    return Response.json({ jsonrpc: "2.0", id: request.id, result: "0x1234" });
  }
  if (request.method === "eth_call") {
    if (call.data?.startsWith("0x313ce567")) {
      const decimals = call.to?.toLowerCase() === bridgedUsdc ? 6n : 18n;
      return Response.json({
        jsonrpc: "2.0",
        id: request.id,
        result: toHex(decimals, { size: 32 }),
      });
    }
    if (
      call.data?.startsWith("0xdd62ed3e") ||
      call.data?.startsWith("0x70a08231")
    ) {
      return Response.json({
        jsonrpc: "2.0",
        id: request.id,
        result: toHex(call.data.startsWith("0xdd62ed3e") ? 0n : 10n ** 24n, {
          size: 32,
        }),
      });
    }
    return Response.json(
      {
        jsonrpc: "2.0",
        id: request.id,
        error: { code: -1, message: "unsupported fixture call" },
      },
      { status: 200 },
    );
  }
  return Response.json({
    jsonrpc: "2.0",
    id: request.id,
    result: toHex(10n ** 24n),
  });
}

async function withNetworkFixture(run: () => Promise<void>, routeStatus = 200) {
  const realFetch = globalThis.fetch;
  const oldRpc = process.env.ARBITRUM_RPC_URL;
  const oldKey = process.env.ONEINCH_API_KEY;
  process.env.ARBITRUM_RPC_URL = "http://rpc.fixture";
  process.env.ONEINCH_API_KEY = "fixture-key";
  resetTokenRegistryCacheForTests();
  globalThis.fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    if (url === "http://rpc.fixture/") {
      const body =
        init?.body ??
        (input instanceof Request ? await input.clone().text() : "");
      return rpcResponse(String(body));
    }
    if (url.endsWith("/tokens")) {
      return Response.json({ tokens: registry().tokens });
    }
    if (url.includes("/quote?")) {
      return routeStatus === 200
        ? Response.json({ dstAmount: "1000000" })
        : Response.json({}, { status: routeStatus });
    }
    throw new Error(`Unexpected fixture URL: ${new URL(url).origin}`);
  };
  try {
    await run();
  } finally {
    globalThis.fetch = realFetch;
    resetTokenRegistryCacheForTests();
    if (oldRpc === undefined) delete process.env.ARBITRUM_RPC_URL;
    else process.env.ARBITRUM_RPC_URL = oldRpc;
    if (oldKey === undefined) delete process.env.ONEINCH_API_KEY;
    else process.env.ONEINCH_API_KEY = oldKey;
  }
}

test("quote API accepts the dynamic token and reports provider route failure", async () => {
  const quote = createQuotePost({ authenticate, limiter });
  await withNetworkFixture(async () => {
    const request = new Request("http://localhost/api/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(basket()),
    });
    const response = await quote(request);
    assert.equal(
      response.status,
      200,
      JSON.stringify(await response.clone().json()),
    );
    const payload = (await response.json()) as {
      legs: Array<{ address: string }>;
    };
    assert.equal(payload.legs[0].address, bridgedUsdc);
  });
  await withNetworkFixture(async () => {
    const request = new Request("http://localhost/api/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(basket()),
    });
    const response = await quote(request);
    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /could not provide a route/);
  }, 400);
});

test("legacy quote authenticates, bounds, and admits requests before resolution", async () => {
  let resolutions = 0;
  const resolve = async () => {
    resolutions++;
    throw new Error("Resolution should not run.");
  };
  const unauthorized = createQuotePost({
    authenticate: () => {
      throw new AuthError(401, "Authentication required.");
    },
    limiter,
    resolve,
  });
  const unauthorizedResponse = await unauthorized(
    new Request("http://localhost/api/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(basket()),
    }),
  );
  assert.equal(unauthorizedResponse.status, 401);

  const oversized = createQuotePost({ authenticate, limiter, resolve });
  const oversizedResponse = await oversized(
    new Request("http://localhost/api/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ padding: "x".repeat(8_192) }),
    }),
  );
  assert.equal(oversizedResponse.status, 413);

  const rejected = createQuotePost({
    authenticate,
    limiter: {
      run: async () => {
        throw new TokenValidationLimitError(2);
      },
    },
    resolve,
  });
  const rejectedResponse = await rejected(
    new Request("http://localhost/api/quote", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(basket()),
    }),
  );
  assert.equal(rejectedResponse.status, 429);
  assert.equal(rejectedResponse.headers.get("retry-after"), "2");
  assert.equal(resolutions, 0);
});

test("plan API binds the requested account to the authenticated owner", async () => {
  let builds = 0;
  const plan = createPlanPost({
    authenticate,
    limiter,
    build: async () => {
      builds++;
      throw new Error("Build should not run.");
    },
  });
  const response = await plan(
    new Request("http://localhost/api/plan", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        basket: basket("liquidity"),
        account: "0x0000000000000000000000000000000000000002",
      }),
    }),
  );
  assert.equal(response.status, 400);
  assert.match(
    (await response.json()).error,
    /must match the authenticated wallet/,
  );
  assert.equal(builds, 0);
});

test("legacy liquidity plan carries verified dynamic token metadata", async () => {
  await withNetworkFixture(async () => {
    const plan = await buildPlan(basket("liquidity"), account);
    assert.equal(plan.strategies.length, 2);
    assert.equal(
      plan.verifiedTokens?.find((token) => token.address === bridgedUsdc)
        ?.decimals,
      6,
    );
    assert.match(plan.strategies[0].pair, /USDC\.e/);
  });
});
