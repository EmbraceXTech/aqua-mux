import { verifyProxyUpgrade } from "./fixtures/proxy-upgrade";
import { createExternalConfig } from "./fixtures/external-config";
import { createExternalExecution } from "./fixtures/external-execution";
import { verifyReplacementRollback } from "./fixtures/lifecycle-rollback";
import { verifyResolverFills } from "./fixtures/resolver-fills";
import { verifyDevSignerExecution } from "./fixtures/dev-signer-execution";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { erc20Abi, parseEther, toHex, type Address } from "viem";
import { controlledFork } from "./fixtures/controlled-fork";
import {
  AQUA,
  NATIVE,
  classicRouter,
  networks,
  tokens,
  wrapped,
} from "../lib/config";
import { planDigest, type BotRun, type Token } from "../lib/managed";
import {
  buildLifecyclePlanWithRoutes,
  digest,
  type LifecycleRequest,
} from "../lib/server/lifecycle";
import { quoteLifecycleRoute } from "../lib/server/lifecycle/routes";
import { readLifecycleSnapshot } from "../lib/server/lifecycle/snapshot";
import { simulateLifecyclePlan } from "../lib/server/dev-wallet/simulation";
import { ManagedStore } from "../lib/server/store";
import { confirmManagedPlan } from "../lib/server/managed-service/execution";
import { prepareExternalExecution } from "../lib/server/external-adapter/execution";
import { encodeDevBatch } from "../lib/server/dev-wallet/batch";
import { delegatedAccountCode } from "../lib/server/external-adapter/account";

process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
const results: unknown[] = [];
const ethereumOnly = process.argv.includes("--ethereum");
const robinhoodOnly = process.argv.includes("--robinhood");
const assetProvenance = process.argv.includes("--asset-provenance");
if (assetProvenance && !robinhoodOnly)
  throw new Error(
    "Asset provenance probe requires the isolated Robinhood scenario.",
  );
const proxyUpgrade = process.argv.includes("--proxy-upgrade");
const indirectDependency = process.argv.includes("--indirect");
if (proxyUpgrade && !ethereumOnly)
  throw new Error(
    "Proxy upgrade probe requires the isolated Ethereum scenario.",
  );
const scenarios = ethereumOnly
  ? [{ chainId: 1, bridged: false }]
  : robinhoodOnly
    ? [{ chainId: 4663, bridged: false }]
    : [
        { chainId: 42161, bridged: false },
        { chainId: 56, bridged: false },
        { chainId: 4663, bridged: false },
        { chainId: 42161, bridged: true },
      ];
