import { toHex } from "viem";
import type { LifecyclePlan } from "@/lib/managed";
import { ensureChain } from "@/lib/wallet";
import { managedRequest, requestKey, type ManagedSession } from "./api";
import {
  isExplicitWalletRejection,
  saveWalletRecoveryHint,
} from "./wallet-recovery";

export async function submitExternalManaged(
  session: ManagedSession,
  plan: LifecyclePlan,
  tabSession: string,
  assertCurrent: () => void,
) {
  const provider = window.ethereum;
  if (!provider)
    throw new Error("Connect an external wallet before submitting.");
  assertCurrent();
  await ensureChain(plan.chainId);
  const accounts = (await provider.request({
    method: "eth_accounts",
  })) as string[];
  if (accounts[0]?.toLowerCase() !== plan.maker.toLowerCase())
    throw new Error("Wallet account changed. Authenticate and review again.");
  const capabilities = (await provider.request({
    method: "wallet_getCapabilities",
    params: [plan.maker, [toHex(plan.chainId)]],
  })) as Record<string, { atomic?: { status?: string } }>;
  if (
    !["supported", "ready"].includes(
      capabilities[toHex(plan.chainId)]?.atomic?.status ?? "",
    )
  )
    throw new Error(
      "Atomic batches are unavailable for this wallet and chain. No execution attempt was created.",
    );
  assertCurrent();
  if (Date.now() >= plan.expiresAt)
    throw new Error("The reviewed plan expired during wallet setup.");
  const prepared = await managedRequest<{ attempt: { id: string } }>(
    `/groups/${plan.groupId}/attempts`,
    session,
    {
      planId: plan.id,
      idempotencyKey: requestKey(),
      sessionId: tabSession,
      generation: plan.runGeneration,
    },
  );
  try {
    assertCurrent();
    if (window.ethereum !== provider || Date.now() >= plan.expiresAt)
      throw new Error("Wallet or plan changed before submission.");
  } catch (cause) {
    await managedRequest(
      `/groups/${plan.groupId}/attempts/${prepared.attempt.id}/not-sent`,
      session,
      { reason: "workspace_changed" },
    );
    throw cause;
  }
  let result: { id?: string };
  try {
    result = (await provider.request({
      method: "wallet_sendCalls",
      params: [
        {
          version: "2.0.0",
          chainId: toHex(plan.chainId),
          from: plan.maker,
          atomicRequired: true,
          calls: plan.calls.map(({ to, data, value }) => ({ to, data, value })),
        },
      ],
    })) as { id?: string };
  } catch (cause) {
    if (isExplicitWalletRejection(cause))
      await managedRequest(
        `/groups/${plan.groupId}/attempts/${prepared.attempt.id}/rejected`,
        session,
        { code: 4001 },
      );
    throw cause;
  }
  if (!result?.id)
    throw new Error(
      "Wallet returned no batch identifier. The attempt remains unresolved; check wallet activity before retrying.",
    );
  saveWalletRecoveryHint(
    session.owner,
    plan.groupId,
    prepared.attempt.id,
    result.id,
  );
  await managedRequest(
    `/groups/${plan.groupId}/attempts/${prepared.attempt.id}/submitted`,
    session,
    { walletBatchId: result.id },
  );
  return result.id;
}
