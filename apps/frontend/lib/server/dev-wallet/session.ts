import type { Address } from "viem";
import { requireOwnerSession, walletAuth } from "../auth";
import { openManagedStore } from "../store";
import {
  assertLocalRequest,
  devAccount,
  devNetworks,
  DevWalletError,
} from "./config";
import { maxFeeBudget } from "./signer";

const namespace = "dev-wallet-session";
type SessionScope = { expiresAt: number; active: boolean };
export type DevSession = { owner: Address; sessionId: string };

export async function connectLocalWallet(request: Request) {
  assertLocalRequest(request);
  const fee = maxFeeBudget();
  const account = devAccount();
  const origin = request.headers.get("origin")!;
  const auth = walletAuth();
  const challenge = auth.challenge(account.address, origin, 56);
  // This signature stays server-side and only authorizes the application's fixed challenge.
  const signature = await account.signMessage({ message: challenge.message });
  const session = await auth.verify(challenge.id, signature, origin);
  openManagedStore().putDocument(namespace, session.sessionId, session.owner, {
    expiresAt: session.expiresAt,
    active: true,
  } satisfies SessionScope);
  return {
    mode: "local-development" as const,
    label: "Local development wallet - real mainnet transactions",
    account: account.address,
    token: session.token,
    expiresAt: session.expiresAt,
    maxFeeWei: String(fee),
    networks: devNetworks,
  };
}

export function requireDevSession(request: Request): DevSession {
  assertLocalRequest(request);
  const session = requireOwnerSession(request);
  const scope = openManagedStore().getDocument<SessionScope>(
    namespace,
    session.sessionId,
    session.owner,
  );
  if (
    !scope?.data.active ||
    scope.data.expiresAt <= Date.now() ||
    devAccount().address.toLowerCase() !== session.owner.toLowerCase()
  )
    throw new DevWalletError("Connect the local development wallet again.");
  return session;
}

export function disconnectLocalWallet(request: Request) {
  const session = requireDevSession(request);
  walletAuth().revoke(request.headers.get("authorization")!.slice(7));
  openManagedStore().putDocument(namespace, session.sessionId, session.owner, {
    expiresAt: Date.now(),
    active: false,
  } satisfies SessionScope);
  return { disconnected: true as const };
}
