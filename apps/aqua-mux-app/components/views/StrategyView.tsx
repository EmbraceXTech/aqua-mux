"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Layers3, RefreshCw } from "lucide-react";
import { StrategyDesign } from "@/components/strategy-design/StrategyDesign";
import { LiveStrategyForm } from "@/components/strategy-design/LiveStrategyForm";
import { OwnerRecovery } from "@/components/managed/owner-recovery";
import { WalletBar } from "@/components/managed/wallet-bar";
import { GroupController } from "@/components/managed/group-controller";
import { ProposalHistory } from "@/components/managed/proposal-history";
import { ReviewResultCard } from "@/components/managed/review-result";
import { titleLabel } from "@/components/managed/format";
import type { ProposalIntent } from "@/components/managed/proposal-form";
import { useManagedSession } from "@/lib/managed-client/use-managed-session";
import { selectedChainId } from "@/lib/selected-chain";
import { managedRequest, requestKey } from "@/lib/managed-client/api";
import type { ReviewRecord, StrategyGroup } from "@/lib/managed";
import s from "@/components/strategy-design/strategy-design.module.css";
import live from "@/components/strategy-design/live-strategy.module.css";

const recipeIds = {
  wide: "wide-range-lp",
  managed: "managed-concentrated-lp",
  upward: "upward-only-lp",
} as const;

export function StrategyView() {
  const wallet = useManagedSession(selectedChainId());
  return (
    <StrategyWorkspace
      key={wallet.session?.sessionId ?? "anonymous"}
      wallet={wallet}
    />
  );
}

function StrategyWorkspace({
  wallet,
}: {
  wallet: ReturnType<typeof useManagedSession>;
}) {
  const session = wallet.session;
  const [groups, setGroups] = useState<StrategyGroup[]>([]);
  const [groupId, setGroupId] = useState<string>();
  const [proposal, setProposal] = useState<ReviewRecord>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!session);
  const [reload, setReload] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
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
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load strategies.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [session, reload]);

  async function propose(intent: ProposalIntent) {
    if (!session) return false;
    const result = await managedRequest<{
      review: ReviewRecord;
      group?: StrategyGroup;
    }>("/proposals", session, { idempotencyKey: requestKey(), intent });
    if (!alive.current) return false;
    setProposal(result.review);
    setGroupId(result.group?.id);
    if (result.group)
      setGroups((old) => [
        result.group!,
        ...old.filter((group) => group.id !== result.group!.id),
      ]);
    return true;
  }

  return (
    <div className={live.root}>
      <StrategyDesign
        live={{
          walletLabel: session
            ? `${session.owner.slice(0, 6)}...${session.owner.slice(-4)}`
            : "Connect wallet",
          count: groups.length,
          wallet: (
            <>
              <WalletBar
                session={session}
                busy={wallet.busy}
                developmentWallet={wallet.developmentWallet}
                onConnect={async (mode) => {
                  await wallet.connect(mode);
                }}
                onDisconnect={wallet.disconnect}
              />
            </>
          ),
          status: (
            <>
              {wallet.error && (
                <div className={s.warning} role="alert">
                  {wallet.error}
                </div>
              )}
              <OwnerRecovery session={session} />
            </>
          ),
          configure: (recipe, custom, navigation) => (
            <LiveStrategyForm
              key={`${recipe}-${custom}`}
              recipe={recipeIds[recipe]}
              custom={custom}
              session={session}
              onSubmit={propose}
              navigation={navigation}
            />
          ),
          positions: (
            <>
              {error && (
                <div className={s.warning} role="alert">
                  {error}
                  <button
                    className={s.textButton}
                    onClick={() => {
                      setLoading(true);
                      setReload((value) => value + 1);
                    }}
                  >
                    Retry
                  </button>
                </div>
              )}
              {session && groupId ? (
                <GroupController
                  design
                  key={groupId}
                  session={session}
                  groupId={groupId}
                  onBack={() => {
                    setGroupId(undefined);
                    setProposal(undefined);
                    setReload((value) => value + 1);
                  }}
                />
              ) : (
                <>
                  {loading && (
                    <p role="status">Loading your saved strategies...</p>
                  )}
                  {!loading && groups.length === 0 && (
                    <section className={s.empty}>
                      <span className={s.recipeIcon}>
                        <Layers3 size={28} />
                      </span>
                      <h2>Your first strategy starts here.</h2>
                      <p>
                        {session
                          ? "Choose an approach in Discover strategies to create a fresh proposal."
                          : "Connect your wallet to recover saved strategies or choose an approach to get started."}
                      </p>
                      <small>
                        Proposals do not move funds. Every transaction requires
                        approval.
                      </small>
                    </section>
                  )}
                  {groups.length > 0 && (
                    <>
                      <div className={s.positionHeading}>
                        <h2>Your saved strategies</h2>
                        <button
                          className={s.secondary}
                          disabled={loading}
                          onClick={() => {
                            setLoading(true);
                            setReload((value) => value + 1);
                          }}
                        >
                          <RefreshCw size={15} />
                          Refresh
                        </button>
                      </div>
                      <div className={s.recipeGrid}>
                        {groups.map((group) => (
                          <article className={s.recipeCard} key={group.id}>
                            <span className={s.tag}>
                              {titleLabel(group.state)}
                            </span>
                            <h3>{titleLabel(group.config.recipeId)}</h3>
                            <p>
                              {group.config.pairs.length} markets ·{" "}
                              {group.config.chainId === 42161
                                ? "Arbitrum"
                                : `Chain ${group.config.chainId}`}
                            </p>
                            <p>Group {group.id.slice(0, 8)}</p>
                            <button
                              className={s.secondary}
                              onClick={() => {
                                setProposal(undefined);
                                setGroupId(group.id);
                              }}
                            >
                              Open strategy
                              <ArrowRight size={16} />
                            </button>
                          </article>
                        ))}
                      </div>
                    </>
                  )}
                  {session && (
                    <ProposalHistory
                      session={session}
                      onOpen={(id) => {
                        setProposal(undefined);
                        setGroupId(id);
                      }}
                    />
                  )}
                </>
              )}
              {proposal && <ReviewResultCard review={proposal} />}
            </>
          ),
        }}
      />
    </div>
  );
}
