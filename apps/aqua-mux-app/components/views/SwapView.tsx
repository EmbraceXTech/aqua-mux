"use client";

import { Info } from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { SwapComposer } from "@/components/swap/swap-composer";
import { SwapDialogs } from "@/components/swap/swap-dialogs";
import { SwapWalletActions } from "@/components/swap/swap-wallet-actions";
import { useSwapWorkspace } from "@/hooks/useSwapWorkspace";
import styles from "@/components/swap/swap.module.css";

export function SwapView() {
  const workspace = useSwapWorkspace();
  return (
    <div className={styles.page}>
      <MainLayout
        activePage="swap"
        actions={
          <SwapWalletActions
            account={workspace.trade.account}
            locked={workspace.locked}
            onConnect={workspace.trade.connect}
          />
        }
      >
        <div className={styles.container}>
          <div className={styles.prototypeBar}>
            <span>
              <Info size={13} /> Arbitrum mainnet. Real funds. Direct Uniswap v3
              pools.
            </span>
            <span>Approvals may require separate transactions.</span>
          </div>
          <div className={styles.intro}>
            <div className={styles.eyebrow}>MULTI-TOKEN SWAPS</div>
            <h1>
              Your tokens. <span>Your direction.</span>
            </h1>
            <p>
              Swap one token, consolidate balances, or split into a basket. You
              choose the amounts.
            </p>
          </div>
          <div className={styles.workspace}>
            <SwapComposer workspace={workspace} />
          </div>
        </div>
      </MainLayout>
      <SwapDialogs workspace={workspace} />
    </div>
  );
}
