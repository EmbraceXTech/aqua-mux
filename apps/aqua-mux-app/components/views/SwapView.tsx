"use client";

import { X } from "lucide-react";
import { MainLayout } from "@/components/layouts/MainLayout";
import { SwapComposer } from "@/components/swap/swap-composer";
import { SwapDialogs } from "@/components/swap/swap-dialogs";
import { useSwapWorkspace } from "@/hooks/useSwapWorkspace";
import styles from "@/components/swap/swap.module.css";

export function SwapView() {
  const workspace = useSwapWorkspace();
  return (
    <div className={styles.page}>
      <MainLayout activePage="swap">
        <div className={styles.container}>
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
      {workspace.toast && (
        <div
          role="alert"
          aria-live="assertive"
          aria-atomic="true"
          className={styles.toast}
        >
          <div>
            {workspace.toast.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
          <button
            aria-label="Dismiss notification"
            onClick={workspace.dismissToast}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <SwapDialogs workspace={workspace} />
    </div>
  );
}
