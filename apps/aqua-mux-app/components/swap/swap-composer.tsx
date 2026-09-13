import { ArrowDownUp, ArrowRight, RefreshCw, Settings2 } from "lucide-react";
import type { SwapWorkspace } from "@/hooks/useSwapWorkspace";
import { liveTokens } from "@/lib/live-swap";
import { SwapActions } from "./swap-actions";
import { SwapModeControls } from "./swap-mode-controls";
import { SwapStatus } from "./swap-status";
import { SwapTokenSection } from "./swap-token-section";
import styles from "./swap.module.css";

export function SwapComposer({ workspace: w }: { workspace: SwapWorkspace }) {
  const { trade, draft, locked } = w;
  const quoteLabel = trade.quoteBusy
    ? "Fetching pool quote…"
    : trade.quote
      ? trade.fresh
        ? "Live pool quote"
        : "Quote expired"
      : "Awaiting quote";
  return (
    <section className={styles.composer} aria-label="Multi-swap builder">
      <div className={styles.composerHeader}>
        <span>
          <ArrowDownUp size={17} />{" "}
          {w.singleSwap ? "Single swap" : "Multi-swap"}
        </span>
        <div className={styles.headerActions}>
          <button
            disabled={locked}
            className={styles.slippageButton}
            onClick={w.openSettings}
          >
            <Settings2 size={14} />
            {w.slippage || "0"}% slippage
          </button>
          <button
            aria-label="Refresh quote and balances"
            disabled={locked || trade.quoteBusy}
            className={styles.refreshButton}
            onClick={w.refresh}
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>
      <SwapModeControls
        mode={w.mode}
        exact={draft.exact}
        locked={locked}
        onModeChange={(mode) => w.edit({ type: "mode", mode })}
        onExactChange={w.setExact}
      />
      <div className={styles.tokenColumns}>
        <SwapTokenSection
          side="input"
          rows={draft.input}
          exact={draft.exact === "input"}
          expanded={w.multi === "input"}
          locked={locked}
          connected={!!trade.account}
          canAdd={draft.input.length + draft.output.length < liveTokens.length}
          amounts={trade.quote?.amounts.input}
          balances={trade.holdings}
          quoteLabel={quoteLabel}
          onEdit={w.edit}
          onPick={w.openPicker}
        />
        <div className={styles.direction} aria-hidden="true">
          <ArrowRight size={18} />
        </div>
        <SwapTokenSection
          side="output"
          rows={draft.output}
          exact={draft.exact === "output"}
          expanded={w.multi === "output"}
          locked={locked}
          connected={!!trade.account}
          canAdd={draft.input.length + draft.output.length < liveTokens.length}
          amounts={trade.quote?.amounts.output}
          balances={trade.holdings}
          quoteLabel={quoteLabel}
          onEdit={w.edit}
          onPick={w.openPicker}
        />
      </div>
      <SwapStatus
        error={trade.error}
        pending={trade.pending}
        unlocated={trade.unlocated}
        result={trade.result}
        unknown={trade.unknown}
      />
      <SwapActions
        locked={locked}
        openReview={w.openReview}
        account={trade.account}
        walletChain={trade.walletChain}
        busy={trade.busy}
        quoteBusy={trade.quoteBusy}
        quote={trade.quote}
        fresh={trade.fresh}
        clock={trade.clock}
        connect={trade.connect}
        switchChain={trade.switchChain}
      />
    </section>
  );
}
