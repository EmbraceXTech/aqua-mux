import { ArrowDown, ArrowDownUp } from "lucide-react";
import type { TradeWorkspace } from "@/hooks/useTradeWorkspace";
import { TradeComposerToolbar } from "@/components/trade/trade-composer-toolbar";
import { TradeExecutionNote } from "@/components/trade/trade-execution-note";
import { TradeReviewAction } from "@/components/trade/trade-review-action";
import { TradeSourceInput } from "@/components/trade/trade-source-input";
import { SwapOutputList } from "./swap-output-list";

export function SwapComposer({ trade }: { trade: TradeWorkspace }) {
  const { account, error, health, quoteError, setHowOpen, setSettings } = trade;

  return (
    <section className="composer" aria-label="Swap builder">
      <TradeComposerToolbar
        icon={<ArrowDownUp size={15} />}
        label="Multi-swap"
        onOpenSettings={() => setSettings(true)}
      />
      <TradeSourceInput
        trade={trade}
        label="You pay"
        description="Enter the total to split"
      />
      <div className="split-divider">
        <span />
        <div>
          <ArrowDown size={17} />
        </div>
        <span />
      </div>
      <SwapOutputList trade={trade} />
      <TradeExecutionNote
        message="All swaps in one atomic transaction"
        onOpenHow={() => setHowOpen(true)}
      />
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      {quoteError && <div className="error-box">{quoteError}</div>}
      <TradeReviewAction
        trade={trade}
        reviewLabel="Review multi-swap"
        reviewUnavailable={!!account && !health?.swapApiConfigured}
      />
    </section>
  );
}
