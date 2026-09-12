import assert from "node:assert/strict";
import { test } from "node:test";
import type { LifecyclePlan } from "../lib/managed";
import type { Basket, Plan } from "../lib/model";
import type { ManagedSession } from "../lib/managed-client/api";
import { walletExecutor } from "../lib/managed-client/wallet-execution";
import type { Provider } from "../lib/wallet";

const account = "0x0000000000000000000000000000000000000001" as const;
const basket: Basket = {
  chainId: 42161,
  mode: "liquidity",
  source: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
  amount: "1",
  legs: [
    {
      address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      amount: "1",
      bps: 10_000,
      range: "full",
    },
  ],
  slippageBps: 50,
  feeBps: 5,
  range: "full",
};
const plan: Plan = {
  chainId: 42161,
  account,
  mode: "liquidity",
  calls: [{ to: account, data: "0x", value: "0x0", label: "Fixture call" }],
  strategies: [],
  summary: ["Fixture plan"],
  createdAt: Date.now(),
  expiresAt: Date.now() + 60_000,
};
const externalSession: ManagedSession = {
  token: "external-token",
  owner: account,
  sessionId: "external-session",
  expiresAt: Date.now() + 60_000,
  mode: "external",
};
const localSession: ManagedSession = {
  token: "local-token",
  owner: account,
  sessionId: "local-session",
  expiresAt: Date.now() + 60_000,
  mode: "local-development",
  maxFeeWei: "1000000000000000",
};

function installProvider(request: Provider["request"]) {
  Object.assign(globalThis, { window: { ethereum: { request } } });
}

function installFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input, init) => handler(String(input), init);
  return () => {
    globalThis.fetch = previous;
  };
}

test("the external executor constructs a browser plan and preserves atomic wallet confirmation", async () => {
  const requests: { method: string; params?: unknown[] }[] = [];
  installProvider(async (request) => {
    requests.push(request);
    if (request.method === "eth_chainId") return "0xa4b1";
    if (request.method === "eth_accounts") return [account];
    if (request.method === "wallet_getCapabilities")
      return { "0xa4b1": { atomic: { status: "supported" } } };
    if (request.method === "wallet_sendCalls") return { id: "browser-batch" };
    throw new Error(`Unexpected wallet method ${request.method}`);
  });
  const restoreFetch = installFetch(async (url, init) => {
    assert.equal(url, "/api/plan");
    assert.equal(
      init?.headers && (init.headers as Record<string, string>).Authorization,
      "Bearer external-token",
    );
    assert.deepEqual(JSON.parse(String(init?.body)), {
      basket,
      account,
    });
    return Response.json(plan);
  });
  try {
    const prepared = await walletExecutor("external").prepare(
      externalSession,
      basket,
    );
    const submitted = await walletExecutor("external").submit(
      externalSession,
      prepared,
    );
    assert.equal(submitted.id, "browser-batch");
    assert.deepEqual(submitted.status, { state: "pending" });
    const call = requests.find(
      (request) => request.method === "wallet_sendCalls",
    );
    assert.equal(
      (call?.params?.[0] as { atomicRequired?: boolean }).atomicRequired,
      true,
    );
  } finally {
    restoreFetch();
  }
});

test("the local executor routes review and confirmed submission through the server signer", async () => {
  installProvider(async () => {
    throw new Error("The local executor must not use a browser wallet.");
  });
  const seen: { url: string; body: unknown; authorization?: string }[] = [];
  const restoreFetch = installFetch(async (url, init) => {
    seen.push({
      url,
      body: JSON.parse(String(init?.body)),
      authorization: (init?.headers as Record<string, string>).authorization,
    });
    if (url === "/api/dev-wallet/plan")
      return Response.json({
        id: "local-review",
        digest: "11".repeat(32),
        plan,
        maxFeeWei: localSession.maxFeeWei,
      });
    if (url === "/api/dev-wallet/execute")
      return Response.json({
        id: "local-transaction",
        state: "confirmed",
        transactionHash: `0x${"2".repeat(64)}`,
      });
    throw new Error(`Unexpected request ${url}`);
  });
  try {
    const prepared = await walletExecutor("local-development").prepare(
      localSession,
      basket,
    );
    const submitted = await walletExecutor("local-development").submit(
      localSession,
      prepared,
    );
    assert.deepEqual(seen, [
      {
        url: "/api/dev-wallet/plan",
        body: { basket },
        authorization: "Bearer local-token",
      },
      {
        url: "/api/dev-wallet/execute",
        body: {
          id: "local-review",
          digest: "11".repeat(32),
          confirmed: true,
        },
        authorization: "Bearer local-token",
      },
    ]);
    assert.deepEqual(submitted, {
      id: "local-transaction",
      status: {
        state: "confirmed",
        transactionHash: `0x${"2".repeat(64)}`,
      },
    });
  } finally {
    restoreFetch();
  }
});

test("the managed local executor prepares its lifecycle plan before signing", async () => {
  const lifecyclePlan = {
    id: "lifecycle-plan",
    runGeneration: 7,
  } as LifecyclePlan;
  const seen: { url: string; body: unknown }[] = [];
  const restoreFetch = installFetch(async (url, init) => {
    seen.push({ url, body: JSON.parse(String(init?.body)) });
    if (url === "/api/dev-wallet/lifecycle-plan")
      return Response.json({
        id: "local-managed-review",
        digest: "22".repeat(32),
        plan,
        maxFeeWei: localSession.maxFeeWei,
      });
    if (url === "/api/dev-wallet/execute")
      return Response.json({
        id: "local-managed-transaction",
        state: "pending",
      });
    throw new Error(`Unexpected request ${url}`);
  });
  try {
    const result = await walletExecutor("local-development").submitManaged(
      localSession,
      {
        plan: lifecyclePlan,
        tabSession: "tab-session",
        assertCurrent: () => {},
        externalExecutionVerified: false,
      },
    );
    assert.match(result.notice, /Development signer returned pending/);
    assert.deepEqual(seen, [
      {
        url: "/api/dev-wallet/lifecycle-plan",
        body: {
          planId: "lifecycle-plan",
          context: { sessionId: "tab-session", generation: 7 },
        },
      },
      {
        url: "/api/dev-wallet/execute",
        body: {
          id: "local-managed-review",
          digest: "22".repeat(32),
          confirmed: true,
        },
      },
    ]);
  } finally {
    restoreFetch();
  }
});

test("a local signer rejection reaches the selected executor without browser fallback", async () => {
  installProvider(async () => {
    throw new Error("The local executor must not use a browser wallet.");
  });
  const restoreFetch = installFetch(async (url) => {
    if (url === "/api/dev-wallet/plan")
      return Response.json({
        id: "local-review",
        digest: "11".repeat(32),
        plan,
      });
    if (url === "/api/dev-wallet/execute")
      return Response.json(
        { error: "Local signer rejected the confirmed transaction." },
        { status: 400 },
      );
    throw new Error(`Unexpected request ${url}`);
  });
  try {
    const prepared = await walletExecutor("local-development").prepare(
      localSession,
      basket,
    );
    await assert.rejects(
      () => walletExecutor("local-development").submit(localSession, prepared),
      /Local signer rejected the confirmed transaction/,
    );
  } finally {
    restoreFetch();
  }
});
