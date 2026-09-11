import { useState } from "react";
import type { GroupDetail } from "@/lib/managed-client/api";
import { Button } from "../ui/button";
import { TokenSelect, type SelectedToken } from "./token-select";
import { dateLabel } from "./format";

export function ControlsView({
  detail,
  busy,
  stopBusy,
  onAction,
  onClose,
}: {
  detail: GroupDetail;
  busy: boolean;
  stopBusy: boolean;
  onAction: (
    kind: "start" | "resume" | "stop" | "takeover" | "reconcile",
  ) => Promise<void>;
  onClose: (target?: SelectedToken) => Promise<void>;
}) {
  const [target, setTarget] = useState<SelectedToken>();
  const [consent, setConsent] = useState(false);
  const running = detail.bot.state === "running";
  return (
    <div className="managed-layout">
      <section className="managed-panel managed-stack">
        <h2>Browser management</h2>
        <p>
          Run starts periodic agent reviews while this tab maintains the backend
          lease. Every proposed transaction still needs your confirmation.
        </p>
        <div className="managed-notice">
          Lease timeout:{" "}
          {detail.leaseTimeoutMs == null
            ? "unavailable"
            : `${detail.leaseTimeoutMs / 1000} seconds`}
          . Lease expiry: {dateLabel(detail.bot.lease?.expiresAt)}. Background
          tabs and device sleep can pause reviews. Stop does not cancel
          submitted transactions or close positions.
        </div>
        <label className="managed-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
          />
          I want this browser to request recurring reviews under the displayed
          policy. I understand positions can remain fillable after management
          stops.
        </label>
        <div className="managed-actions">
          <Button
            disabled={busy || running || !consent}
            onClick={() =>
              void onAction(detail.bot.state === "idle" ? "start" : "resume")
            }
          >
            Run bot
          </Button>
          <Button
            variant="outline"
            disabled={stopBusy || detail.bot.state === "stopped"}
            onClick={() => void onAction("stop")}
          >
            Stop bot
          </Button>
          <Button
            variant="ghost"
            disabled={busy}
            onClick={() => void onAction("reconcile")}
          >
            Reconcile and recover
          </Button>
        </div>
        {detail.bot.lease && (
          <Button
            variant="outline"
            disabled={busy || !consent}
            onClick={() => void onAction("takeover")}
          >
            Take over reviews in this tab
          </Button>
        )}
        <p className="managed-footnote">
          {detail.bot.stopReason ?? "There is no recorded stop reason."}
        </p>
        <h3>Automation authorization</h3>
        <p>
          Delegated automation is unavailable for this wallet. Every transaction
          requires owner confirmation.
        </p>
        <Button variant="outline" disabled>
          Revoke automation unavailable
        </Button>
        <p className="managed-footnote">
          No delegated signer is enabled by this workspace. Owner-confirmed
          closing remains a separate action.
        </p>
      </section>
      <section className="managed-panel managed-stack">
        <h2>Close managed positions</h2>
        <p>
          Close stops management and prepares a transaction to dock this
          group&apos;s positions. Tokens remain in the maker wallet after
          confirmation.
        </p>
        <Button
          variant="outline"
          disabled={busy || detail.group.state === "closed"}
          onClick={() => void onClose()}
        >
          Review close positions
        </Button>
        <hr />
        <h3>Close and convert</h3>
        <p>
          Convert only the selected group&apos;s attributable inventory to one
          token. Review amounts, minimum receipts, gas reserve, and residuals
          before confirming.
        </p>
        <TokenSelect
          chainId={detail.group.chainId}
          label="Conversion destination"
          value={target}
          onChange={setTarget}
        />
        <Button
          disabled={busy || !target || detail.group.state === "closed"}
          onClick={() => void onClose(target)}
        >
          Review close and convert
        </Button>
        <p className="managed-footnote">
          If conversion is unavailable, close-only remains a separate choice. A
          combined request is never silently split into multiple transactions.
        </p>
      </section>
    </div>
  );
}
