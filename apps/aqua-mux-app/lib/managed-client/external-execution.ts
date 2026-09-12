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
  let signingInvoked = false;
  const signingProvider: typeof provider = {
    ...provider,
    request: async (request) => {
      if (request.method === "eth_signTransaction") signingInvoked = true;
      return provider.request(request);
    },
  };
  let signedButNotRelayed = false;
  let serializedTransaction;
  try {
    serializedTransaction = await signExternalTransaction(
      signingProvider,
      prepared.transaction,
      plan.expiresAt,
      () => {
        assertCurrent();
        if (window.ethereum !== provider)
          throw new Error("Wallet provider changed.");
      },
    );
    signedButNotRelayed = true;
    assertCurrent();
    const accounts = await provider.request({ method: "eth_accounts" });
    const chain = await provider.request({ method: "eth_chainId" });
    assertCurrent();
    if (
      window.ethereum !== provider ||
      !Array.isArray(accounts) ||
      String(accounts[0]).toLowerCase() !== prepared.transaction.from ||
      chain !== prepared.transaction.chainId
    )
      throw new Error(
        "The wallet or workspace changed while signing. Nothing was relayed.",
      );
    if (Date.now() >= plan.expiresAt)
      throw new Error(
        "The reviewed plan expired while signing. Nothing was relayed.",
      );
  } catch (cause) {
    if (isExplicitWalletRejection(cause))
      await managedRequest(
        `/groups/${plan.groupId}/attempts/${prepared.attempt.id}/rejected`,
        session,
        { code: 4001 },
      );
    else if (
      !signingInvoked ||
      signedButNotRelayed ||
      isUnsupportedSigning(cause)
    )
      await managedRequest(
        `/groups/${plan.groupId}/attempts/${prepared.attempt.id}/not-sent`,
        session,
        { reason: "preflight_refused" },
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

function isUnsupportedSigning(cause: unknown): boolean {
  if (!cause || typeof cause !== "object" || !("code" in cause)) return false;
  return cause.code === -32601 || cause.code === 4200;
}
