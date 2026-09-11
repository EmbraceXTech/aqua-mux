import type { LifecyclePlan, TransactionAttempt } from "@/lib/managed";
import { ensureChain } from "@/lib/wallet";
import {
  signExternalTransaction,
  type ExternalTransaction,
} from "@/lib/external-adapter/sign";
import { managedRequest, requestKey, type ManagedSession } from "./api";
import { isExplicitWalletRejection } from "./wallet-recovery";

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
  assertCurrent();
  const prepared = await managedRequest<{
    attempt: TransactionAttempt;
    transaction: ExternalTransaction;
    adapter: string;
  }>(`/groups/${plan.groupId}/attempts`, session, {
    planId: plan.id,
    idempotencyKey: requestKey(),
    sessionId: tabSession,
    generation: plan.runGeneration,
  });
  let serializedTransaction;
  try {
    serializedTransaction = await signExternalTransaction(
      provider,
      prepared.transaction,
      plan.expiresAt,
      () => {
        assertCurrent();
        if (window.ethereum !== provider)
          throw new Error("Wallet provider changed.");
      },
    );
  } catch (cause) {
    if (isExplicitWalletRejection(cause))
      await managedRequest(
        `/groups/${plan.groupId}/attempts/${prepared.attempt.id}/rejected`,
        session,
        { code: 4001 },
      );
    throw cause;
  }
  // Signed bytes are sent only to the authenticated relay and never persisted in browser storage.
  const response = await managedRequest<{ attempt: TransactionAttempt }>(
    `/groups/${plan.groupId}/attempts/${prepared.attempt.id}/signed`,
    session,
    {
      serializedTransaction,
      sessionId: tabSession,
      generation: plan.runGeneration,
    },
  );
  return response.attempt;
}
