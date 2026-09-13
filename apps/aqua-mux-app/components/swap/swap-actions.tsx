import { ArrowRight, Wallet } from "lucide-react";
import type { SwapWorkspace } from "@/hooks/useSwapWorkspace";
import { SWAP_CHAIN } from "@/lib/live-swap";
import styles from "./swap.module.css";

type Props = Pick<SwapWorkspace, "locked" | "swap"> &
  Pick<
    SwapWorkspace["trade"],
    | "account"
    | "walletChain"
    | "busy"
    | "quoteBusy"
    | "quote"
    | "fresh"
    | "clock"
    | "connect"
    | "switchChain"
    | "approvalsFor"
  >;
export function SwapActions({
  locked,
  swap,
  account,
  walletChain,
  busy,
  quoteBusy,
  quote,
  fresh,
  clock,
  connect,
  switchChain,
  approvalsFor,
}: Props) {
  const approval = quote ? approvalsFor(quote)[0] : undefined;
  return (
    <>
      {!account ? (
        <button
          className={styles.primaryButton}
          disabled={locked}
          onClick={() => void connect()}
        >
          Connect wallet <Wallet size={17} />
        </button>
      ) : walletChain !== SWAP_CHAIN ? (
        <button
          disabled={locked}
          className={styles.primaryButton}
          onClick={() => void switchChain()}
        >
          Switch wallet to Arbitrum
        </button>
      ) : (
        <button
          className={styles.primaryButton}
          disabled={locked || quoteBusy}
          onClick={() => void swap()}
        >
          {quoteBusy
            ? "Fetching quote…"
            : busy
              ? "Check wallet…"
              : approval
                ? `${approval.reset ? "Reset" : "Approve"} ${approval.label}`
                : "Swap"}
          <ArrowRight size={17} />
        </button>
      )}
      {quote && (
        <p className={styles.noWallet}>
          {fresh
            ? `Quote expires in ${Math.max(0, Math.ceil((quote.expiresAt - clock) / 1000))}s`
            : "Quote expired. Refresh before swapping."}{" "}
          · Block {quote.block}
        </p>
      )}
    </>
  );
}
