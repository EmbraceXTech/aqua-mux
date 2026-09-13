import { ArrowRight } from "lucide-react";
import type { SwapWorkspace } from "@/hooks/useSwapWorkspace";
import { SWAP_CHAIN, V3_ROUTER, type LiveQuote } from "@/lib/live-swap";
import { SwapReviewSummary } from "./swap-review-summary";
import styles from "./swap.module.css";

type Props = {
  quote: LiveQuote;
  account: string;
  valid: boolean;
  locked: boolean;
  trade: Pick<
    SwapWorkspace["trade"],
    | "approvalsFor"
    | "error"
    | "busy"
    | "awaitingWallet"
    | "pending"
    | "clock"
    | "walletChain"
    | "insufficient"
  >;
  onSubmit: SwapWorkspace["submit"];
  onClose: () => void;
  onRefresh: () => void;
};
function ReviewAction({
  quote,
  valid,
  locked,
  trade,
  onSubmit,
  onRefresh,
}: Omit<Props, "account" | "onClose">) {
  const approval = trade.approvalsFor(quote)[0];
  if (trade.awaitingWallet) {
    const deadline = trade.awaitingWallet.deadline;
    const expired = deadline !== undefined && trade.clock >= deadline;
    return (
      <p role="status" className={styles.settingsNote}>
        {expired
          ? "The transaction deadline has passed. Reject this request in MetaMask. Confirming it now cannot complete the swap."
          : `Waiting for your wallet decision.${deadline ? ` Confirm within ${Math.max(0, Math.ceil((deadline - trade.clock) / 1000))} seconds or reject the request.` : ""} No additional request will be sent automatically.`}
      </p>
    );
  }
  if (trade.pending)
    return (
      <p role="status" className={styles.settingsNote}>
        {trade.pending.label} pending.{" "}
        <a
          href={`https://arbiscan.io/tx/${trade.pending.hash}`}
          target="_blank"
          rel="noreferrer"
        >
          View transaction
        </a>
      </p>
    );
  if (!valid)
    return (
      <>
        <p role="alert" className={styles.warning}>
          Review expired or wallet changed. Refresh for current amounts and
          limits.
        </p>
        <button
          className={styles.primaryButton}
          disabled={locked}
          onClick={onRefresh}
        >
          Refresh quote
        </button>
      </>
    );
  if (approval)
    return (
      <>
        <p className={styles.settingsNote}>
          {approval.reset
            ? `Reset the existing ${approval.symbol} allowance to zero first.`
            : `Approve only the reviewed maximum ${approval.symbol} spend.`}{" "}
          Spender: {V3_ROUTER}. Approval is separate from the swap. Refresh and
          review after confirmation.
        </p>
        <button
          className={styles.primaryButton}
          disabled={locked || trade.walletChain !== SWAP_CHAIN}
          onClick={() => void onSubmit(approval)}
        >
          {trade.busy
            ? "Check wallet…"
            : `${approval.reset ? "Reset" : "Approve"} ${approval.symbol} in wallet`}
        </button>
      </>
    );
  return (
    <button
      className={styles.primaryButton}
      disabled={
        locked ||
        trade.insufficient.length > 0 ||
        trade.walletChain !== SWAP_CHAIN
      }
      onClick={() => void onSubmit()}
    >
      {trade.busy ? "Check wallet…" : "Confirm swap in wallet"}
      <ArrowRight size={17} />
    </button>
  );
}
export function SwapReviewDialog(props: Props) {
  return (
    <div className={styles.dialogContent}>
      <SwapReviewSummary quote={props.quote} account={props.account} />
      {props.trade.error && (
        <p role="alert" className={styles.errorText}>
          {props.trade.error}
        </p>
      )}
      <ReviewAction
        quote={props.quote}
        valid={props.valid}
        locked={props.locked}
        trade={props.trade}
        onSubmit={props.onSubmit}
        onRefresh={props.onRefresh}
      />
      <button
        className={styles.backButton}
        disabled={props.trade.busy}
        onClick={props.onClose}
      >
        Back to editing
      </button>
    </div>
  );
}
