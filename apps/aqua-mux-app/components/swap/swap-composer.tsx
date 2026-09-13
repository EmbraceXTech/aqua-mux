import { ArrowDownUp, ArrowRight, Layers3, Settings2 } from "lucide-react";
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
        <button
          disabled={locked}
          className={styles.slippageButton}
          onClick={w.openSettings}
        >
          <Settings2 size={14} />
          {w.slippage || "0"}% slippage{" "}
          <span className={styles.globalTag}>Global</span>
        </button>
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
      <div className={styles.atomic}>
        <Layers3 size={13} />
        <span>
          {w.singleSwap
            ? "One swap. One transaction."
            : "All swap legs execute together or revert."}
        </span>
        <span className={styles.liveBadge}>Live</span>
      </div>
      <p className={styles.noWallet}>
        Only direct pools at your chosen fee tier are quoted. No best-price
        aggregation. Keep ETH for gas.
      </p>
      <SwapStatus
        quoteError={trade.quoteError}
        error={trade.error}
        insufficient={trade.insufficient}
        pending={trade.pending}
        unlocated={trade.unlocated}
        result={trade.result}
        unknown={trade.unknown}
      />
      <SwapActions
        locked={locked}
        canReview={w.canReview}
        openReview={w.openReview}
        refresh={w.refresh}
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
