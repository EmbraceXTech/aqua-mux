import type { SwapWorkspace } from "@/hooks/useSwapWorkspace";
import styles from "./swap.module.css";

type Props = Pick<
  SwapWorkspace["trade"],
  "error" | "pending" | "unlocated" | "result" | "unknown"
>;
export function SwapStatus({
  error,
  pending,
  unlocated,
  result,
  unknown,
}: Props) {
  return (
    <>
      {error && (
        <div role="alert" className={styles.errors}>
          <p>{error}</p>
        </div>
      )}
      {pending && (
        <p role="status" className={styles.settingsNote}>
          {unlocated
            ? "Wallet returned a hash, but the transaction is not visible on Arbitrum. It may have failed before broadcast or been dropped. Check MetaMask activity. We are still checking; do not retry."
            : `${pending.label} pending.`}{" "}
          <a
            href={`https://arbiscan.io/tx/${pending.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View transaction
          </a>
          . Keep this page open. No retries while pending.
        </p>
      )}
      {result && (
        <p role="status" className={styles.settingsNote}>
          {result.label} {result.success ? "confirmed" : "reverted"}.{" "}
          <a
            href={`https://arbiscan.io/tx/${result.hash}`}
            target="_blank"
            rel="noreferrer"
          >
            View receipt
          </a>
        </p>
      )}
      {unknown && (
        <p role="alert" className={styles.errors}>
          Submission status is unknown. Check MetaMask activity before any
          further trade. Sending is disabled.
        </p>
      )}
    </>
  );
}
