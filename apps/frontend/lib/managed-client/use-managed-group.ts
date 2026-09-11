import { useCallback, useEffect, useRef, useState } from "react";
import {
  managedRequest,
  requestKey,
  type GroupDetail,
  type ManagedSession,
} from "./api";
import { recoverWalletBatches } from "./wallet-recovery";

export function useManagedGroup(
  session: ManagedSession | undefined,
  groupId: string | undefined,
) {
  const [detail, setDetail] = useState<GroupDetail>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stopBusy, setStopBusy] = useState(false);
  const refreshRevision = useRef(0);
  const [tabSession] = useState(requestKey);
  const refresh = useCallback(async () => {
    if (!session || !groupId) return;
    const revision = ++refreshRevision.current;
    const result = await managedRequest<GroupDetail>(
      `/groups/${groupId}`,
      session,
    );
    if (revision === refreshRevision.current) {
      setDetail(result);
      setError("");
    }
    return result;
  }, [session, groupId]);
  useEffect(() => {
    const controller = new AbortController();
    if (session && groupId)
      managedRequest<GroupDetail>(
        `/groups/${groupId}`,
        session,
        undefined,
        undefined,
        controller.signal,
      )
        .then(setDetail)
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause.message);
        });
    return () => controller.abort();
  }, [session, groupId]);
  useEffect(() => {
    if (
      !session ||
      !groupId ||
      detail?.bot.state !== "running" ||
      detail.bot.lease?.sessionId !== tabSession
    )
      return;
    let heartbeatPending = false;
    let reviewPending = false;
    let active = true;
    const generation = detail.bot.runGeneration;
    const timer = setInterval(async () => {
      if (heartbeatPending || document.visibilityState !== "visible") return;
      heartbeatPending = true;
      try {
        await managedRequest(`/groups/${groupId}/bot`, session, {
          action: "heartbeat",
          sessionId: tabSession,
          generation,
        });
        if (!reviewPending && Date.now() >= detail.bot.nextDueAt) {
          reviewPending = true;
          void managedRequest(`/groups/${groupId}/reviews`, session, {
            sessionId: tabSession,
            generation,
            idempotencyKey: requestKey(),
          })
            .then(() => {
              if (active) return refresh();
            })
            .catch((cause) => {
              if (active)
                setError(
                  cause instanceof Error ? cause.message : "Review failed.",
                );
            })
            .finally(() => {
              reviewPending = false;
            });
        }
        if (!reviewPending) await refresh();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Browser review paused. Reconcile before resuming.",
        );
      } finally {
        heartbeatPending = false;
      }
    }, 10_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [
    session,
    groupId,
    detail?.bot.state,
    detail?.bot.lease?.sessionId,
    detail?.bot.runGeneration,
    detail?.bot.nextDueAt,
    tabSession,
    refresh,
  ]);
  useEffect(() => {
    if (
      !session ||
      !groupId ||
      !detail?.transactions?.some((attempt) =>
        ["submitted", "unknown"].includes(attempt.status),
      )
    )
      return;
    let pending = false,
      active = true;
    const timer = setInterval(async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        await recoverWalletBatches(session, groupId, detail.transactions ?? []);
        await managedRequest(`/groups/${groupId}/reconcile`, session, {});
        if (active) await refresh();
      } catch (cause) {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Transaction recovery unavailable.",
          );
      } finally {
        pending = false;
      }
    }, 8000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [session, groupId, detail?.transactions, refresh]);
  async function action(
    kind: "start" | "resume" | "stop" | "takeover" | "reconcile",
  ) {
    if (!session || !groupId) return;
    refreshRevision.current += 1;
    if (kind === "stop") setStopBusy(true);
    else setBusy(true);
    setError("");
    try {
      if (kind === "reconcile") {
        await recoverWalletBatches(
          session,
          groupId,
          detail?.transactions ?? [],
        );
        await managedRequest(`/groups/${groupId}/reconcile`, session, {});
      } else
        await managedRequest(`/groups/${groupId}/bot`, session, {
          action: kind,
          sessionId: tabSession,
          generation: detail?.bot.runGeneration,
        });
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Management action failed.",
      );
    } finally {
      if (kind === "stop") setStopBusy(false);
      else setBusy(false);
    }
  }
  return {
    detail: detail?.group.id === groupId ? detail : undefined,
    error,
    busy,
    stopBusy,
    action,
    refresh,
    tabSession,
  };
}
