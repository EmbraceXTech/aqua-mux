import { verifyDevSignerExecution } from "./fixtures/dev-signer-execution";
import { rejectAlteredSignedPlans } from "./fixtures/external-adversarial";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { erc20Abi, parseEther, toHex, type Address } from "viem";
import { controlledFork } from "./fixtures/controlled-fork";
import {
  NATIVE,
  classicRouter,
  networks,
  tokens,
  wrapped,
} from "../lib/config";
import {
  planDigest,
  type LPStrategyConfig,
  type BotRun,
  type Token,
} from "../lib/managed";
import {
  buildLifecyclePlanWithRoutes,
  digest,
  type LifecycleRequest,
} from "../lib/server/lifecycle";
import { routePolicyTargets } from "../lib/server/route-policy/route-calls";
import { quoteLifecycleRoute } from "../lib/server/lifecycle/routes";
import { readLifecycleSnapshot } from "../lib/server/lifecycle/snapshot";
import { simulateLifecyclePlan } from "../lib/server/dev-wallet/simulation";
import { ManagedStore } from "../lib/server/store";
import { confirmManagedPlan } from "../lib/server/managed-service/execution";
import {
  prepareExternalExecution,
  relayExternalExecution,
} from "../lib/server/external-adapter/execution";
import { encodeDevBatch } from "../lib/server/dev-wallet/batch";
import { delegatedAccountCode } from "../lib/server/external-adapter/account";
import { verifyManagedTransactionProof } from "../lib/server/managed-service/transaction-proof";
import { signExternalTransaction } from "../lib/external-adapter/sign";

