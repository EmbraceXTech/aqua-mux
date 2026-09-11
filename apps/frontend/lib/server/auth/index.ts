import { openManagedStore } from "../store";
import { AuthError, WalletAuth } from "./wallet-auth";
export { AuthError, WalletAuth } from "./wallet-auth";
export type { OwnerSession, VerifiedSession } from "./wallet-auth";

export function walletAuth() {
  return new WalletAuth(
    openManagedStore(),
    process.env.AQUAMUX_AUTH_ORIGIN ?? "http://127.0.0.1:3100",
  );
}
export function requireOwner(request: Request) {
  const auth = walletAuth();
  const origin = request.headers.get("origin");
  if (!["GET", "HEAD"].includes(request.method)) auth.assertOrigin(origin);
  else if (origin) auth.assertOrigin(origin);
  // The URL is also checked when Origin is absent on same-origin GET requests.
  if (new URL(request.url).origin !== auth.origin)
    throw new AuthError(403, "Request URL origin is not allowed.");
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new AuthError(401, "Authentication required.");
  return auth.authenticate(authorization.slice(7), auth.origin);
}
export const requireOwnerSession = requireOwner;
