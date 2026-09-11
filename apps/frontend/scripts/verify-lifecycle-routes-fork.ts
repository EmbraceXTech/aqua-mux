import assert from "node:assert/strict";
import { encodeFunctionData, erc20Abi, parseEther, toHex } from "viem";
import { AQUA, NATIVE, SWAP_VM, classicRouter, tokens } from "../lib/config";
import type { LPStrategyConfig } from "../lib/managed/config";
import type { Token } from "../lib/managed/primitives";
import {
  buildLifecyclePlanWithRoutes,
  digest,
  type LifecycleDependencies,
  type LifecycleRequest,
} from "../lib/server/lifecycle";
import { quoteLifecycleRoute } from "../lib/server/lifecycle/routes";
import { readLifecycleSnapshot } from "../lib/server/lifecycle/snapshot";
import { aquaLifecycleAbi } from "../lib/server/lifecycle/calls";
import { compileTransparentCall } from "../lib/server/route-policy/calldata";
import type { verifyManagedLifecycle } from "./verify-managed-lifecycle";

/** Real forked pool/router/token code; only the wallet and its native funding are fixtures. */
export async function verifyLifecycleRoutesFork(
  context: Parameters<typeof verifyManagedLifecycle>[0],
) {
  const { client, owner, execute, rpc } = context;
  const maker = await context.deployWallet();
  await rpc("anvil_setBalance", [maker, toHex(parseEther("1"))]);
  const metadata = (symbol: string): Token => {
    const t = tokens(42161).find((t) => t.symbol === symbol)!;
    return { address: t.address, decimals: t.decimals, symbol };
  };
  const base = metadata("WETH"),
    quote: Token = {
      address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
      decimals: 6,
      symbol: "USDT",
    },
    native: Token = { address: NATIVE, decimals: 18, symbol: "ETH" };
  const amountIn = String(parseEther("0.01"));
  const initialQuote = await quoteLifecycleRoute({
    chainId: 42161,
    maker,
    source: native,
    destination: quote,
    amountIn,
    minimumAmountOut: "1",
    slippageBps: 50,
  });
  const broker = <T>(value: T) => ({
    value,
    enforcedBy: "execution-broker" as const,
  });
  const config: LPStrategyConfig = {
    version: 1,
    family: "lp",
    recipeId: "wide-range-lp",
    recipeVersion: 1,
    chainId: 42161,
    maker,
    pairs: [
      {
        baseToken: base,
        quoteToken: quote,
        baseAmount: amountIn,
        quoteAmount: initialQuote.minimumAmountOut,
        feeBps: 5,
        openingPrice: {
          baseToken: base.address,
          quoteToken: quote.address,
          numerator: String(BigInt(initialQuote.minimumAmountOut) * 10n ** 18n),
          denominator: String(BigInt(amountIn) * 10n ** 6n),
        },
        range: { kind: "full" },
      },
    ],
    policy: {
      id: "transparent-fork-policy",
      version: 1,
      intervalMs: broker(60000),
      cooldownMs: broker(0),
      maxActions: broker(10),
      spendBudgets: broker([]),
      gasBudgetWei: broker(String(parseEther("0.1"))),
      allowedAssets: broker([NATIVE, base.address, quote.address]),
      allowedRoutes: broker([classicRouter(42161)]),
      maxSlippageBps: broker(50),
      maxReferenceAgeMs: broker(30000),
      expiresAt: broker(Date.now() + 3600000),
      allowedActions: broker(["fund-and-open", "close", "propose-conversion"]),
      triggers: broker({
        rangeExit: false,
        inventoryDriftBps: 500,
        upwardOnly: false,
      }),
    },
  };
  const deps: LifecycleDependencies = {
    snapshot: readLifecycleSnapshot,
    quote: quoteLifecycleRoute,
    simulate: async (plan) => {
      const block = await client.getBlock();
      const data = encodeFunctionData({
        abi: context.walletAbi,
        functionName: "execute",
        args: [
          plan.calls.map((c) => ({
            to: c.to,
            data: c.data,
            value: BigInt(c.value),
          })),
        ],
      });
      await client.call({
        account: owner,
        to: maker,
        data,
        blockNumber: block.number,
      });
      const gas = await client.estimateGas({ account: owner, to: maker, data });
      return {
        success: true,
        atomic: true,
        callsDigest: digest(plan.calls),
        blockNumber: String(block.number),
        blockHash: block.hash,
        simulatedAt: Date.now(),
        estimatedGasWei: String(gas * (await client.getGasPrice())),
      };
    },
  };
  const request: LifecycleRequest = {
    id: "transparent-open",
    groupId: "transparent-group",
    owner,
    config,
    runGeneration: 1,
    kind: "fund-and-open",
    inventory: [{ token: native, amount: String(parseEther("0.02")) }],
    funding: {
      token: native,
      amount: String(parseEther("0.02")),
      purchases: [
        {
          token: quote,
          amountIn,
          minimumAmountOut: initialQuote.minimumAmountOut,
        },
      ],
    },
    gasReserveWei: String(parseEther("0.1")),
    expiresAt: Date.now() + 120000,
  };
  const opened = await buildLifecyclePlanWithRoutes(request, deps);
  assert.equal(opened.plan.routesDigest, digest(opened.routes));
  const openReceipt = await execute(maker, opened.plan.calls);
  assert.equal(openReceipt.status, "success");
  const balance = (token: Token) =>
    client.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [maker],
    });
  assert.equal(await balance(base), parseEther("0.01"));
  assert.ok(
    (await balance(quote)) >=
      BigInt(
        opened.plan.registrations[0].amounts[
          opened.plan.registrations[0].tokens.indexOf(quote.address)
        ],
      ),
  );
  const inventory = async () =>
    Promise.all(
      [base, quote].map(async (token) => ({
        token,
        amount: String(await balance(token)),
      })),
    );
  const previous = opened.plan.registrations.map(({ hash, app, tokens }) => ({
    hash,
    app,
    tokens,
  }));
  const beforeConversionTokens = await inventory();
  const selected = [
    { token: native, amount: String(parseEther("0.001")) },
    ...beforeConversionTokens,
  ];
  const converted = await buildLifecyclePlanWithRoutes(
    {
      ...request,
      id: "transparent-convert",
      kind: "close-and-convert",
      funding: undefined,
      previous,
      inventory: selected,
      conversion: { targetToken: base, amounts: selected },
      expiresAt: Date.now() + 120000,
    },
    deps,
  );
  const route = converted.routes[0].route;
  assert.ok(route.request);
  const impossible = compileTransparentCall(route.request, String(2n ** 100n));
  const failingCalls = converted.plan.calls.map((call) =>
    call.data === route.call.data ? impossible : call,
  );
  const failedReceipt = await execute(maker, failingCalls);
  assert.equal(failedReceipt.status, "reverted");
  assert.deepEqual(await inventory(), beforeConversionTokens);
  assert.equal(
    (
      await client.readContract({
        address: AQUA,
        abi: aquaLifecycleAbi,
        functionName: "rawBalances",
        args: [maker, SWAP_VM, previous[0].hash, base.address],
      })
    )[1],
    2,
  );
  const closeReceipt = await execute(maker, converted.plan.calls);
  assert.equal(closeReceipt.status, "success");
  assert.equal(await balance(quote), 0n);
  assert.ok((await balance(base)) > parseEther("0.01"));
  assert.ok(
    converted.plan.calls.some(
      (c) =>
        c.to === base.address &&
        c.data === "0xd0e30db0" &&
        BigInt(c.value) === parseEther("0.001"),
    ),
  );
  assert.equal(
    (
      await client.readContract({
        address: AQUA,
        abi: aquaLifecycleAbi,
        functionName: "rawBalances",
        args: [maker, SWAP_VM, previous[0].hash, base.address],
      })
    )[1],
    255,
  );
  return {
    checks: [
      "Verified transparent 1inch native-to-USDT route funds and opens an Aqua LP against unchanged forked pool/router/token code.",
      "Failed final transparent conversion minimum restores active registration and exact selected balances; successful retry closes and reads back zero USDT.",
    ],
    poolId: initialQuote.policy.poolId,
    routeDigests: [opened.plan.routesDigest, converted.plan.routesDigest],
    transactionHashes: [
      openReceipt.transactionHash,
      failedReceipt.transactionHash,
      closeReceipt.transactionHash,
    ],
    finalInventory: await inventory(),
  };
}
