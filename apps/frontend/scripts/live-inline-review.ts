import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { tokens } from "../lib/config";

const base = process.env.AQUAMUX_REVIEW_URL ?? "http://127.0.0.1:3100";
const account = privateKeyToAccount(generatePrivateKey());
const origin = new URL(base).origin;

type Session = { token: string; owner: string };

async function request<T>(
  path: string,
  value?: unknown,
  session?: Session,
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method: value === undefined ? "GET" : "POST",
    headers: {
      Origin: origin,
      ...(session ? { Authorization: `Bearer ${session.token}` } : {}),
      ...(value === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(value === undefined ? {} : { body: JSON.stringify(value) }),
    signal: AbortSignal.timeout(150_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error("local_review_request_failed");
  return body as T;
}

try {
  const challenge = await request<{ id: string; message: string }>(
    "/api/auth/challenge",
    { owner: account.address, chainId: 1 },
  );
  const session = await request<Session>("/api/auth/verify", {
    id: challenge.id,
    signature: await account.signMessage({ message: challenge.message }),
  });
  const catalog = tokens(1);
  const select = (symbol: string) => {
    const token = catalog.find((item) => item.symbol === symbol);
    assert.ok(token, `Missing ${symbol} in the Ethereum token catalog.`);
    return {
      address: token.address,
      decimals: token.decimals,
      symbol: token.symbol,
    };
  };
  const weth = select("WETH");
  const usdc = select("USDC");
  const limit = <T>(value: T) => ({
    value,
    enforcedBy: "execution-broker" as const,
  });
  const created = await request<{
    group: { id: string };
    bot: { runGeneration: number };
  }>(
    "/api/managed/groups",
    {
      config: {
        version: 1,
        recipeVersion: 1,
        family: "lp",
        recipeId: "wide-range-lp",
        chainId: 1,
        maker: session.owner,
        pairs: [
          {
            baseToken: weth,
            quoteToken: usdc,
            baseAmount: "1",
            quoteAmount: "1",
            feeBps: 5,
            openingPrice: {
              baseToken: weth.address,
              quoteToken: usdc.address,
              numerator: "1",
              denominator: "1",
            },
            range: { kind: "full" },
          },
        ],
        policy: {
          id: randomUUID(),
          version: 1,
          intervalMs: limit(60_000),
          cooldownMs: limit(60_000),
          maxActions: limit(0),
          spendBudgets: limit([]),
          gasBudgetWei: limit("0"),
          allowedAssets: limit([weth.address, usdc.address]),
          allowedRoutes: limit([]),
          maxSlippageBps: limit(100),
          maxReferenceAgeMs: limit(120_000),
          expiresAt: limit(Date.now() + 30 * 60_000),
          allowedActions: limit(["hold"]),
          triggers: limit({
            rangeExit: false,
            inventoryDriftBps: 0,
            upwardOnly: false,
          }),
        },
      },
      mode: "manual",
    },
    session,
  );
  const tabSession = randomUUID();
  const started = await request<{ bot: { runGeneration: number } }>(
    "/api/managed/groups/" + created.group.id + "/bot",
    { action: "start", sessionId: tabSession },
    session,
  );
  const response = await request<{
    review: {
      status: string;
      result?: { decision: string };
      provider: string;
      model: string;
      runtimeVersion: string;
      usage: { cost: string | null };
    };
  }>(
    "/api/managed/groups/" + created.group.id + "/reviews",
    {
      sessionId: tabSession,
      generation: started.bot.runGeneration,
      idempotencyKey: randomUUID(),
    },
    session,
  );
  assert.equal(response.review.status, "succeeded");
  assert.equal(response.review.result?.decision, "hold");
  console.log(
    JSON.stringify({
      passed: true,
      request: "synthetic zero-balance wallet and read-only Ethereum snapshot",
      publicTransactions: 0,
      review: {
        status: response.review.status,
        decision: response.review.result.decision,
        provider: response.review.provider,
        model: response.review.model,
        runtimeVersion: response.review.runtimeVersion,
        cost: response.review.usage.cost,
      },
    }),
  );
} catch {
  console.log(
    JSON.stringify({ passed: false, failure: "local_review_check_failed" }),
  );
  process.exitCode = 1;
}
