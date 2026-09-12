import { verifyUpwardOnly } from "./fixtures/management-rule-checks";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { parseEther, toHex, type Address } from "viem";
import { controlledFork } from "./fixtures/controlled-fork";
import { managedHttp } from "./fixtures/managed-http";
import { networks, NATIVE, wrapped } from "../lib/config";
import { ManagedStore } from "../lib/server/store";
import { intentSchema } from "../lib/server/managed-service/inputs";
import { intentSnapshot } from "../lib/server/managed-service/snapshot";
import { proposalPolicy } from "../lib/server/managed-service/policy-template";
import { proposalPreview } from "../lib/server/managed-service/proposal-preview";
import { delegatedAccountCode } from "../lib/server/external-adapter/account";
import {
  signExternalTransaction,
  type ExternalTransaction,
} from "../lib/external-adapter/sign";
import type { RunnerRequest } from "../lib/server/managed-service/runner";

process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
const chainId = 42161;
const setting = networks.find((network) => network.id === chainId)!;
const originalRpc = process.env[setting.env]!;
const fork = await controlledFork(chainId, originalRpc);
process.env[setting.env] = fork.url;
const store = new ManagedStore(":memory:");
const globalStore = globalThis as typeof globalThis & {
  aquamuxManagedStore?: ManagedStore;
};
const oldStore = globalStore.aquamuxManagedStore;
globalStore.aquamuxManagedStore = store;
const maker = fork.account.address.toLowerCase() as Address;
const api = await managedHttp(fork.account, chainId);
const evidence: Record<string, unknown> = {
  environment: "isolated real-code fork with controlled provider",
  chainId,
  publicTransactions: 0,
};
try {
  await fork.request("anvil_setBalance", [maker, toHex(parseEther("2"))]);
  await fork.request("anvil_setCode", [maker, delegatedAccountCode]);
  process.env.AQUAMUX_START_BLOCK_42161 = (
    await fork.rpc.getBlockNumber()
  ).toString();
  const intent = intentSchema.parse({
    recipeId: "managed-concentrated-lp",
    chainId,
    maker,
    fundingToken: NATIVE,
    budget: parseEther("0.0001").toString(),
    gasReserveWei: parseEther("0.1").toString(),
    permittedAssets: [NATIVE, "0xaf88d065e77c8cc2239327c5edb3a432268e5831"],
    intervalMs: 60000,
    holdingPeriodMs: 86400000,
  });
  const snapshot = await intentSnapshot(intent);
  const policyTemplate = proposalPolicy(
    intent,
    "fork-app-policy",
    Date.now(),
    snapshot.tokenMetadata,
  );
  const preview = proposalPreview({
    requestId: "fork-app-preview",
    owner: maker,
    groupId: "fork-app-group",
    botId: "fork-app-bot",
    runGeneration: 0,
    purpose: "proposal",
    intent,
    snapshot,
    policyTemplate,
    deadline: Date.now() + 120_000,
  } satisfies RunnerRequest);
  assert.ok(preview.available && preview.config);
  const created = await api.send("groups", { config: preview.config });
  assert.equal(created.status, 200, JSON.stringify(created.data));
  const { group, bot } = created.data;
  const path = `groups/${group.id}`;
  store.putDocument("group-intent", group.id, maker, {
    intent,
    policyTemplate,
  });
  store.put(
    "group",
    {
      ...group,
      inventory: [
        {
          token: { address: NATIVE, decimals: 18, symbol: "ETH" },
          amount: intent.budget,
        },
      ],
    },
    maker,
  );
  const review = {
    id: "controlled-opening-review",
    owner: maker,
    groupId: group.id,
    botId: bot.id,
    createdAt: Date.now(),
    runGeneration: bot.runGeneration,
    snapshot,
    coverage: snapshot.coverage,
    provider: "controlled-fork-fixture",
    model: "deterministic-preview",
    runtimeVersion: "verification-only",
    status: "succeeded" as const,
    errors: [],
    usage: { cost: null },
    result: {
      version: 1 as const,
      expectedEffects: [],
      decision: "fund-and-open" as const,
      rationale: "Controlled production HTTP integration fixture.",
      proposedConfig: preview.config,
      evidence: [],
      uncertainties: [],
    },
  };
  // This fixture isolates execution/recovery; actual AI proposal evidence is recorded separately.
  store.put("review", review, maker);
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
      const t = params![0] as ExternalTransaction;
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
  async function execute(preparedPlan: {
    plan: { id: string; expiresAt: number };
    digest: string;
  }) {
    const { plan, digest } = preparedPlan;
    assert.equal(
      (await api.send(`${path}/plans/${plan.id}/confirm`, { digest })).status,
      200,
    );
    const prepared = await api.send(`${path}/attempts`, {
      planId: plan.id,
      idempotencyKey: plan.id,
    });
    assert.equal(prepared.status, 200, JSON.stringify(prepared.data));
    const signed = await signExternalTransaction(
      provider,
      prepared.data.transaction,
      plan.expiresAt,
      () => {},
    );
    const sent = await api.send(
      `${path}/attempts/${prepared.data.attempt.id}/signed`,
      { serializedTransaction: signed },
    );
    assert.equal(sent.status, 200, JSON.stringify(sent.data));
    assert.equal(sent.data.attempt.status, "submitted");
    await fork.rpc.waitForTransactionReceipt({
      hash: sent.data.attempt.transactionHash,
    });
    await fork.request("anvil_mine", ["0x2"]);
    const recovered = await api.send(`${path}/reconcile`, {});
    assert.equal(recovered.status, 200, JSON.stringify(recovered.data));
    assert.equal(
      store.get("transaction", prepared.data.attempt.id, maker)!.status,
      "confirmed",
    );
    return {
      hash: sent.data.attempt.transactionHash,
      attemptId: prepared.data.attempt.id,
    };
  }
  const opened = await api.send(`${path}/plans`, {
    action: "fund-and-open",
    reviewId: review.id,
  });
  assert.equal(opened.status, 200, JSON.stringify(opened.data));
  evidence.open = await execute(opened.data);
  assert.equal(store.get("group", group.id, maker)!.state, "active");
  assert.deepEqual(store.get("group", group.id, maker)!.inventory, []);
  assert.ok(store.getDocument("active-configuration", group.id, maker));
  const replacement = await api.send(`${path}/plans`, {
    action: "replace",
    reviewId: review.id,
  });
  assert.equal(replacement.data.code, "cooldown_active");
  evidence.cooldownRefused = replacement.data.code;
  const baseline = store.getDocument<{
    config: typeof preview.config;
    confirmedAt: number;
  }>("active-configuration", group.id, maker)!.data;
  store.putDocument("active-configuration", group.id, maker, {
    ...baseline,
    confirmedAt: Date.now() - 60001,
  });
  const replacementReview = {
    ...review,
    id: "controlled-replacement-review",
    result: { ...review.result, decision: "replace" as const },
  };
  store.put("review", replacementReview, maker);
  const replacePlan = await api.send(`${path}/plans`, {
    action: "replace",
    reviewId: replacementReview.id,
  });
  if (replacePlan.status !== 200) {
    const { createManagedPlan } =
      await import("../lib/server/managed-service/plans");
    await createManagedPlan(maker, group.id, {
      action: "replace",
      reviewId: replacementReview.id,
    });
  }
  assert.equal(replacePlan.status, 200, JSON.stringify(replacePlan.data));
  evidence.replacement = await execute(replacePlan.data);
  evidence.upwardOnly = await verifyUpwardOnly({
    store,
    owner: maker,
    groupId: group.id,
    api,
    review,
    execute,
  });
  const noQuantities = await api.send(`${path}/plans`, {
    action: "close-and-convert",
    targetToken: wrapped(chainId).address,
  });
  assert.equal(noQuantities.data.code, "inventory_review_required");
  assert.equal(store.get("bot", bot.id, maker)!.state, "stopped");
  evidence.unreviewedInventoryRefused = noQuantities.data.code;
  const close = await api.send(`${path}/plans`, { action: "close" });
  assert.equal(close.status, 200, JSON.stringify(close.data));
  evidence.closeOnly = await execute(close.data);
  assert.equal(store.get("group", group.id, maker)!.state, "closed");
  const inventory = await api.send(`${path}/inventory`);
  assert.equal(inventory.status, 200);
  const quantities = inventory.data.balances.filter(
    (b: { amount: string }) => BigInt(b.amount) > 0n,
  );
  assert.ok(quantities.length);
  const convert = await api.send(`${path}/plans`, {
    action: "close-and-convert",
    targetToken: NATIVE,
    inventory: quantities,
  });
  if (convert.status !== 200) {
    const { createManagedPlan } =
      await import("../lib/server/managed-service/plans");
    await createManagedPlan(maker, group.id, {
      action: "close-and-convert",
      targetToken: wrapped(chainId).address,
      inventory: quantities,
      unwrap: true,
    });
  }
  assert.equal(convert.status, 200, JSON.stringify(convert.data));
  evidence.closedGroupConversion = await execute(convert.data);
  evidence.providerMethods = [...new Set(methods)];
  evidence.inventoryAttribution =
    "explicit quantities, no estimated attribution";
  evidence.productionReceiptRecovery = true;
  evidence.generatedAt = new Date().toISOString();
  writeFileSync(
    new URL(
      "../../../references/ethglobal-competitive-analysis/app-http-fork-results.json",
      import.meta.url,
    ),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
} finally {
  await api.stop();
  store.close();
  globalStore.aquamuxManagedStore = oldStore;
  process.env[setting.env] = originalRpc;
  delete process.env.AQUAMUX_START_BLOCK_42161;
  fork.stop();
}
