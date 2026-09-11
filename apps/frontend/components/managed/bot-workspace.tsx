import { useState } from "react";
import type { LPStrategyConfig } from "@/lib/managed";
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
  onAction,
  onClose,
  onSave,
  onReview,
  onPlan,
  onBack,
}: {
  detail: GroupDetail;
  busy: boolean;
  onAction: (
    kind: "start" | "resume" | "stop" | "takeover" | "reconcile",
  ) => Promise<void>;
  onClose: (token?: SelectedToken) => Promise<void>;
  onSave: (config: LPStrategyConfig) => Promise<void>;
  onReview: () => Promise<void>;
  onPlan: () => Promise<void>;
  onBack: () => void;
}) {
  const [tab, setTab] = useState("Strategy");
  const [editing, setEditing] = useState(false);
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
                config={detail.group.config}
                busy={busy}
                onSave={async (config) => {
                  await onSave(config);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <>
                <div className="managed-actions">
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEditing(true)}
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
                  <Button disabled={busy} onClick={() => void onPlan()}>
                    {detail.group.state === "draft"
                      ? "Review initial position"
                      : "Review proposed replacement"}
                  </Button>
                </div>
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
            onAction={onAction}
            onClose={onClose}
          />
        )}
      </div>
    </section>
  );
}
