import { useState } from "react";
import type {
  LifecyclePlan,
  LPStrategyConfig,
  ReviewRecord,
} from "@/lib/managed";
import { submitPlan } from "@/lib/wallet";
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
      await managedRequest(
        `/groups/${detail.group.id}`,
        session,
        { config },
        "PATCH",
      );
      setPendingPlan(undefined);
      await refresh();
      setNotice(
        "Configuration saved. Previous plans are invalid. Generate a fresh review.",
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
  async function plan(action: LifecyclePlan["kind"], targetToken?: string) {
    if (!session || !detail) return;
    await perform(async () => {
      const review = detail.reviews
        ?.toSorted((a, b) => b.createdAt - a.createdAt)
        .find((item) => item.status === "succeeded");
      const response = await managedRequest<{
        plan: LifecyclePlan;
        digest: string;
      }>(`/groups/${detail.group.id}/plans`, session, {
        action,
        ...(review ? { reviewId: review.id } : {}),
        ...(targetToken ? { targetToken } : {}),
      });
      setPendingPlan(response);
    });
  }
  async function confirm() {
    if (!session || !detail || !pendingPlan) return;
    await perform(async () => {
      const reviewed = pendingPlan;
      await managedRequest(
        `/groups/${detail.group.id}/plans/${reviewed.plan.id}/confirm`,
        session,
        {
          digest: reviewed.digest,
          sessionId: tabSession,
          generation: reviewed.plan.runGeneration,
        },
      );
      const idempotencyKey = requestKey();
      await managedRequest(`/groups/${detail.group.id}/attempts`, session, {
        planId: reviewed.plan.id,
        idempotencyKey,
      });
      let submitted: { walletBatchId?: string; transactionHash?: string };
      if (session.mode === "local-development") {
        const approved = await prepareDevWalletLifecyclePlan(
          session.token,
          reviewed.plan.id,
        );
        const outcome = await submitDevWalletPlan(
          session.token,
          approved,
          true,
        );
        submitted = {
          walletBatchId: outcome.id,
          transactionHash: outcome.transactionHash,
        };
      } else {
        const walletBatchId = await submitPlan({
          chainId: reviewed.plan.chainId,
          account: reviewed.plan.maker,
          mode: "liquidity",
          calls: reviewed.plan.calls,
          createdAt: reviewed.plan.createdAt,
          expiresAt: reviewed.plan.expiresAt,
          summary: reviewed.plan.expectedEffects,
          strategies: [],
        });
        submitted = { walletBatchId };
      }
      setPendingPlan(undefined);
      setNotice(
        "Submission returned. Reconciliation must confirm the on-chain result before the position is shown as active.",
      );
      await managedRequest(`/groups/${detail.group.id}/attempts`, session, {
        planId: reviewed.plan.id,
        idempotencyKey,
        ...submitted,
      });
      await managedRequest(`/groups/${detail.group.id}/reconcile`, session, {});
      await refresh();
    });
  }
  return {
    pendingPlan,
    busy,
    error,
    notice,
    save,
    review,
    plan,
    confirm,
    dismissPlan: () => setPendingPlan(undefined),
  };
}
