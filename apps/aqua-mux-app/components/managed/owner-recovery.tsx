"use client";
import { useEffect, useState } from "react";
import { managedRequest, type ManagedSession } from "@/lib/managed-client/api";

type Recovery = {
  attempts: { id: string; groupId: string; chainId: number; status: string }[];
  unavailable: string[];
};

export function OwnerRecovery({ session }: { session?: ManagedSession }) {
  const [result, setResult] = useState<Recovery>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (!session) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const recover = async () => {
      try {
        const current = await managedRequest<Recovery>(
          "/recovery",
          session,
          {},
          undefined,
          controller.signal,
        );
        if (active) {
          setResult(current);
          setError("");
        }
      } catch {
        if (active)
          setError(
            "Transaction recovery is unavailable. Unresolved attempts remain locked.",
          );
      } finally {
        if (active) timer = setTimeout(recover, 8000);
      }
    };
    void recover();
    return () => {
      active = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, [session]);
  if (
    !session ||
    (!error && !result?.attempts.length && !result?.unavailable.length)
  )
    return null;
  return (
    <aside
      className="managed-notice"
      role="status"
      aria-label="Owner transaction recovery"
    >
      {error ||
        `${result?.attempts.length ?? 0} unresolved transaction attempts. Recovery continues across all your groups. Open Strategies to inspect the records.`}
      {!!result?.unavailable.length && (
        <p>
          Some networks could not be checked. Their execution locks remain in
          place.
        </p>
      )}
    </aside>
  );
}
