import type { CSSProperties } from "react";
import { ArrowRight, Layers3 } from "lucide-react";
import { TokenIcon } from "@/components/managed/token-icon";
import type { TradeWorkspace } from "@/hooks/useTradeWorkspace";
import { palette } from "@/lib/utils/swap";

export function SwapFlowPreview({ trade }: { trade: TradeWorkspace }) {
  const { amount, catalog, legs, src } = trade;

  return (
    <section className="flow-card">
      <div className="section-kicker">PREVIEW</div>
      <h2>One in. Your mix out.</h2>
      <p>Split a single payment across the tokens you choose.</p>
      <div className="flow-map">
        <div className="flow-source">
          <TokenIcon token={src} size={34} />
          <strong>
            {amount || "0"} {src.symbol}
          </strong>
          <small>One input</small>
        </div>
        <div className="flow-trunk" />
        <div
          className="flow-branches"
          style={{ "--count": legs.length } as CSSProperties}
        >
          {legs.map((leg, index) => {
            const token = catalog.find((item) => item.address === leg.address)!;
            return (
              <div className="flow-target" key={token.address}>
                <div className="branch-line" />
                <div
                  className="flow-token-ring"
                  style={{ borderColor: palette[index] + "40" }}
                >
                  <TokenIcon token={token} size={27} />
                </div>
                <strong>{token.symbol}</strong>
                <small style={{ color: palette[index] }}>
                  {leg.bps / 100}%
                </small>
              </div>
            );
          })}
        </div>
      </div>
      <div className="flow-bottom">
        <Layers3 size={15} />
        <span>{legs.length} swaps</span>
        <ArrowRight size={14} />
        <strong>1 transaction</strong>
      </div>
    </section>
  );
}
