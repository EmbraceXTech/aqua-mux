import { useState } from "react";
import {
  canonicalDigest,
  type TokenAmount,
  type LPStrategyConfig,
} from "@/lib/managed";
import type { GroupDetail } from "@/lib/managed-client/api";
import { Button } from "../ui/button";
import { StrategyView } from "./strategy-view";
import { PositionsView } from "./positions-view";
import { ActivityView } from "./activity-view";
import { ControlsView } from "./controls-view";
import { ConfigEditor } from "./config-editor";
import { titleLabel } from "./format";
import type { SelectedToken } from "./token-select";

export function BotWorkspace({
  detail,
  busy,
  stopBusy,
  onAction,
  onClose,
  onReadInventory,
  onSave,
  onReview,
  onPlan,
  onBack,
}: {
  detail: GroupDetail;
  busy: boolean;
  stopBusy: boolean;
  onAction: (
    kind: "start" | "resume" | "stop" | "takeover" | "reconcile",
  ) => Promise<void>;
  onClose: (token?: SelectedToken, inventory?: TokenAmount[]) => Promise<void>;
  onReadInventory: () => Promise<TokenAmount[]>;
  onSave: (config: LPStrategyConfig) => Promise<void>;
  onReview: () => Promise<void>;
  onPlan: () => Promise<void>;
  onBack: () => void;
}) {
  const [tab, setTab] = useState("Strategy");
  const [editing, setEditing] = useState<"current" | "suggested" | null>(null);
  const latestReview = detail.reviews?.toSorted(
    (a, b) => b.createdAt - a.createdAt,
  )[0];
  const suggested = latestReview?.result?.proposedConfig;
  const configChanged =
    !!suggested &&
    canonicalDigest(suggested) !== canonicalDigest(detail.group.config);
  const decision =
    latestReview?.status === "succeeded" &&
    latestReview.runGeneration === detail.bot.runGeneration
      ? latestReview.result?.decision
      : undefined;
  const canPlan =
    !configChanged &&
    !!decision &&
    ["fund-and-open", "replace", "close"].includes(decision);
  return (
    <section>
      <div className="managed-heading">
        <div>
          <span className="managed-eyebrow">MANAGED LIQUIDITY</span>
          <h1>{titleLabel(detail.group.config.recipeId)}</h1>
          <p>One maker wallet. One inventory group. Every action recorded.</p>
        </div>
        <div className="managed-actions">
          <span className="managed-badge">{titleLabel(detail.bot.state)}</span>
          <Button variant="ghost" onClick={onBack}>
            All strategies
          </Button>
        </div>
      </div>
      <div className="managed-tabs" role="tablist" aria-label="Bot workspace">
        {["Strategy", "Positions", "Activity", "Controls"].map((name) => (
          <button
            role="tab"
            tabIndex={tab === name ? 0 : -1}
            onKeyDown={(event) => {
              const names = ["Strategy", "Positions", "Activity", "Controls"];
              const index = names.indexOf(name);
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % names.length
                  : event.key === "ArrowLeft"
                    ? (index + names.length - 1) % names.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? names.length - 1
                        : null;
              if (next === null) return;
              event.preventDefault();
              setTab(names[next]);
              document
                .getElementById(`managed-tab-button-${names[next]}`)
                ?.focus();
            }}
            aria-selected={tab === name}
            aria-controls={`managed-tab-${name}`}
            id={`managed-tab-button-${name}`}
            key={name}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`managed-tab-${tab}`}
        aria-labelledby={`managed-tab-button-${tab}`}
      >
        {tab === "Strategy" && (
          <div className="managed-stack">
            {editing && detail.group.config.family === "lp" ? (
              <ConfigEditor
                config={
                  editing === "suggested" && suggested?.family === "lp"
                    ? suggested
                    : detail.group.config
                }
                busy={busy}
                onSave={async (config) => {
                  await onSave(config);
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            ) : (
              <>
                <div className="managed-actions">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEditing("current")}
                  >
                    Edit proposal
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => void onReview()}
                  >
                    Regenerate fresh review
                  </Button>
                  {configChanged && (
                    <Button
                      variant="outline"
                      disabled={busy}
                      onClick={() => setEditing("suggested")}
                    >
                      Review suggested changes
                    </Button>
                  )}
                  <Button
                    disabled={busy || !canPlan}
                    onClick={() => void onPlan()}
                  >
                    {canPlan
                      ? `Review ${titleLabel(decision!).toLowerCase()}`
                      : "No executable review"}
                  </Button>
                </div>
                {configChanged && (
                  <div className="managed-notice">
                    The agent proposed changed parameters. Review and save those
                    changes, then regenerate the review before preparing a plan.
                  </div>
                )}
                <StrategyView detail={detail} />
              </>
            )}
          </div>
        )}
        {tab === "Positions" && <PositionsView detail={detail} />}
        {tab === "Activity" && <ActivityView detail={detail} />}
        {tab === "Controls" && (
          <ControlsView
            detail={detail}
            busy={busy}
            stopBusy={stopBusy}
            onAction={onAction}
            onClose={onClose}
            onReadInventory={onReadInventory}
          />
        )}
      </div>
    </section>
  );
}
