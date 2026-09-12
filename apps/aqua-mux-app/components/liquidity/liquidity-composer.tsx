import { ArrowDown, Layers3, Settings2, ShieldCheck } from "lucide-react";
import type { TradeWorkspace } from "@/hooks/useTradeWorkspace";
import { LiquidityPairList } from "./liquidity-pair-list";
import { LiquidityReviewAction } from "./liquidity-review-action";
import { LiquiditySourceInput } from "./liquidity-source-input";

export function LiquidityComposer({ trade }: { trade: TradeWorkspace }) {
  const { error, quoteError, setHowOpen, setSettings } = trade;

  return (
    <section className="composer" aria-label="Liquidity builder">
      <div className="composer-toolbar">
        <div className="mode-tabs">
          <span className="selected">
            <Layers3 size={15} />
            Multi-LP
          </span>
        </div>
        <button
          className="icon-button ghost-button"
          onClick={() => setSettings(true)}
          aria-label="Transaction settings"
        >
          <Settings2 size={18} />
        </button>
      </div>
      <LiquiditySourceInput trade={trade} />
      <div className="split-divider">
        <span />
        <div>
          <ArrowDown size={17} />
        </div>
        <span />
      </div>
      <LiquidityPairList trade={trade} />
      <div className="execution-note">
        <ShieldCheck size={16} />
        <span>Your assets stay in your wallet after registration</span>
        <button aria-label="How AquaMux works" onClick={() => setHowOpen(true)}>
          i
        </button>
      </div>
      {error && (
        <div role="alert" className="error-box">
          {error}
        </div>
      )}
      {quoteError && <div className="error-box">{quoteError}</div>}
      <LiquidityReviewAction trade={trade} />
    </section>
  );
}
