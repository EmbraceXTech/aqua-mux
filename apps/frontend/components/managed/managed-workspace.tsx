"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import type { BotRun, ReviewRecord, StrategyGroup } from "@/lib/managed";
import {
  managedRequest,
  requestKey,
  type ManagedSession,
} from "@/lib/managed-client/api";
import type { useManagedSession } from "@/lib/managed-client/use-managed-session";
import { StrategyCatalog, type RecipeId } from "./strategy-catalog";
import { ProposalForm, type ProposalIntent } from "./proposal-form";
import { WalletBar } from "./wallet-bar";
import { GroupController } from "./group-controller";
import { ReviewResultCard } from "./review-result";
import { titleLabel } from "./format";

export function ManagedWorkspace({
  wallet,
}: {
  wallet: ReturnType<typeof useManagedSession>;
}) {
  return (
    <main className="managed-main">
      <WalletBar
        session={wallet.session}
        busy={wallet.busy}
        onConnect={async (mode) => { await wallet.connect(mode); }}
        onDisconnect={wallet.disconnect}
      />
      {wallet.error && (
        <div className="managed-notice managed-error" role="alert">
          {wallet.error}
        </div>
      )}
      <ManagedContent
        key={wallet.session?.sessionId ?? "disconnected"}
        session={wallet.session}
      />
    </main>
  );
}

function ManagedContent({ session }: { session?: ManagedSession }) {
  const [recipe, setRecipe] = useState<RecipeId>();
  const [groupId, setGroupId] = useState<string>();
  const [groups, setGroups] = useState<StrategyGroup[]>([]);
  const [proposal, setProposal] = useState<ReviewRecord>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const revision = useRef(0);
  useEffect(() => {
    return () => {
      revision.current += 1;
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (session && !groupId)
      managedRequest<{ groups: StrategyGroup[] }>(
        "/groups",
        session,
        undefined,
        undefined,
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted) {
            setGroups(result.groups);
            setError("");
          }
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setError(cause.message);
        });
    return () => controller.abort();
  }, [session, groupId]);
  function leave() {
    revision.current += 1;
    setBusy(false);
    setGroupId(undefined);
    setRecipe(undefined);
    setProposal(undefined);
    setError("");
  }
  async function propose(intent: ProposalIntent) {
    if (!session) return;
    const requestRevision = ++revision.current;
    setBusy(true);
    setError("");
    setProposal(undefined);
    try {
      const result = await managedRequest<{
        review: ReviewRecord;
        group?: StrategyGroup;
        bot?: BotRun;
      }>("/proposals", session, { idempotencyKey: requestKey(), intent });
      if (requestRevision !== revision.current) return;
      setProposal(result.review);
      if (result.group) {
        setGroupId(result.group.id);
        setRecipe(undefined);
      }
    } catch (cause) {
      if (requestRevision === revision.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "Fresh proposal unavailable.",
        );
    } finally {
      if (requestRevision === revision.current) setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <div className="managed-notice managed-error" role="alert">
          {error}
        </div>
      )}
      {session && !groupId && groups.length > 0 && (
        <section className="managed-panel" style={{ marginBottom: 28 }}>
          <h2>Recover a managed group</h2>
          <div className="managed-actions">
            {groups.map((item) => (
              <Button
                variant="outline"
                key={item.id}
                onClick={() => {
                  leave();
                  setGroupId(item.id);
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
      {groupId && session ? (
        <GroupController
          key={groupId}
          session={session}
          groupId={groupId}
          onBack={leave}
        />
      ) : recipe ? (
        <ProposalForm
          recipe={recipe}
          account={session?.owner}
          session={session}
          busy={busy}
          onSubmit={propose}
          onBack={leave}
        />
      ) : (
        <StrategyCatalog
          onSelect={(value) => {
            leave();
            setRecipe(value);
          }}
        />
      )}
      {proposal && (
        <div style={{ marginTop: 24 }}>
          <ReviewResultCard review={proposal} />
        </div>
      )}
    </>
  );
}
