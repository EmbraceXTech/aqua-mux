import { Wallet } from "lucide-react";
import styles from "./swap.module.css";

export function SwapWalletActions({
  account,
  locked,
  onConnect,
}: {
  account?: string;
  locked: boolean;
  onConnect: () => Promise<void>;
}) {
  return (
    <>
      <span className={styles.network}>
        <span /> Arbitrum
      </span>
      <button
        className={styles.walletButton}
        disabled={locked}
        onClick={() => void onConnect()}
      >
        <Wallet size={14} />
        {account
          ? `${account.slice(0, 6)}…${account.slice(-4)}`
          : "Connect wallet"}
      </button>
    </>
  );
}
