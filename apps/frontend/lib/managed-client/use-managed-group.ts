import { useCallback, useEffect, useState } from "react";
import {
  managedRequest,
  requestKey,
  type GroupDetail,
  type ManagedSession,
} from "./api";

export function useManagedGroup(
  session: ManagedSession | undefined,
  groupId: string | undefined,
) {
  const [detail, setDetail] = useState<GroupDetail>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [tabSession] = useState(requestKey);
  const refresh = useCallback(async () => {
    if (!session || !groupId) return;
    const result = await managedRequest<GroupDetail>(
      `/groups/${groupId}`,
      session,
    );
    setDetail(result);
    setError("");
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
    let pending = false;
    const generation = detail.bot.runGeneration;
    const timer = setInterval(async () => {
      if (pending || document.visibilityState !== "visible") return;
      pending = true;
      try {
        await managedRequest(`/groups/${groupId}/bot`, session, {
          action: "heartbeat",
          sessionId: tabSession,
          generation,
        });
        if (Date.now() >= detail.bot.nextDueAt)
          await managedRequest(`/groups/${groupId}/reviews`, session, {
            sessionId: tabSession,
            generation,
            idempotencyKey: requestKey(),
          });
        await refresh();
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Browser review paused. Reconcile before resuming.",
        );
      } finally {
        pending = false;
      }
    }, 10_000);
    return () => clearInterval(timer);
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
  async function action(
    kind: "start" | "resume" | "stop" | "takeover" | "reconcile",
  ) {
    if (!session || !groupId) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "reconcile")
        await managedRequest(`/groups/${groupId}/reconcile`, session, {});
      else
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
      setBusy(false);
    }
  }
  return {
    detail: detail?.group.id === groupId ? detail : undefined,
    error,
    busy,
    action,
    refresh,
    tabSession,
  };
}
