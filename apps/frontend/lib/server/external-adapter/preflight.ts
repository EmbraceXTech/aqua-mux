import { toHex, type PublicClient } from "viem";
import { canonicalDigest, type LifecyclePlan } from "../../managed";
import type { ManagedStore } from "../store";
import { managedSigningBatch } from "../dev-wallet/managed-plan";
import { validateDevPlan } from "../dev-wallet/policy";
import { verifyDevAssets } from "../dev-wallet/assets";
import { verifyDevRoutes } from "../dev-wallet/routes";
import { encodeDevBatch } from "../dev-wallet/batch";
import { client } from "../rpc";
import { ManagedError } from "../managed-service/errors";
import { verifyExternalAccount } from "./account";
import type { ExternalTransaction } from "./types";

export async function externalPreflight(
  plan: LifecyclePlan,
  store: ManagedStore,
  rpc: PublicClient,
  expected?: ExternalTransaction,
) {
  const batch = managedSigningBatch(plan, store);
  if (!plan.deploymentEvidence?.length)
    throw new ManagedError(
      "deployment_evidence_missing",
      "Prepare a fresh plan with deployment runtime evidence.",
    );
  validateDevPlan(batch, plan.maker);
  await verifyExternalAccount(plan.owner, plan.maker, plan.chainId, rpc);
  await verifyDevAssets(batch, rpc);
  await verifyDevRoutes(batch);
  const data = encodeDevBatch(plan.calls);
  const nonce = await rpc.getTransactionCount({
    address: plan.maker,
    blockTag: "pending",
  });
  const transaction = { account: plan.maker, to: plan.maker, data, value: 0n };
  // No account state override: this must be the wallet's actual verified delegation.
  await rpc.call(transaction);
  const estimate = await rpc.estimateGas(transaction);
  const gasPrice = await rpc.getGasPrice();
  const gas = expected ? BigInt(expected.gas) : (estimate * 130n) / 100n;
  const maxFeePerGas = expected ? BigInt(expected.maxFeePerGas) : gasPrice * 2n;
  const priority = expected ? BigInt(expected.maxPriorityFeePerGas) : gasPrice;
  const group = store.get("group", plan.groupId, plan.owner);
  if (!group)
    throw new ManagedError("not_found", "Managed group is unavailable.", 404);
  const feeLimit = BigInt(group.config.policy.gasBudgetWei.value);
  const value = plan.calls.reduce((sum, call) => sum + BigInt(call.value), 0n);
  const balance = await rpc.getBalance({ address: plan.maker });
  if (
    estimate > gas ||
    gasPrice > maxFeePerGas ||
    gas * maxFeePerGas > feeLimit ||
    balance < value + gas * maxFeePerGas + BigInt(plan.gasReserveWei)
  )
    throw new ManagedError(
      "external_fee_or_balance",
      "The transaction exceeds the reviewed gas budget or native reserve.",
    );
  const envelope: ExternalTransaction = {
    type: "0x2",
    from: plan.maker,
    to: plan.maker,
    chainId: toHex(plan.chainId),
    data,
    value: "0x0",
    nonce: toHex(nonce),
    gas: toHex(gas),
    maxFeePerGas: toHex(maxFeePerGas),
    maxPriorityFeePerGas: toHex(priority),
  };
  if (expected && canonicalDigest(envelope) !== canonicalDigest(expected))
    throw new ManagedError(
      "external_transaction_changed",
      "The account nonce or reviewed transaction changed.",
    );
  // Guard every dependency again after simulation and balance/fee reads.
  await verifyExternalAccount(plan.owner, plan.maker, plan.chainId, rpc);
  await verifyDevAssets(batch, rpc);
  await verifyDevRoutes(batch);
  validateDevPlan(batch, plan.maker);
  return { transaction: envelope, feeLimit: feeLimit.toString() };
}

/** Public adapter boundary: transport failures must not become journaled attempts. */
export async function checkedExternalPreflight(
  plan: LifecyclePlan,
  store: ManagedStore,
  expected?: ExternalTransaction,
  rpcOverride?: PublicClient,
) {
  try {
    return await externalPreflight(
      plan,
      store,
      rpcOverride ?? client(plan.chainId),
      expected,
    );
  } catch (error) {
    if (error instanceof ManagedError) throw error;
    throw new ManagedError(
      "external_preflight_unavailable",
      "The external account or reviewed transaction could not be verified. Refresh the plan and account status.",
    );
  }
}