process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
const results: unknown[] = [];
for (const chainId of [42161, 56, 4663]) {
  const setting = networks.find((network) => network.id === chainId)!;
  const upstream = process.env[setting.env]!;
  const fork = await controlledFork(chainId, upstream);
  process.env[setting.env] = fork.url;
  const store = new ManagedStore(":memory:");
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
              address: "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
              decimals: 6,
              symbol: "USDC",
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
    const broker = <T>(value: T) => ({
      value,
      enforcedBy: "execution-broker" as const,
    });
    const config: LPStrategyConfig = {
      version: 1,
      family: "lp",
      recipeId: "wide-range-lp",
      recipeVersion: 1,
      chainId,
      maker,
      pairs: quotes.map((quote, index) => ({
        baseToken: base,
        quoteToken: quote,
        baseAmount: amountIn,
        quoteAmount: initial[index].minimumAmountOut,
        feeBps: 5,
        openingPrice: {
          baseToken: base.address,
          quoteToken: quote.address,
          numerator: String(
            BigInt(initial[index].minimumAmountOut) * 10n ** 18n,
          ),
          denominator: String(BigInt(amountIn) * 10n ** BigInt(quote.decimals)),
        },
        range: { kind: "full" },
      })),
      policy: {
        id: "fork-policy",
        version: 1,
        intervalMs: broker(60000),
        cooldownMs: broker(0),
        maxActions: broker(10),
        spendBudgets: broker([]),
        gasBudgetWei: broker(parseEther("0.1").toString()),
        allowedAssets: broker([
          NATIVE,
          base.address,
          ...quotes.map((t) => t.address),
        ]),
        allowedRoutes: broker(routePolicyTargets(chainId)),
        maxSlippageBps: broker(100),
        maxReferenceAgeMs: broker(30000),
        expiresAt: broker(Date.now() + 3600000),
        allowedActions: broker([
          "fund-and-open",
          "close",
          "propose-conversion",
        ]),
        triggers: broker({
          rangeExit: false,
          inventoryDriftBps: 500,
          upwardOnly: false,
        }),
      },
    };
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
      snapshot: readLifecycleSnapshot,
      quote: quoteLifecycleRoute,
      simulate: simulateLifecyclePlan,
    };
    const opened = await buildLifecyclePlanWithRoutes(request, deps);
    const save = (bundle: typeof opened) => {
      store.put("plan", bundle.plan, maker);
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
    const methods: string[] = [];
    const provider = {
      request: async ({
        method,
        params,
      }: {
        method: string;
        params?: unknown[];
      }) => {
        methods.push(method);
        if (method === "eth_accounts") return [maker];
        if (method === "eth_chainId") return toHex(chainId);
        assert.equal(method, "eth_signTransaction");
        const t = params![0] as Awaited<
          ReturnType<typeof prepareExternalExecution>
        >["transaction"];
        return fork.account.signTransaction({
          type: "eip1559",
          chainId,
          to: t.to,
          data: t.data,
          value: BigInt(t.value),
          nonce: Number(BigInt(t.nonce)),
          gas: BigInt(t.gas),
          maxFeePerGas: BigInt(t.maxFeePerGas),
          maxPriorityFeePerGas: BigInt(t.maxPriorityFeePerGas),
        });
      },
    };
    const execute = async (planId: string, ambiguous = false) => {
      const plan = store.get("plan", planId, maker)!;
      const prepared = await prepareExternalExecution(
        { ...input, planId, idempotencyKey: planId },
        store,
      );
      const signed = await signExternalTransaction(
        provider,
        prepared.transaction,
        plan.expiresAt,
        () => {},
      );
      await rejectAlteredSignedPlans(
        plan,
        (data) =>
          fork.account.signTransaction({
            type: "eip1559",
            chainId,
            to: maker,
            data,
            value: 0n,
            nonce: Number(BigInt(prepared.transaction.nonce)),
            gas: BigInt(prepared.transaction.gas),
            maxFeePerGas: BigInt(prepared.transaction.maxFeePerGas),
            maxPriorityFeePerGas: BigInt(
              prepared.transaction.maxPriorityFeePerGas,
            ),
          }),
        (serializedTransaction) =>
          relayExternalExecution(
            {
              owner: maker,
              groupId,
              planId,
              attemptId: prepared.attempt.id,
              serializedTransaction,
            },
            store,
          ),
      );
      assert.equal(
        store.get("transaction", prepared.attempt.id, maker)!.transactionHash,
        null,
      );
      const originalPlan = store.get("plan", planId, maker)!;
      store.put(
        "plan",
        {
          ...originalPlan,
          createdAt: Date.now() - 60000,
          expiresAt: Date.now() - 1,
        },
        maker,
      );
      await assert.rejects(
        relayExternalExecution(
          {
            owner: maker,
            groupId,
            planId,
            attemptId: prepared.attempt.id,
            serializedTransaction: signed,
          },
          store,
        ),
        /expired/,
      );
      assert.equal(
        store.get("transaction", prepared.attempt.id, maker)!.transactionHash,
        null,
      );
      store.put("plan", originalPlan, maker);
      const attempt = await relayExternalExecution(
        {
          owner: maker,
          groupId,
          planId,
          attemptId: prepared.attempt.id,
          serializedTransaction: signed,
        },
        store,
        ambiguous
          ? {
              ...fork.rpc,
              sendRawTransaction: async (args) => {
                await fork.rpc.sendRawTransaction(args);
                throw new Error(
                  "Controlled transport lost response after submission",
                );
              },
            }
          : undefined,
      );
      assert.equal(attempt.status, ambiguous ? "unknown" : "submitted");
      const receipt = await fork.rpc.waitForTransactionReceipt({
        hash: attempt.transactionHash!,
      });
      assert.equal(receipt.status, "success");
      const tx = await fork.rpc.getTransaction({
        hash: receipt.transactionHash,
      });
      assert.equal(
        await verifyManagedTransactionProof(fork.rpc, tx, plan),
        true,
      );
      store.releaseExecutionLock(
        store.getDocument<{
          lockToken: Parameters<typeof store.releaseExecutionLock>[0];
        }>("external-attempt", attempt.id, maker)!.data.lockToken,
      );
      store.put(
        "transaction",
        {
          ...attempt,
          status: "confirmed",
          receipt: { blockNumber: receipt.blockNumber.toString() },
        },
        maker,
      );
      return receipt;
    };
    const openReceipt = await execute(opened.plan.id);
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
    const closed = await buildLifecyclePlanWithRoutes(
      {
        ...request,
        id: `close-${chainId}`,
        kind: "close-and-convert",
        funding: undefined,
        inventory: balances,
        previous: opened.plan.registrations.map(({ hash, app, tokens }) => ({
          hash,
          app,
          tokens,
        })),
        conversion: { targetToken: base, amounts: balances, unwrap: true },
        expiresAt: Date.now() + 120000,
      },
      deps,
    );
    save(closed);
    const closeReceipt = await execute(closed.plan.id, true);
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
      2,
    );
    results.push({
      chainId,
      evidence: "controlled EIP1193 provider on isolated fork",
      publicBroadcasts: 0,
      registrations: opened.plan.registrations.length,
      localSigner,
      unavailableRpcRefusedBeforeJournaling: true,
      openHash: openReceipt.transactionHash,
      closeHash: closeReceipt.transactionHash,
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
    store.close();
    fork.stop();
    process.env[setting.env] = upstream;
  }
}
writeFileSync(
  new URL(
    "../../../references/ethglobal-competitive-analysis/external-adapter-fork.json",
    import.meta.url,
  ),
  JSON.stringify(results, null, 2) + "\n",
);
