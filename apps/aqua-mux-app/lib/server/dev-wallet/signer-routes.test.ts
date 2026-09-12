import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { keccak256, type Address, type Hex } from "viem";
import { compileTransparentCall, selectPool } from "../route-policy/calldata";
import { routerDeployments } from "../route-policy/deployments";
import runtime from "../route-policy/fixtures/arbitrum-runtime.json";
import type { VerifiedRoute } from "../route-policy/types";
import type { DevBatchPlan } from "./batch";
import { devAccount } from "./config";
import { implementationCode } from "./implementation-fixture";
import { implementation, signDevBatch } from "./signer";

const source = {
  address: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1" as const,
  decimals: 18,
  symbol: "WETH",
};
const destination = {
  address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831" as const,
  decimals: 6,
  symbol: "USDC",
};

function routePlan(account: Address): DevBatchPlan {
  const request = {
    chainId: 42161,
    maker: account,
    source: source.address,
    destination: destination.address,
    amountIn: "1000000000000000",
    minimumAmountOut: "1",
    slippageBps: 100,
  };
  const route: VerifiedRoute = {
    request: { ...request },
    call: compileTransparentCall(request, "990000"),
    spender: routerDeployments[42161].address,
    amountIn: request.amountIn,
    amountOut: "1000000",
    minimumAmountOut: "990000",
    quotedAt: Date.now(),
    expiresAt: Date.now() + 30_000,
    policy: { version: 1, poolId: selectPool(request).id },
  };
  return {
    account,
    chainId: 42161,
    mode: "swap",
    calls: [route.call],
    createdAt: route.quotedAt,
    expiresAt: route.expiresAt,
    summary: [],
    strategies: [],
    assetMetadata: [source, destination],
    minimumReceipts: [{ token: destination, amount: route.minimumAmountOut }],
    verifiedRoutes: [{ request, route }],
  };
}

test("route expiry and changed deployment refuse signing or broadcast before the journal", async () => {
  const originalEnvironment = { ...process.env };
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  const router = routerDeployments[42161].address;
  const wrappedImplementation =
    routerDeployments[42161].wrappedImplementation!.address;
  const pool = selectPool(routePlan(router).verifiedRoutes![0].request).address;
  let changedCode: string | undefined;
  let chainId = 42161;
  let decimalsChanged = false;
  let implementationChanged = false;
  let broadcasts = 0;
  let journalWrites = 0;
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const rpc = JSON.parse(body);
    const address = String(rpc.params?.[0]).toLowerCase();
    let result: unknown;
    switch (rpc.method) {
      case "eth_chainId":
        result = `0x${chainId.toString(16)}`;
        break;
      case "eth_getCode":
        result =
          address === changedCode
            ? "0x6000"
            : address === implementation.toLowerCase()
              ? implementationCode
              : address === router
                ? runtime.router
                : address === pool
                  ? runtime.pool
                  : address === source.address
                    ? runtime.wrapped
                    : address === wrappedImplementation
                      ? runtime.wrappedImplementation
                      : address === destination.address
                        ? "0x6000"
                        : "0x";
        break;
      case "eth_getStorageAt":
        result = implementationChanged
          ? `0x${"00".repeat(32)}`
          : runtime.wrappedImplementationSlotValue;
        break;
      case "eth_getTransactionCount":
        result = "0x7";
        break;
      case "eth_estimateGas":
        result = "0x186a0";
        break;
      case "eth_call": {
        const call = rpc.params[0];
        const decimals = call.to.toLowerCase() === source.address ? 18 : 6;
        result =
          call.data === "0x313ce567"
            ? `0x${(decimalsChanged ? 9 : decimals).toString(16).padStart(64, "0")}`
            : "0x";
        break;
      }
      case "eth_gasPrice":
        result = "0x3b9aca00";
        break;
      case "eth_getBalance":
        result = "0xde0b6b3a7640000";
        break;
      case "eth_sendRawTransaction":
        broadcasts++;
        result = keccak256(rpc.params[0] as Hex);
        break;
      default:
        response.writeHead(400).end();
        return;
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    Object.assign(process.env, {
      NODE_ENV: "development",
      AQUAMUX_DEV_WALLET: "true",
      // Public deterministic fixture only. Never load .env or contact a real RPC.
      PRIVATE_KEY: "01".repeat(32),
      ARBITRUM_RPC_URL: `http://127.0.0.1:${address.port}`,
      AQUAMUX_DEV_WALLET_MAX_FEE_WEI: "1000000000000000",
    });
    const account = devAccount().address;
    const journal = () => {
      journalWrites++;
    };
    const changes = [
      {
        change: () => {
          now += 30_001;
        },
        error: /expired|stale/,
      },
      ...[router, pool, source.address, wrappedImplementation].map(
        (address) => ({
          change: () => {
            changedCode = address;
          },
          error: /deployment code/,
        }),
      ),
      {
        change: () => {
          implementationChanged = true;
        },
        error: /wrapped-token implementation/,
      },
      {
        change: () => {
          chainId = 56;
        },
        error: /chain/,
      },
      {
        change: () => {
          decimalsChanged = true;
        },
        error: /decimals changed/,
      },
    ];
    for (const stage of ["sign", "broadcast"]) {
      for (const { change, error } of changes) {
        changedCode = undefined;
        chainId = 42161;
        decimalsChanged = false;
        implementationChanged = false;
        const plan = routePlan(account);
        if (stage === "sign") {
          change();
          await assert.rejects(() => signDevBatch(plan, () => {}), error);
        } else {
          const signed = await signDevBatch(plan, () => {});
          change();
          await assert.rejects(() => signed.broadcast(journal), error);
        }
        assert.equal(journalWrites, 0);
        assert.equal(broadcasts, 0);
      }
    }
    changedCode = undefined;
    chainId = 42161;
    decimalsChanged = false;
    implementationChanged = false;
    const accepted = await signDevBatch(routePlan(account), () => {});
    assert.equal(await accepted.broadcast(journal), accepted.hash);
    assert.equal(journalWrites, 1);
    assert.equal(broadcasts, 1);
  } finally {
    Date.now = originalNow;
    process.env = originalEnvironment;
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
