import { useEffect, useState } from "react";
import { authenticateWallet, managedRequest, type ManagedSession } from "./api";
import { connectDevWallet, disconnectDevWallet } from "@/lib/dev-wallet";

const sessionKey = "aquamux-managed-session-v1";
export function useManagedSession() {
  const [session, setSession] = useState<ManagedSession>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.resolve().then(() => {
      try {
        const stored = sessionStorage.getItem(sessionKey);
        if (!stored) return;
        const value = JSON.parse(stored) as ManagedSession;
        if (
          typeof value.token === "string" &&
          /^0x[0-9a-fA-F]{40}$/.test(value.owner) &&
          value.expiresAt > Date.now() &&
          ["external", "local-development"].includes(value.mode)
        )
          setSession(value);
        else sessionStorage.removeItem(sessionKey);
      } catch {
        /* Session storage is optional; authenticate again if unavailable. */
      }
    });
    const changed = () => {
      setSession(undefined);
      try {
        sessionStorage.removeItem(sessionKey);
      } catch {
        /* Optional session cache. */
      }
    };
    window.ethereum?.on?.("accountsChanged", changed);
    return () => window.ethereum?.removeListener?.("accountsChanged", changed);
  }, []);
  async function connect(mode: "external" | "local-development") {
    setBusy(true);
    setError("");
    try {
      let value: ManagedSession;
      if (mode === "local-development") {
        const result = await connectDevWallet();
        value = {
          token: result.token,
          owner: result.account,
          expiresAt: result.expiresAt,
          sessionId: crypto.randomUUID(),
          mode,
        };
      } else value = await authenticateWallet(42161);
      setSession(value);
      try {
        sessionStorage.setItem(sessionKey, JSON.stringify(value));
      } catch {
        /* Authentication remains valid in memory. */
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Wallet authentication failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function disconnect() {
    setBusy(true);
    setError("");
    try {
      if (session?.mode === "local-development")
        await disconnectDevWallet(session.token);
      else if (session) await managedRequest("/api/auth/logout", session, {});
      setSession(undefined);
      try {
        sessionStorage.removeItem(sessionKey);
      } catch {
        /* Optional session cache. */
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not disconnect development wallet.",
      );
    } finally {
      setBusy(false);
    }
  }
  return { session, error, busy, connect, disconnect };
}
