import { useEffect, useState } from "react";
import type { LifecyclePlan } from "@/lib/managed";
import { Button } from "../ui/button";
import { Modal } from "../ui/modal";
import { amountLabel, dateLabel, titleLabel } from "./format";

export function PlanReview({
  plan,
  digest,
  devWallet,
  busy,
  onConfirm,
  onClose,
}: {
  plan: LifecyclePlan;
  digest: string;
  devWallet: boolean;
  busy: boolean;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}) {
  const [confirmed, setConfirmed] = useState(false);
  const [expired, setExpired] = useState(() => Date.now() >= plan.expiresAt);
  useEffect(() => {
    const timer = setTimeout(
      () => setExpired(true),
      Math.max(0, plan.expiresAt - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [plan.expiresAt]);
  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
      title={`Review ${titleLabel(plan.kind).toLowerCase()}`}
      description="Confirm the exact plan below. An agent proposal alone does not authorize execution."
    >
      <div className="managed-stack">
        <div className="managed-notice">
          <strong>
            {devWallet ? "LOCAL DEVELOPMENT WALLET" : "External wallet"}
          </strong>
          <div className="managed-address">{plan.maker}</div>Chain ID{" "}
          {plan.chainId}. {plan.calls.length} calls in an atomic batch.
        </div>
        <dl className="managed-facts">
          <div>
            <dt>Plan expires</dt>
            <dd>{dateLabel(plan.expiresAt)}</dd>
          </div>
          <div>
            <dt>Run generation</dt>
            <dd>{plan.runGeneration}</dd>
          </div>
        </dl>
        <section>
          <h3>Expected effects</h3>
          <ul>
            {plan.expectedEffects.map((effect, index) => (
              <li key={index}>{effect}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Minimum receipts</h3>
          {plan.minimumReceipts.length ? (
            <ul>
              {plan.minimumReceipts.map((item) => (
                <li key={item.token.address}>{amountLabel(item)}</li>
              ))}
            </ul>
          ) : (
            <p>No swap minimum receipts in this plan.</p>
          )}
        </section>
        <details>
          <summary>Review calls and binding</summary>
          <ol>
            {plan.calls.map((call, index) => (
              <li key={index}>
                <strong>{call.label}</strong>
                <div className="managed-address">{call.to}</div>
                <small>Native value {call.value}</small>
                <details>
                  <summary>Call data</summary>
                  <p className="managed-address">{call.data}</p>
                </details>
              </li>
            ))}
          </ol>
          <p className="managed-address">Plan digest: {digest}</p>
          <p className="managed-address">Configuration: {plan.configDigest}</p>
          <p className="managed-address">Snapshot: {plan.snapshotDigest}</p>
          <p className="managed-address">Policy: {plan.policyDigest}</p>
        </details>
        <label className="managed-consent">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I confirm this maker, chain, plan, and minimum receipts.
          {devWallet
            ? " I authorize the local development signer to submit this reviewed action."
            : " I will verify the batch in my wallet."}
        </label>
        {expired && (
          <div role="alert" className="managed-notice managed-error">
            This plan has expired. Close this review and request a fresh plan.
          </div>
        )}
        <Button
          disabled={busy || !confirmed || expired}
          onClick={() => void onConfirm()}
        >
          {busy
            ? "Submitting reviewed action..."
            : devWallet
              ? "Confirm with development wallet"
              : "Confirm and open wallet"}
        </Button>
      </div>
    </Modal>
  );
}
