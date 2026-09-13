import { openManagedStore } from "../store";
import { isLocalOriginAlias } from "./request-origin";
import { AuthError, WalletAuth } from "./wallet-auth";
export { AuthError, WalletAuth } from "./wallet-auth";
export type { OwnerSession, VerifiedSession } from "./wallet-auth";

function defaultAuthOrigin() {
  return `http://127.0.0.1:${process.env.PORT ?? "3100"}`;
}

export function walletAuth() {
  return new WalletAuth(
    openManagedStore(),
    process.env.AQUAMUX_AUTH_ORIGIN ?? defaultAuthOrigin(),
    Date.now,
    process.env.NODE_ENV === "development",
  );
}
export function requireOwner(request: Request) {
  const auth = walletAuth();
  const origin = request.headers.get("origin");
  if (!["GET", "HEAD"].includes(request.method)) auth.assertOrigin(origin);
  else if (origin) auth.assertOrigin(origin);
  // The URL is also checked when Origin is absent on same-origin GET requests.
  if (
    !auth.allowsAnyOrigin &&
    new URL(request.url).origin !== auth.origin &&
    !isLocalOriginAlias(request, auth.origin)
  )
    throw new AuthError(403, "Request URL origin is not allowed.");
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer "))
    throw new AuthError(401, "Authentication required.");
  return auth.authenticate(
    authorization.slice(7),
    origin ?? new URL(request.url).origin,
  );
}
export const requireOwnerSession = requireOwner;
