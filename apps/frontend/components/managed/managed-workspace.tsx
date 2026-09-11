"use client";
import { useEffect, useState } from "react";
import { Button } from "../ui/button";
import type { BotRun, ReviewRecord, StrategyGroup } from "@/lib/managed";
import { managedRequest, requestKey } from "@/lib/managed-client/api";
import { useManagedSession } from "@/lib/managed-client/use-managed-session";
import { useManagedGroup } from "@/lib/managed-client/use-managed-group";
import { useManagedActions } from "@/lib/managed-client/use-managed-actions";
import { StrategyCatalog, type RecipeId } from "./strategy-catalog";
import { ProposalForm, type ProposalIntent } from "./proposal-form";
import { WalletBar } from "./wallet-bar";
import { BotWorkspace } from "./bot-workspace";
import { PlanReview } from "./plan-review";
import { ReviewResultCard } from "./review-result";
import { titleLabel } from "./format";

export function ManagedWorkspace() {
  const wallet = useManagedSession();
  const [recipe, setRecipe] = useState<RecipeId>();
  const [groupId, setGroupId] = useState<string>();
  const [groups, setGroups] = useState<StrategyGroup[]>([]);
  const [proposal, setProposal] = useState<ReviewRecord>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const group = useManagedGroup(wallet.session, groupId);
  const actions = useManagedActions(
    wallet.session,
    group.detail,
    group.refresh,
    group.tabSession,
  );
  useEffect(() => {
    const controller = new AbortController();
    if (wallet.session)
      managedRequest<{ groups: StrategyGroup[] }>(
        "/groups",
        wallet.session,
        undefined,
        undefined,
        controller.signal,
      )
        .then((result) => {
          setGroups(result.groups);
          setError("");
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause.message);
        });
    return () => controller.abort();
  }, [wallet.session, group.detail?.group.updatedAt]);
  async function propose(intent: ProposalIntent) {
    if (!wallet.session) return;
    setBusy(true);
    setError("");
    setProposal(undefined);
    try {
      const result = await managedRequest<{
        review: ReviewRecord;
        group?: StrategyGroup;
        bot?: BotRun;
      }>("/proposals", wallet.session, {
        idempotencyKey: requestKey(),
        intent,
      });
      setProposal(result.review);
      if (result.group) {
        setGroupId(result.group.id);
        setRecipe(undefined);
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Fresh proposal unavailable.",
      );
    } finally {
      setBusy(false);
    }
  }
  const working = busy || wallet.busy || group.busy || actions.busy;
  const errors = [wallet.error, error, group.error, actions.error].filter(
    Boolean,
  );
  const catchAction = (operation: Promise<void>) =>
    operation.catch(() => {
      /* Action hook exposes the error in the workspace. */
    });
  return (
    <main className="managed-main">
      <WalletBar
        session={wallet.session}
        busy={working}
        onConnect={wallet.connect}
        onDisconnect={async () => {
          await wallet.disconnect();
          setGroupId(undefined);
          setGroups([]);
          setProposal(undefined);
        }}
      />
      {errors.length > 0 && (
        <div
          className="managed-notice managed-error"
          role="alert"
          style={{ marginBottom: 20 }}
        >
          {[...new Set(errors)].map((message) => (
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
      {wallet.session && !groupId && groups.length > 0 && (
        <section className="managed-panel" style={{ marginBottom: 28 }}>
          <h2>Recover a managed group</h2>
          <div className="managed-actions">
            {groups.map((item) => (
              <Button
                variant="outline"
                key={item.id}
                onClick={() => {
                  setGroupId(item.id);
                  setRecipe(undefined);
                  setProposal(undefined);
                }}
              >
                {titleLabel(item.config.recipeId)} / {item.state} /{" "}
                {item.id.slice(0, 8)}
              </Button>
            ))}
          </div>
          <p className="managed-footnote">
            Groups load from authenticated backend records. Reconcile current
            chain state before resuming.
          </p>
        </section>
      )}
      {groupId && wallet.session ? (
        group.detail ? (
          <BotWorkspace
            key={groupId}
            detail={group.detail}
            busy={working}
            onAction={group.action}
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
            onPlan={() =>
              catchAction(
                actions.plan(
                  group.detail!.group.state === "draft"
                    ? "fund-and-open"
                    : "replace",
                ),
              )
            }
            onBack={() => {
              setGroupId(undefined);
              setProposal(undefined);
            }}
          />
        ) : (
          <div className="managed-panel managed-stack">
            <p role="status">Loading durable group records...</p>
            <Button variant="outline" onClick={() => setGroupId(undefined)}>
              Back to strategies
            </Button>
          </div>
        )
      ) : recipe ? (
        <ProposalForm
          recipe={recipe}
          account={wallet.session?.owner}
          busy={working}
          onSubmit={propose}
          onBack={() => {
            setRecipe(undefined);
            setProposal(undefined);
          }}
        />
      ) : (
        <StrategyCatalog
          onSelect={(value) => {
            setRecipe(value);
            setProposal(undefined);
          }}
        />
      )}
      {proposal && (
        <div style={{ marginTop: 24 }}>
          <ReviewResultCard review={proposal} />
        </div>
      )}
      {actions.pendingPlan && (
        <PlanReview
          key={actions.pendingPlan.plan.id}
          {...actions.pendingPlan}
          devWallet={wallet.session?.mode === "local-development"}
          busy={working}
          onConfirm={() => catchAction(actions.confirm())}
          onClose={actions.dismissPlan}
        />
      )}
    </main>
  );
}
