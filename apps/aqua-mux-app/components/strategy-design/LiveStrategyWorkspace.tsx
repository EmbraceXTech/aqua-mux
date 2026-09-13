"use client";

import { useState, type ComponentProps } from "react";
import {
  Activity,
  ArrowLeft,
  Check,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { canonicalDigest } from "@/lib/managed";
import type { BotWorkspace } from "@/components/managed/bot-workspace";
import { StrategyView } from "@/components/managed/strategy-view";
import { ActivityView } from "@/components/managed/activity-view";
import { PositionsView } from "@/components/managed/positions-view";
import { ControlsView } from "@/components/managed/controls-view";
import { ConfigEditor } from "@/components/managed/config-editor";
import { titleLabel } from "@/components/managed/format";
import s from "./strategy-design.module.css";

export function LiveStrategyWorkspace(
  props: ComponentProps<typeof BotWorkspace>,
) {
  const { detail, busy, stopBusy, onAction, onReview, onPlan, onSave, onBack } =
    props;
  const [editing, setEditing] = useState<"current" | "suggested" | null>(null);
  const [consent, setConsent] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const review = detail.reviews?.toSorted(
    (a, b) => b.createdAt - a.createdAt,
  )[0];
  const suggested = review?.result?.proposedConfig;
  const changed =
    !!suggested &&
    canonicalDigest(suggested) !== canonicalDigest(detail.group.config);
  const current =
    review?.status === "succeeded" &&
    review.runGeneration === detail.bot.runGeneration;
  const decision = current ? review.result?.decision : undefined;
  const canPlan =
    !changed &&
    !!decision &&
    ["fund-and-open", "replace", "close"].includes(decision);
  const running = detail.bot.state === "running";
  const config = detail.group.config;
  return (
    <>
      <div className={s.positionHeading}>
        <div>
          <span className={s.eyebrow}>
            {titleLabel(config.recipeId)} · CHAIN {config.chainId}
          </span>
          <h2>Your strategy workspace</h2>
        </div>
        <button className={s.secondary} onClick={onBack}>
          <ArrowLeft size={16} />
          All strategies
        </button>
      </div>
      <div className={s.statGrid}>
        <div>
          <span>Shared base inventory</span>
          <strong>
            {[
              ...new Set(config.pairs.map((pair) => pair.baseToken.symbol)),
            ].join(" / ")}
          </strong>
          <p>Exact configured reserves shown below. Not a live valuation.</p>
        </div>
        <div>
          <span>Liquidity markets</span>
          <strong>
            {config.pairs.length}{" "}
            <small>{config.pairs.length === 1 ? "pair" : "pairs"}</small>
          </strong>
          <p>
            {config.pairs
              .map(
                (pair) =>
                  `${pair.baseToken.symbol} / ${pair.quoteToken.symbol}`,
              )
              .join(" · ")}
          </p>
        </div>
        <div>
          <span>Management status</span>
          <strong className={running ? s.green : s.neutral}>
            {titleLabel(detail.bot.state)}
          </strong>
          <p>
            {running
              ? "Browser reviews require an active lease"
              : "Management is not running"}
          </p>
        </div>
      </div>
      <div className={s.workspace}>
        <section className={s.panel}>
          <div className={s.panelTitle}>
            <span className={s.recipeIcon}>
              <Activity size={20} />
            </span>
            <div>
              <h2>Strategy activity</h2>
              <p>Recorded decisions, with the evidence behind each.</p>
            </div>
          </div>
          <div className={s.decision}>
            <span className={s.tag}>
              {decision ? titleLabel(decision) : "FRESH REVIEW REQUIRED"}
            </span>
            <h3>
              {decision
                ? "Your latest strategy decision"
                : "No current executable decision."}
            </h3>
            <p>
              {current
                ? review?.result?.rationale
                : "Request a fresh review before preparing an execution plan. No transaction is authorized by this summary."}
            </p>
            <span>
              <Check size={14} />
              Every transaction requires confirmation
            </span>
          </div>
          <div className={s.actions}>
            <button
              className={s.secondary}
              disabled={busy}
              onClick={() => void onReview()}
            >
              <RotateCcw size={15} />
              Run a fresh review
            </button>
            <button
              className={s.primary}
              disabled={busy || !canPlan}
              onClick={() => void onPlan()}
            >
              {canPlan
                ? `Review ${titleLabel(decision!).toLowerCase()}`
                : "No executable review"}
            </button>
          </div>
          {changed && (
            <div className={s.warning}>
              <ShieldCheck size={18} />
              <div>
                <p>
                  The review proposes changed parameters. Inspect and save them,
                  then request a fresh review before preparing a plan.
                </p>
                <button
                  className={s.textButton}
                  disabled={busy}
                  onClick={() => setEditing("suggested")}
                >
                  Review suggested changes
                </button>
              </div>
            </div>
          )}
          <div className={s.subheading}>
            <h3>Activity log</h3>
            <span>Saved records</span>
          </div>
          <ActivityView detail={detail} />
        </section>
        <aside className={s.sidebar}>
          <section className={s.previewPanel}>
            <span className={s.eyebrow}>MANAGEMENT CONTROLS</span>
            <h2>You make the call.</h2>
            <dl className={s.facts}>
              <div>
                <dt>Slippage limit</dt>
                <dd>{config.policy.maxSlippageBps.value / 100}%</dd>
              </div>
              <div>
                <dt>Group status</dt>
                <dd>{titleLabel(detail.group.state)}</dd>
              </div>
              <div>
                <dt>Approval</dt>
                <dd>Every transaction</dd>
              </div>
            </dl>
            <label className={s.checkbox}>
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <span>
                Allow recurring reviews in this browser. Existing positions may
                still fill after reviews stop.
              </span>
            </label>
            <button
              className={s.secondary}
              disabled={
                busy || running || !consent || detail.group.state === "closed"
              }
              onClick={() =>
                void onAction(detail.bot.state === "idle" ? "start" : "resume")
              }
            >
              <Play size={15} />
              {detail.bot.state === "idle" ? "Start reviews" : "Resume reviews"}
            </button>
            {!confirmStop && (
              <button
                className={s.dangerButton}
                disabled={stopBusy || detail.bot.state === "stopped"}
                onClick={() => setConfirmStop(true)}
              >
                <Pause size={15} />
                Stop management
              </button>
            )}
            {confirmStop && (
              <div className={s.stopConfirm}>
                <strong>Stop this strategy&apos;s management?</strong>
                <p>
                  Reviews stop. Existing liquidity is not withdrawn and
                  submitted transactions are not cancelled.
                </p>
                <div>
                  <button
                    className={s.secondary}
                    disabled={stopBusy}
                    onClick={() => setConfirmStop(false)}
                  >
                    Cancel
                  </button>
                  <button
                    className={s.dangerButton}
                    disabled={stopBusy}
                    onClick={async () => {
                      await onAction("stop");
                      setConfirmStop(false);
                    }}
                  >
                    Confirm stop
                  </button>
                </div>
              </div>
            )}
            <button
              className={s.textButton}
              disabled={busy}
              onClick={() => void onAction("reconcile")}
            >
              Reconcile and recover
            </button>
            {detail.bot.lease && (
              <button
                className={s.textButton}
                disabled={busy || !consent}
                onClick={() => void onAction("takeover")}
              >
                Take over reviews in this tab
              </button>
            )}
          </section>
          <div className={s.riskNote}>
            <ShieldCheck size={18} />
            <p>
              Closing the browser stops recurring reviews when the lease
              expires. Closing liquidity requires a separate approved
              transaction.
            </p>
          </div>
        </aside>
      </div>
      <div className={s.subheading}>
        <h3>Saved allocations and ranges</h3>
        <button
          className={s.textButton}
          disabled={busy}
          onClick={() => setEditing("current")}
        >
          Edit proposal
        </button>
      </div>
      {editing && config.family === "lp" ? (
        <ConfigEditor
          config={
            editing === "suggested" && suggested?.family === "lp"
              ? suggested
              : config
          }
          busy={busy}
          onSave={async (value) => {
            await onSave(value);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <StrategyView detail={detail} />
      )}
      <details className={s.faq}>
        <summary>Positions and transaction history</summary>
        <PositionsView detail={detail} />
      </details>
      <details className={s.faq}>
        <summary>Close positions and advanced management</summary>
        <ControlsView
          detail={detail}
          busy={busy}
          stopBusy={stopBusy}
          onAction={onAction}
          onClose={props.onClose}
          onReadInventory={props.onReadInventory}
        />
      </details>
    </>
  );
}
