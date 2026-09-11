import { useEffect, useRef, useState } from "react";
import type {
  LifecyclePlan,
  TokenAmount,
  LPStrategyConfig,
  ReviewRecord,
} from "@/lib/managed";
import { submitExternalManaged } from "./external-execution";
import { recoverWalletBatches } from "./wallet-recovery";
import {
  prepareDevWalletLifecyclePlan,
  submitDevWalletPlan,
} from "@/lib/dev-wallet";
import {
  managedRequest,
  requestKey,
  type GroupDetail,
  type ManagedSession,
} from "./api";

export function useManagedActions(
  session: ManagedSession | undefined,
  detail: GroupDetail | undefined,
  refresh: () => Promise<GroupDetail | undefined>,
  tabSession: string,
) {
  const [pendingPlan, setPendingPlan] = useState<{
    plan: LifecyclePlan;
    digest: string;
  }>();
  const scope = useRef({ active: true, revision: 0 });
  useEffect(() => {
    scope.current.active = true;
    const current = scope.current;
    return () => {
      current.active = false;
      current.revision += 1;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function perform(operation: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await operation();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The action failed. Reconcile before retrying.",
      );
      throw cause;
    } finally {
      setBusy(false);
    }
  }
  async function save(config: LPStrategyConfig) {
    if (!session || !detail) return;
    await perform(async () => {
      const saved = await managedRequest<GroupDetail>(
        `/groups/${detail.group.id}`,
        session,
        { config },
        "PATCH",
      );
      setPendingPlan(undefined);
      await refresh();
      setNotice(
        saved.bot.runGeneration === detail.bot.runGeneration
          ? "Configuration unchanged. Existing reviews remain subject to their original expiry."
          : "Configuration saved. Previous plans are invalid. Generate a fresh review.",
      );
    });
  }
  async function review() {
    if (!session || !detail) return;
    await perform(async () => {
      await managedRequest<{ review: ReviewRecord }>(
        `/groups/${detail.group.id}/proposals`,
        session,
        { idempotencyKey: requestKey() },
      );
      setPendingPlan(undefined);
      await refresh();
    });
  }
  async function plan(
    action: LifecyclePlan["kind"],
    targetToken?: string,
    inventory?: TokenAmount[],
  ) {
    if (!session || !detail) return;
    const revision = scope.current.revision;
    await perform(async () => {
      const review = detail.reviews?.toSorted(
        (a, b) => b.createdAt - a.createdAt,
      )[0];
      const response = await managedRequest<{
        plan: LifecyclePlan;
        digest: string;
      }>(`/groups/${detail.group.id}/plans`, session, {
        action,
        ...(review ? { reviewId: review.id } : {}),
        ...(targetToken ? { targetToken } : {}),
        ...(inventory ? { inventory } : {}),
        sessionId: tabSession,
        generation: detail.bot.runGeneration,
      });
      if (scope.current.active && revision === scope.current.revision)
        setPendingPlan(response);
    });
  }
  async function confirm() {
    if (!session || !detail || !pendingPlan) return;
    await perform(async () => {
      if (
        session.mode === "external" &&
        !detail.executionCapabilities?.external?.verified
      )
        throw new Error(
          "Managed execution is unavailable for this external wallet until its account adapter and receipt recovery are verified.",
        );
      const reviewed = pendingPlan;
      const revision = scope.current.revision;
      const assertCurrent = () => {
        if (!scope.current.active || revision !== scope.current.revision)
          throw new Error(
            "Wallet or workspace changed. Review the action again.",
          );
      };
      await managedRequest(
        `/groups/${detail.group.id}/plans/${reviewed.plan.id}/confirm`,
        session,
        {
          digest: reviewed.digest,
          sessionId: tabSession,
          generation: reviewed.plan.runGeneration,
        },
      );
      assertCurrent();
      if (session.mode === "local-development") {
        const approved = await prepareDevWalletLifecyclePlan(
          session.token,
          reviewed.plan.id,
          { sessionId: tabSession, generation: reviewed.plan.runGeneration },
        );
        assertCurrent();
        if (!session.maxFeeWei || approved.maxFeeWei !== session.maxFeeWei)
          throw new Error(
            "Development signer fee cap changed. Reconnect and review the updated cap before signing.",
          );
        const outcome = await submitDevWalletPlan(
          session.token,
          approved,
          true,
        );
        setPendingPlan(undefined);
        setNotice(
          `Development signer returned ${outcome.state}. Reconcile to verify the position and remaining inventory.`,
        );
      } else {
        const attempt = await submitExternalManaged(
          session,
          reviewed.plan,
          tabSession,
          assertCurrent,
        );
        setPendingPlan(undefined);
        setNotice(
          `Wallet transaction ${attempt.status}: ${attempt.transactionHash ?? "hash unavailable"}. Reconcile before taking another action.`,
        );
      }
      const current = await managedRequest<GroupDetail>(
        `/groups/${detail.group.id}`,
        session,
      );
      await recoverWalletBatches(
        session,
        detail.group.id,
        current.transactions ?? [],
      );
      await managedRequest(`/groups/${detail.group.id}/reconcile`, session, {});
      await refresh();
    });
  }
  return {
    readInventory: async () => {
      if (!session || !detail)
        throw new Error("Authenticate the selected group first.");
      const snapshot = await managedRequest<{ balances: TokenAmount[] }>(
        `/groups/${detail.group.id}/inventory`,
        session,
      );
      return snapshot.balances;
    },
    pendingPlan,
    busy,
    error,
    notice,
    save,
    review,
    plan,
    confirm,
    dismissPlan: () => {
      scope.current.revision += 1;
      setPendingPlan(undefined);
    },
  };
}
