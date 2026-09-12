import { useCallback, useEffect, useRef, useState } from "react";
import { type ManagedSession } from "./api";
import { walletExecutor, type WalletMode } from "./wallet-execution";
import {
  devWalletAvailability,
  type DevWalletAvailability,
} from "@/lib/dev-wallet";

const sessionKey = "aquamux-managed-session-v1";
export function useManagedSession(chainId = 42161) {
  const [session, setSession] = useState<ManagedSession>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [developmentWallet, setDevelopmentWallet] =
    useState<DevWalletAvailability>();
  const generation = useRef(0);
  const clear = useCallback((message = "") => {
    generation.current += 1;
    setSession(undefined);
    setBusy(false);
    setError(message);
    try {
      sessionStorage.removeItem(sessionKey);
    } catch {
      /* Optional session cache. */
    }
  }, []);
  useEffect(() => {
    let active = true;
    const initialGeneration = generation.current;
    Promise.resolve().then(() => {
      if (!active || initialGeneration !== generation.current) return;
      try {
        const stored = sessionStorage.getItem(sessionKey);
        if (!stored) return;
        const value = JSON.parse(stored) as ManagedSession;
        if (
          typeof value.token === "string" &&
          /^0x[0-9a-fA-F]{40}$/.test(value.owner) &&
          typeof value.sessionId === "string" &&
          value.expiresAt > Date.now() &&
          ["external", "local-development"].includes(value.mode)
        )
          setSession(value);
        else clear("Your session expired. Authenticate your wallet again.");
      } catch {
        /* Authenticate again when the session cache is unavailable. */
      }
    });
    return () => {
      active = false;
      generation.current += 1;
    };
  }, [clear]);
  useEffect(() => {
    if (!session || !walletExecutor(session.mode).observesBrowserWallet) return;
    const changed = () =>
      clear("Wallet account changed. Authenticate the selected wallet again.");
    const chainChanged = () =>
      clear("Wallet network changed. Authenticate the selected wallet again.");
    window.ethereum?.on?.("accountsChanged", changed);
    window.ethereum?.on?.("chainChanged", chainChanged);
    return () => {
      window.ethereum?.removeListener?.("accountsChanged", changed);
      window.ethereum?.removeListener?.("chainChanged", chainChanged);
    };
  }, [session, clear]);
  useEffect(() => {
    let active = true;
    devWalletAvailability()
      .then((availability) => {
        if (active) setDevelopmentWallet(availability);
      })
      .catch(() => {
        if (active)
          setDevelopmentWallet({
            available: false,
            error:
              "Local development wallet status could not be checked. Refresh before connecting.",
          });
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(
      () => clear("Your session expired. Authenticate your wallet again."),
      Math.max(0, session.expiresAt - Date.now()),
    );
    const invalidated = (event: Event) => {
      if ((event as CustomEvent<string>).detail === session.sessionId)
        clear(
          "Authentication expired or was revoked. Connect your wallet again.",
        );
    };
    window.addEventListener("aquamux-auth-invalidated", invalidated);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("aquamux-auth-invalidated", invalidated);
    };
  }, [session, clear]);
  async function connect(mode: WalletMode) {
    const requestGeneration = ++generation.current;
    setBusy(true);
    setError("");
    try {
      const value = await walletExecutor(mode).connect(chainId);
      if (requestGeneration !== generation.current) return;
      setSession(value);
      try {
        sessionStorage.setItem(sessionKey, JSON.stringify(value));
      } catch {
        /* Authentication remains valid in memory. */
      }
      return value;
    } catch (cause) {
      if (requestGeneration === generation.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Wallet authentication failed.",
        );
    } finally {
      if (requestGeneration === generation.current) setBusy(false);
    }
  }
  async function disconnect() {
    const previous = session;
    clear();
    const disconnectGeneration = generation.current;
    try {
      if (previous) await walletExecutor(previous.mode).disconnect(previous);
    } catch {
      if (disconnectGeneration === generation.current)
        setError(
          "Disconnected locally. Server session revocation could not be confirmed.",
        );
    }
  }
  return {
    session,
    error,
    busy,
    developmentWallet,
    connect,
    disconnect,
  };
}
