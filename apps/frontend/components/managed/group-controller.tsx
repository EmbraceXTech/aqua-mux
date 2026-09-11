import type { ManagedSession } from "@/lib/managed-client/api";
import { useManagedGroup } from "@/lib/managed-client/use-managed-group";
import { useManagedActions } from "@/lib/managed-client/use-managed-actions";
import { BotWorkspace } from "./bot-workspace";
import { PlanReview } from "./plan-review";
import { Button } from "../ui/button";

export function GroupController({
  session,
  groupId,
  onBack,
}: {
  session: ManagedSession;
  groupId: string;
  onBack: () => void;
}) {
  const group = useManagedGroup(session, groupId);
  const actions = useManagedActions(
    session,
    group.detail,
    group.refresh,
    group.tabSession,
  );
  const catchAction = (operation: Promise<void>) =>
    operation.catch(() => {
      /* The action hook renders errors. */
    });
  const errors = [...new Set([group.error, actions.error].filter(Boolean))];
  return (
    <>
      {session.mode === "external" &&
        !group.detail?.executionCapabilities?.external?.verified && (
          <div className="managed-notice" style={{ marginBottom: 20 }}>
            External wallet mode supports proposals and record recovery. Managed
            transaction submission is unavailable until this wallet&apos;s
            account adapter and receipt recovery are verified.
          </div>
        )}
      {errors.length > 0 && (
        <div
          className="managed-notice managed-error"
          role="alert"
          style={{ marginBottom: 20 }}
        >
          {errors.map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}
      {actions.notice && (
        <div
          className="managed-notice"
          role="status"
          style={{ marginBottom: 20 }}
        >
          {actions.notice}
        </div>
      )}
      {group.detail ? (
        <BotWorkspace
          detail={group.detail}
          busy={group.busy || actions.busy}
          stopBusy={group.stopBusy}
          onAction={async (kind) => {
            if (kind === "stop") actions.dismissPlan();
            await group.action(kind);
          }}
          onClose={(token) =>
            catchAction(
              actions.plan(
                token ? "close-and-convert" : "close",
                token?.address,
              ),
            )
          }
          onSave={actions.save}
          onReview={() => catchAction(actions.review())}
          onPlan={() => {
            const review = group.detail!.reviews?.toSorted(
              (a, b) => b.createdAt - a.createdAt,
            )[0];
            const decision = review?.result?.decision;
            return decision === "fund-and-open" ||
              decision === "replace" ||
              decision === "close"
              ? catchAction(actions.plan(decision))
              : Promise.resolve();
          }}
          onBack={onBack}
        />
      ) : (
        <div className="managed-panel managed-stack">
          <p role="status">
            {group.error
              ? "Group records could not be loaded."
              : "Loading durable group records..."}
          </p>
          <Button
            variant="outline"
            onClick={() => void group.refresh().catch(() => {})}
          >
            Retry group recovery
          </Button>
          <Button variant="ghost" onClick={onBack}>
            Back to strategies
          </Button>
        </div>
      )}
      {actions.pendingPlan &&
        group.detail &&
        actions.pendingPlan.plan.runGeneration ===
          group.detail.bot.runGeneration && (
          <PlanReview
            key={actions.pendingPlan.plan.id}
            {...actions.pendingPlan}
            devWallet={session.mode === "local-development"}
            maxFeeWei={session.maxFeeWei}
            executionAvailable={
              session.mode === "local-development" ||
              group.detail.executionCapabilities?.external?.verified === true
            }
            busy={actions.busy}
            onConfirm={() => catchAction(actions.confirm())}
            onClose={actions.dismissPlan}
          />
        )}
    </>
  );
}
