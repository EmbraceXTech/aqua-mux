import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import solc from "solc";
import { Address as SdkAddress, HexString } from "@1inch/sdk-core";
import { Order, SwapVMContract, TakerTraits } from "@1inch/swap-vm-sdk";
import {
  encodeAbiParameters,
  decodeAbiParameters,
  encodeFunctionData,
  erc20Abi,
  parseAbi,
  parseEther,
  toHex,
  type Abi,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import { AQUA, SWAP_VM, NATIVE, classicRouter, tokens } from "../lib/config";
import type { Call } from "../lib/model";
import type { LPStrategyConfig } from "../lib/managed/config";
import type { Token } from "../lib/managed/primitives";
import {
  buildLifecyclePlan,
  digest,
  reconcileResiduals,
  type LifecycleDependencies,
  type LifecycleRequest,
} from "../lib/server/lifecycle";
import { readLifecycleSnapshot } from "../lib/server/lifecycle/snapshot";
import {
  aggregationSwapAbi,
  validateFixtureAggregationRoute,
} from "./fixtures/lifecycle-aggregation";
import { aquaLifecycleAbi, wrapCall } from "../lib/server/lifecycle/calls";
import { describeLPPrice } from "../lib/managed-compiler/lp";

export async function verifyManagedLifecycle(context: {
  client: PublicClient;
  owner: Address;
  walletAbi: Abi;
  deployWallet(): Promise<Address>;
  execute(wallet: Address, calls: Call[]): Promise<TransactionReceipt>;
  rpc(method: string, params: unknown[]): Promise<unknown>;
}) {
  const { client, owner, execute, rpc } = context;
  const maker = await context.deployWallet(),
    taker = await context.deployWallet();
  await rpc("anvil_setBalance", [maker, toHex(parseEther("10"))]);
  await rpc("anvil_setBalance", [taker, toHex(parseEther("10"))]);
  const metadata = (symbol: string): Token => {
    const t = tokens(42161).find((t) => t.symbol === symbol)!;
    return { address: t.address, decimals: t.decimals, symbol: t.symbol };
  };
  const base = metadata("WETH"),
    usdc = metadata("USDC"),
    btc = metadata("WBTC"),
    native: Token = { address: NATIVE, decimals: 18, symbol: "ETH" };
  const router = classicRouter(42161);
  const compiled = JSON.parse(
    solc.compile(
      JSON.stringify({
        language: "Solidity",
        sources: {
          "LifecycleSwap.sol": {
            content: readFileSync(
              new URL("./fixtures/LifecycleSwap.sol", import.meta.url),
              "utf8",
            ),
          },
        },
        settings: {
          optimizer: { enabled: true, runs: 200 },
          evmVersion: "prague",
          outputSelection: { "*": { "*": ["evm.deployedBytecode.object"] } },
        },
      }),
    ),
  );
  assert.equal(
    (compiled.errors ?? []).filter(
      (e: { severity: string }) => e.severity === "error",
    ).length,
    0,
  );
  await rpc("anvil_setCode", [
    router,
    `0x${compiled.contracts["LifecycleSwap.sol"].LifecycleSwap.evm.deployedBytecode.object}`,
  ]);
  for (const t of [usdc, btc])
    await rpc("anvil_setCode", [
      t.address,
      `0x${compiled.contracts["LifecycleSwap.sol"].LifecycleToken.evm.deployedBytecode.object}`,
    ]);
  const setup: Call[] = [
    wrapCall(base.address, parseEther("3")),
    {
      to: base.address,
      data: encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [router, parseEther("3")],
      }),
      value: "0x0",
      label: "Fund fixture route",
    },
  ];
  for (const t of [usdc, btc])
    setup.push({
      to: t.address,
      data: encodeFunctionData({
        abi: parseAbi(["function mint(address,uint256)"]),
        functionName: "mint",
        args: [router, 10n ** 15n],
      }),
      value: "0x0",
      label: "Fund fixture paired inventory",
    });
  assert.equal((await execute(maker, setup)).status, "success");
  const broker = <T>(value: T) => ({
    value,
    enforcedBy: "execution-broker" as const,
  });
  const deadline = Number((await client.getBlock()).timestamp + 600n) * 1000;
  const config: LPStrategyConfig = {
    version: 1,
    recipeVersion: 1,
    family: "lp",
    recipeId: "managed-concentrated-lp",
    chainId: 42161,
    maker,
    pairs: [usdc, btc].map((quote, i) => ({
      baseToken: base,
      quoteToken: quote,
      baseAmount: String(parseEther("1")),
      quoteAmount: i ? "2500000" : "2000000000",
      feeBps: i ? 37 : 5,
      openingPrice: {
        baseToken: base.address,
        quoteToken: quote.address,
        numerator: i ? "1" : "2000",
        denominator: i ? "40" : "1",
      },
      range: i
        ? { kind: "full" }
        : {
            kind: "bounded",
            lower: {
              baseToken: base.address,
              quoteToken: quote.address,
              numerator: "1000",
              denominator: "1",
            },
            upper: {
              baseToken: base.address,
              quoteToken: quote.address,
              numerator: "3000",
              denominator: "1",
            },
          },
      programExpiresAt: deadline,
    })),
    policy: {
      id: "fork-policy",
      version: 1,
      intervalMs: broker(60000),
      cooldownMs: broker(0),
      maxActions: broker(10),
      spendBudgets: broker([]),
      gasBudgetWei: broker(String(parseEther("1"))),
      allowedAssets: broker([NATIVE, base.address, usdc.address, btc.address]),
      allowedRoutes: broker([router]),
      maxSlippageBps: broker(50),
      maxReferenceAgeMs: broker(30000),
      expiresAt: broker(Date.now() + 3600000),
      allowedActions: broker([
        "fund-and-open",
        "replace",
        "close",
        "propose-conversion",
      ]),
      triggers: broker({
        rangeExit: true,
        inventoryDriftBps: 500,
        upwardOnly: false,
      }),
    },
  };
  for (const pair of config.pairs) pair.openingPrice = describeLPPrice(pair);
  const deps: LifecycleDependencies = {
    snapshot: readLifecycleSnapshot,
    validateRoute: validateFixtureAggregationRoute,
    verifyRouteProvenance: async () => {},
    quote: async (request) => {
      const minimum =
        request.destination.address !== base.address
          ? BigInt(request.minimumAmountOut)
          : (BigInt(request.amountIn) * 10n ** 18n) /
            (request.source.address === usdc.address ? 2000000000n : 2500000n);
      return {
        call: {
          to: router,
          data: encodeFunctionData({
            abi: aggregationSwapAbi,
            functionName: "swap",
            args: [
              router,
              {
                srcToken: request.source.address,
                dstToken: request.destination.address,
                srcReceiver: router,
                dstReceiver: maker,
                amount: BigInt(request.amountIn),
                minReturnAmount: minimum,
                flags: 0n,
              },
              encodeAbiParameters([{ type: "uint256" }], [minimum + 1n]),
            ],
          }),
          value:
            request.source.address === NATIVE
              ? toHex(BigInt(request.amountIn))
              : "0x0",
          label: "Fixture conversion",
        },
        spender: router,
        amountOut: String(minimum),
        minimumAmountOut: String(minimum),
        quotedAt: Date.now(),
        expiresAt: Date.now() + 30000,
      };
    },
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
    id: "fork-open",
    groupId: "fork-group",
    owner,
    config,
    runGeneration: 1,
    kind: "fund-and-open",
    inventory: [{ token: native, amount: String(parseEther("2")) }],
    funding: {
      token: native,
      amount: String(parseEther("2")),
      purchases: [usdc, btc].map((token, i) => ({
        token,
        amountIn: String(parseEther("0.5")),
        minimumAmountOut: i ? "2500000" : "2000000000",
      })),
    },
    gasReserveWei: String(parseEther("0.1")),
    expiresAt: Date.now() + 120000,
  };
  const erc20Checkpoint = await rpc("evm_snapshot", []);
  assert.equal(
    (await execute(maker, [wrapCall(base.address, parseEther("2"))])).status,
    "success",
  );
  const erc20Opened = await buildLifecyclePlan(
    {
      ...request,
      id: "fork-erc20-open",
      inventory: [{ token: base, amount: String(parseEther("2")) }],
      funding: { ...request.funding!, token: base },
    },
    deps,
  );
  assert.equal((await execute(maker, erc20Opened.calls)).status, "success");
  assert.equal(
    await client.readContract({
      address: base.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [maker],
    }),
    parseEther("1"),
  );
  assert.equal(await rpc("evm_revert", [erc20Checkpoint]), true);
  const opened = await buildLifecyclePlan(request, deps);
  assert.equal((await execute(maker, opened.calls)).status, "success");
  const balance = (t: Token, address = maker) =>
    client.readContract({
      address: t.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
  const inventory = async () =>
    Promise.all(
      [base, usdc, btc].map(async (token) => ({
        token,
        amount: String(await balance(token)),
      })),
    );
  assert.equal(await balance(base), parseEther("1"));
  const residuals = reconcileResiduals(
    opened.conservativeInventoryAfter.filter((i) => i.token.address !== NATIVE),
    [],
    await inventory(),
  );
  assert.equal(
    residuals.find((i) => i.token.address === usdc.address)?.residual,
    "1",
  );
  const order = Order.decode(new HexString(opened.registrations[0].strategy));
  const swap = (tokenIn: Token, tokenOut: Token, amount: bigint) => ({
    order,
    tokenIn: new SdkAddress(tokenIn.address),
    tokenOut: new SdkAddress(tokenOut.address),
    amount,
    takerTraits: TakerTraits.default().with({
      threshold: 1n,
      deadline: BigInt(deadline / 1000 + 100),
    }),
  });
  const buy = swap(base, usdc, parseEther("0.01"));
  const probe = await client.call({
    account: owner,
    to: SWAP_VM,
    data: SwapVMContract.encodeQuoteCallData(
      swap(base, usdc, 1000000000000n),
    ).toString() as Hex,
  });
  const [, probeOut] = decodeAbiParameters(
    [{ type: "uint256" }, { type: "uint256" }, { type: "bytes32" }],
    probe.data!,
  );
  const price = config.pairs[0].openingPrice;
  const spotMinimumUnitOutput =
    (BigInt(price.numerator) * 9995n) / (BigInt(price.denominator) * 10000n);
  assert.ok(
    probeOut <= spotMinimumUnitOutput && spotMinimumUnitOutput - probeOut <= 1n,
    "Fork quote must agree with reviewed virtual spot within one output unit and price impact.",
  );
  assert.equal(
    (
      await execute(taker, [
        wrapCall(base.address, parseEther("0.01")),
        {
          to: base.address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [SWAP_VM, parseEther("0.01")],
          }),
          value: "0x0",
          label: "Approve fixture fill",
        },
        {
          to: SWAP_VM,
          data: SwapVMContract.encodeSwapCallData(buy).toString() as Hex,
          value: "0x0",
          label: "Fill maker quote out",
        },
      ])
    ).status,
    "success",
  );
  const takerUsdc = await balance(usdc, taker),
    sell = swap(usdc, base, takerUsdc / 2n);
  const beforeReverse = await balance(base);
  assert.equal(
    (
      await execute(taker, [
        {
          to: usdc.address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [SWAP_VM, takerUsdc],
          }),
          value: "0x0",
          label: "Approve reverse fill",
        },
        {
          to: SWAP_VM,
          data: SwapVMContract.encodeSwapCallData(sell).toString() as Hex,
          value: "0x0",
          label: "Fill maker base out",
        },
      ])
    ).status,
    "success",
  );
  assert.ok((await balance(base)) < beforeReverse);
  const previous = opened.registrations.map(({ hash, app, tokens }) => ({
    hash,
    app,
    tokens,
  }));
  // Revalidate exact live reserves after fills, retaining each pair's displayed ratio.
  const current = await inventory();
  for (const pair of config.pairs) {
    pair.baseAmount = current.find(
      (i) => i.token.address === base.address,
    )!.amount;
    pair.quoteAmount = current.find(
      (i) => i.token.address === pair.quoteToken.address,
    )!.amount;
    pair.openingPrice.numerator = String(
      BigInt(pair.quoteAmount) * 10n ** BigInt(base.decimals),
    );
    pair.openingPrice.denominator = String(
      BigInt(pair.baseAmount) * 10n ** BigInt(pair.quoteToken.decimals),
    );
    pair.openingPrice = describeLPPrice(pair);
  }
  const replacement = await buildLifecyclePlan(
    {
      ...request,
      id: "fork-replace",
      config,
      kind: "replace",
      inventory: current,
      funding: undefined,
      previous,
      expiresAt: Date.now() + 120000,
    },
    deps,
  );
  const beforeFailure = await inventory();
  assert.equal(
    (await execute(maker, [...replacement.calls, opened.calls.at(-1)!])).status,
    "reverted",
  );
  assert.deepEqual(await inventory(), beforeFailure);
  for (const old of previous)
    assert.equal(
      (
        await client.readContract({
          address: AQUA,
          abi: aquaLifecycleAbi,
          functionName: "rawBalances",
          args: [maker, SWAP_VM, old.hash, base.address],
        })
      )[1],
      2,
    );
  assert.equal((await execute(maker, replacement.calls)).status, "success");
  const replacementOrder = Order.decode(
    new HexString(replacement.registrations[0].strategy),
  );
  const quoteArgs = { ...buy, order: replacementOrder };
  await rpc("evm_setNextBlockTimestamp", [deadline / 1000]);
  await rpc("evm_mine", []);
  await client.call({
    account: owner,
    to: SWAP_VM,
    data: SwapVMContract.encodeQuoteCallData(quoteArgs).toString() as Hex,
  });
  await rpc("evm_setNextBlockTimestamp", [deadline / 1000 + 1]);
  await rpc("evm_mine", []);
  await assert.rejects(
    client.call({
      account: owner,
      to: SWAP_VM,
      data: SwapVMContract.encodeQuoteCallData(quoteArgs).toString() as Hex,
    }),
  );
  const remaining = replacement.registrations.map(({ hash, app, tokens }) => ({
    hash,
    app,
    tokens,
  }));
  const closeRequest = {
    ...request,
    id: "fork-close",
    kind: "close" as const,
    inventory: await inventory(),
    funding: undefined,
    previous: remaining,
    expiresAt: Date.now() + 120000,
  };
  const close = await buildLifecyclePlan(closeRequest, {
    ...deps,
    quote: async () => {
      throw new Error("Fixture route outage");
    },
  });
  assert.equal(close.calls.length, 2);
  const converted = await buildLifecyclePlan(
    {
      ...closeRequest,
      id: "fork-convert",
      kind: "close-and-convert",
      conversion: { targetToken: base, amounts: await inventory() },
    },
    deps,
  );
  assert.equal((await execute(maker, converted.calls)).status, "success");
  assert.equal(await balance(usdc), 0n);
  assert.equal(await balance(btc), 0n);
  for (const old of remaining)
    assert.equal(
      (
        await client.readContract({
          address: AQUA,
          abi: aquaLifecycleAbi,
          functionName: "rawBalances",
          args: [maker, SWAP_VM, old.hash, base.address],
        })
      )[1],
      255,
    );
  return {
    checks: [
      "Asymmetric concentrated bounds use the reviewed virtual spot; deployed quote agrees within one raw output unit, with distinct 5 and 37 bps pair fees.",
      "Two equal ERC20-funded purchases consume and replenish exact router allowances in one successful atomic batch.",
      "Managed native funding buys only shortages, conserves shared WETH once and reconciles excess receipts.",
      "Managed LP fills in both directions; maker base outflow changes the real backing shared with the sibling pair.",
      "Failed final replacement call restores old registrations and exact real inventory; successful replacement links fresh hashes.",
      "Maker program accepts a quote at the exact deadline and rejects it one second later.",
      "Close-only simulation works during route outage; atomic close-and-convert retires both positions and reads back zero paired balances.",
    ],
    registrations: opened.registrations.map((s) => s.hash),
    replacements: replacement.registrations.map((s) => ({
      hash: s.hash,
      replaces: s.replaces,
    })),
    residuals,
    finalInventory: await inventory(),
  };
}