for (const { chainId, bridged } of scenarios) {
  const setting = networks.find((network) => network.id === chainId)!;
  const upstream = process.env[setting.env]!;
  const fork = await controlledFork(chainId, upstream);
  process.env[setting.env] = fork.url;
  const store = new ManagedStore(":memory:");
  const storeGlobal = globalThis as typeof globalThis & {
    aquamuxManagedStore?: ManagedStore;
  };
  const previousStore = storeGlobal.aquamuxManagedStore;
  storeGlobal.aquamuxManagedStore = store;
  try {
    const maker = fork.account.address.toLowerCase() as Address;
    await fork.request("anvil_setBalance", [maker, toHex(parseEther("2"))]);
    const native: Token = {
      address: NATIVE,
      decimals: 18,
      symbol: setting.symbol,
    };
    const wrap = wrapped(chainId);
    const base: Token = {
      address: wrap.address,
      decimals: wrap.decimals,
      symbol: wrap.symbol,
    };
    const quotes: Token[] =
      chainId === 42161
        ? [
            {
              address: bridged
                ? "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8"
                : "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
              decimals: 6,
              symbol: bridged ? "USDC.e" : "USDC",
            },
            {
              address: "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9",
              decimals: 6,
              symbol: "USDT",
            },
          ]
        : tokens(chainId)
            .filter((token) =>
              (chainId === 4663 ? ["USDG", "PONS"] : ["USDC", "USDT"]).includes(
                token.symbol,
              ),
            )
            .map(({ address, decimals, symbol }) => ({
              address,
              decimals,
              symbol,
            }));
    const amountIn = parseEther(
      chainId === 4663 ? "0.00005" : "0.001",
    ).toString();
    const initial = [];
    for (const destination of quotes)
      initial.push(
        await quoteLifecycleRoute({
          chainId,
          maker,
          source: native,
          destination,
          amountIn,
          minimumAmountOut: "1",
          slippageBps: 100,
        }),
      );
    const config = createExternalConfig({
      chainId,
      maker,
      base,
      quotes,
      amountIn,
      initial,
    });
    if (proxyUpgrade && indirectDependency) {
      const hash = await fork.wallet.writeContract({
        address: quotes[0].address,
        abi: erc20Abi,
        functionName: "approve",
        args: [AQUA, BigInt(initial[0].minimumAmountOut)],
      });
      await fork.rpc.waitForTransactionReceipt({ hash });
    }
    const groupId = `external-fork-${chainId}`;
    store.put(
      "group",
      {
        id: groupId,
        owner: maker,
        maker,
        chainId,
        config,
        state: "draft",
        inventory: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      maker,
    );
    const bot: BotRun = {
      id: `bot-${chainId}`,
      owner: maker,
      groupId,
      mode: "manual",
      state: "idle",
      intervalMs: 60000,
      nextDueAt: Date.now(),
      runGeneration: 1,
      policyId: config.policy.id,
      stopReason: null,
      lease: null,
    };
    store.put("bot", bot, maker);
    const request: LifecycleRequest = {
      id: `open-${chainId}`,
      groupId,
      owner: maker,
      config,
      runGeneration: 1,
      kind: "fund-and-open",
      inventory: [{ token: native, amount: parseEther("0.004").toString() }],
      funding: {
        token: native,
        amount: parseEther("0.004").toString(),
        purchases: quotes.map((token, index) => ({
          token,
          amountIn,
          minimumAmountOut: initial[index].minimumAmountOut,
        })),
      },
      gasReserveWei: parseEther("0.1").toString(),
      expiresAt: Date.now() + 120000,
    };
    const deps = {
      snapshot: async (request: LifecycleRequest) => {
        // An idle fork does not receive the public chain's advancing block headers.
        await fork.request("evm_mine", []);
        return readLifecycleSnapshot(request);
      },
      quote: quoteLifecycleRoute,
      simulate: simulateLifecyclePlan,
    };
    const opened = await buildLifecyclePlanWithRoutes(request, deps);
    const save = (bundle: typeof opened) => {
      store.put("plan", bundle.plan, maker);
      store.putDocument("plan-configuration", bundle.plan.id, maker, config);
      store.putDocument("plan-context", bundle.plan.id, maker, {
        requiresLease: false,
        sessionId: null,
        generation: 1,
        reviewId: null,
      });
      store.putDocument("plan-routes", bundle.plan.id, maker, {
        digest: planDigest(bundle.plan),
        routes: bundle.routes,
      });
      confirmManagedPlan(
        {
          owner: maker,
          groupId,
          planId: bundle.plan.id,
          digest: planDigest(bundle.plan),
        },
        store,
      );
    };
    save(opened);
    const input = {
      owner: maker,
      groupId,
      planId: opened.plan.id,
      idempotencyKey: `first-${chainId}`,
    };
    await assert.rejects(
      prepareExternalExecution(input, store),
      /not delegated/,
    );
    assert.equal(store.list("transaction", maker, groupId).length, 0);
    const localSigner = await verifyDevSignerExecution(
      fork,
      opened.plan,
      store,
    );
    process.env[setting.env] = "http://127.0.0.1:1";
    await assert.rejects(prepareExternalExecution(input, store), {
      code: "external_preflight_unavailable",
      status: 409,
    });
    assert.equal(store.list("transaction", maker, groupId).length, 0);
    process.env[setting.env] = fork.url;
    await fork.request("anvil_setCode", [maker, delegatedAccountCode]);
    const { execute, methods } = createExternalExecution(fork, store, input);
    if (proxyUpgrade) {
      await verifyProxyUpgrade({
        fork,
        store,
        input,
        plan: opened.plan,
        token: quotes[0].address,
        execute,
        indirectDependency,
        beforeSigning: process.argv.includes("--proxy-pointer-before-signing"),
        expectedProof: !process.argv.includes("--expect-unverified"),
      });
      continue;
    }
    const openReceipt = await execute(opened.plan.id);
    if (process.argv.includes("--review-observations")) {
      const { verifyReviewObservations } =
        await import("./fixtures/review-observations");
      await verifyReviewObservations(fork, store, maker, groupId);
      continue;
    }
    const fills = await verifyResolverFills(
      fork,
      opened.plan,
      base,
      quotes[0],
      BigInt(amountIn) / 20n,
    );
    const balances = [];
    for (const token of [base, ...quotes])
      balances.push({
        token,
        amount: String(
          await fork.rpc.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [maker],
          }),
        ),
      });
    for (const pair of config.pairs) {
      pair.baseAmount = balances.find(
        (balance) => balance.token.address === base.address,
      )!.amount;
      pair.quoteAmount = balances.find(
        (balance) => balance.token.address === pair.quoteToken.address,
      )!.amount;
      pair.openingPrice.numerator = String(
        BigInt(pair.quoteAmount) * 10n ** BigInt(base.decimals),
      );
      pair.openingPrice.denominator = String(
        BigInt(pair.baseAmount) * 10n ** BigInt(pair.quoteToken.decimals),
      );
    }
    store.put(
      "group",
      { ...store.get("group", groupId, maker)!, config },
      maker,
    );
    const replacementRequest: LifecycleRequest = {
      ...request,
      id: `replace-${chainId}`,
      config,
      kind: "replace",
      funding: undefined,
      inventory: balances,
      previous: opened.plan.registrations.map(({ hash, app, tokens }) => ({
        hash,
        app,
        tokens,
      })),
      expiresAt: Date.now() + 120000,
    };
    if (assetProvenance) {
      const { verifyRoutelessProvenance } =
        await import("./fixtures/routeless-provenance");
      await verifyRoutelessProvenance(
        fork,
        replacementRequest,
        deps,
        openReceipt.transactionHash,
        save,
        execute,
      );
      continue;
    }
    const replaced = await buildLifecyclePlanWithRoutes(
      replacementRequest,
      deps,
    );
    const replacementRollback = await verifyReplacementRollback(
      fork,
      opened.plan,
      replaced.plan,
      [base, ...quotes],
    );
    save(replaced);
    const replacementReceipt = await execute(replaced.plan.id);
    for (const old of opened.plan.registrations)
      assert.equal(
        store
          .list("strategy", maker, groupId)
          .find((strategy) => strategy.hash === old.hash)?.state,
        "docked",
      );
    const closed = await buildLifecyclePlanWithRoutes(
      {
        ...request,
        id: `close-${chainId}`,
        kind: bridged ? "close" : "close-and-convert",
        funding: undefined,
        inventory: balances,
        previous: replaced.plan.registrations.map(({ hash, app, tokens }) => ({
          hash,
          app,
          tokens,
        })),
        conversion: bridged
          ? undefined
          : { targetToken: base, amounts: balances, unwrap: true },
        expiresAt: Date.now() + 120000,
      },
      deps,
    );
    save(closed);
    const closeReceipt = await execute(closed.plan.id, true);
    let separateConversionHash = null;
    if (bridged) {
      const conversionRequest: LifecycleRequest = {
        ...request,
        id: `conversion-after-close-${chainId}`,
        kind: "close-and-convert",
        funding: undefined,
        previous: [],
        inventory: balances,
        conversion: { targetToken: base, amounts: balances, unwrap: true },
        expiresAt: Date.now() + 120000,
      };
      await assert.rejects(
        buildLifecyclePlanWithRoutes(
          {
            ...conversionRequest,
            inventory: [],
            conversion: { ...conversionRequest.conversion!, amounts: [] },
          },
          deps,
        ),
        /explicit positive inventory/,
      );
      const conversion = await buildLifecyclePlanWithRoutes(
        conversionRequest,
        deps,
      );
      assert.equal(conversion.plan.retirements.length, 0);
      assert.equal(conversion.plan.registrations.length, 0);
      save(conversion);
      separateConversionHash = (await execute(conversion.plan.id))
        .transactionHash;
    }
    const wrappedBeforeRollback = await fork.rpc.readContract({
      address: base.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [maker],
    });
    const failedHash = await fork.wallet.sendTransaction({
      to: maker,
      data: encodeDevBatch([
        {
          to: base.address,
          data: "0xd0e30db0",
          value: toHex(1000000000000n),
          label: "Rollback fixture deposit",
        },
        {
          to: classicRouter(chainId),
          data: "0xdeadbeef",
          value: "0x0",
          label: "Intentional invalid nested call",
        },
      ]),
      gas: 1000000n,
    });
    const failedReceipt = await fork.rpc.waitForTransactionReceipt({
      hash: failedHash,
    });
    assert.equal(failedReceipt.status, "reverted");
    assert.equal(
      await fork.rpc.readContract({
        address: base.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [maker],
      }),
      wrappedBeforeRollback,
    );
    const residual = [];
    for (const token of [base, ...quotes])
      residual.push({
        symbol: token.symbol,
        amount: String(
          await fork.rpc.readContract({
            address: token.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [maker],
          }),
        ),
      });
    assert.equal(
      methods.filter((method) => method === "eth_signTransaction").length,
      bridged ? 4 : 3,
    );
    assert.equal(store.get("group", groupId, maker)!.state, "closed");
    assert.ok(
      store
        .list("strategy", maker, groupId)
        .every((strategy) => strategy.state === "docked"),
    );
    results.push({
      chainId,
      evidence: "controlled EIP1193 provider on isolated fork",
      bridgedUsdc: bridged,
      publicBroadcasts: 0,
      registrations: opened.plan.registrations.length,
      localSigner,
      unavailableRpcRefusedBeforeJournaling: true,
      openHash: openReceipt.transactionHash,
      fills,
      replacementHash: replacementReceipt.transactionHash,
      replacementRollback,
      productionReceiptReconciliation: true,
      closeHash: closeReceipt.transactionHash,
      separateConversionHash,
      callDigest: digest(opened.plan.calls),
      residual,
      unsupportedAccountJournalEntries: 0,
      exactTransactionAndPrestateProof: true,
      ambiguousRelayRecovered: true,
      alteredSignedCalldataRejectedBeforeBroadcast: true,
      expiryAfterWalletApprovalRefused: true,
      directRouteMinimumReceiverAmountCallbackAndExtraCallRefused:
        chainId === 4663,
      atomicRollbackHash: failedReceipt.transactionHash,
    });
    console.log(JSON.stringify(results.at(-1)));
  } finally {
    storeGlobal.aquamuxManagedStore = previousStore;
    store.close();
    fork.stop();
    process.env[setting.env] = upstream;
  }
}
if (
  !proxyUpgrade &&
  !assetProvenance &&
  !process.argv.includes("--review-observations")
)
  writeFileSync(
    new URL(
      ethereumOnly
        ? "../../../references/ethglobal-competitive-analysis/ethereum-adapter-fork.json"
        : robinhoodOnly
          ? "../../../references/ethglobal-competitive-analysis/robinhood-route-policy-fork.json"
          : "../../../references/ethglobal-competitive-analysis/external-adapter-fork.json",
      import.meta.url,
    ),
    JSON.stringify(results, null, 2) + "\n",
  );
