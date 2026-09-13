import { ArrowRight, Wallet } from "lucide-react";
import type { SwapWorkspace } from "@/hooks/useSwapWorkspace";
import { SWAP_CHAIN } from "@/lib/live-swap";
import styles from "./swap.module.css";

type Props = Pick<SwapWorkspace, "locked" | "openReview"> &
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
  >;
export function SwapActions({
  locked,
  openReview,
  account,
  walletChain,
  busy,
  quoteBusy,
  quote,
  fresh,
  clock,
  connect,
  switchChain,
}: Props) {
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
          onClick={openReview}
        >
          {quoteBusy
            ? "Fetching quote…"
            : busy
              ? "Check wallet…"
              : "Review swap"}
          <ArrowRight size={17} />
        </button>
      )}
      {quote && (
        <p className={styles.noWallet}>
          {fresh
            ? `Quote expires in ${Math.max(0, Math.ceil((quote.expiresAt - clock) / 1000))}s`
            : "Quote expired. Refresh before reviewing."}{" "}
          · Block {quote.block}
        </p>
      )}
    </>
  );
}
