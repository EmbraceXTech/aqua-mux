import assert from "node:assert/strict";
import { toHex, type Address } from "viem";
import {
  prepareExternalExecution,
  relayExternalExecution,
} from "../../lib/server/external-adapter/execution";
import { verifyManagedTransactionProof } from "../../lib/server/managed-service/transaction-proof";
import { reconcileManagedTransactions } from "../../lib/server/managed-service/reconciliation";
import { signExternalTransaction } from "../../lib/external-adapter/sign";
import type { ManagedStore } from "../../lib/server/store";
import { rejectAlteredSignedPlans } from "./external-adversarial";
import type { controlledFork } from "./controlled-fork";

export function createExternalExecution(
  fork: Awaited<ReturnType<typeof controlledFork>>,
  store: ManagedStore,
  input: {
    owner: Address;
    groupId: string;
    planId: string;
    idempotencyKey: string;
  },
) {
  const maker = input.owner,
    groupId = input.groupId,
    chainId = fork.rpc.chain.id;
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
  const execute = async (
    planId: string,
    ambiguous = false,
    probe?: { beforeBroadcast(): Promise<void>; expectedProof: boolean },
  ) => {
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
      ambiguous || probe
        ? {
            ...fork.rpc,
            sendRawTransaction: async (args) => {
              await probe?.beforeBroadcast();
              const hash = await fork.rpc.sendRawTransaction(args);
              if (!ambiguous) return hash;
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
      probe?.expectedProof ?? true,
    );
    const confirmations = Number(
      process.env[`AQUAMUX_CONFIRMATIONS_${chainId}`] ?? 1,
    );
    assert.ok(
      Number.isInteger(confirmations) &&
        confirmations > 0 &&
        confirmations <= 100,
    );
    await fork.request("anvil_mine", [toHex(confirmations)]);
    await reconcileManagedTransactions(maker, groupId);
    assert.equal(
      store.get("transaction", attempt.id, maker)!.status,
      probe?.expectedProof === false ? "unknown" : "confirmed",
    );
    if (probe?.expectedProof === false)
      assert.throws(
        () =>
          store.acquireExecutionLock(
            chainId,
            maker,
            maker,
            "unsafe-retry",
            30000,
          ),
        /unresolved/,
      );
    return receipt;
  };
  return { execute, methods };
}
