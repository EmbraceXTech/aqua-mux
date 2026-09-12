import { Plus } from "lucide-react";
import type { TradeWorkspace } from "@/hooks/useTradeWorkspace";
import { LiquidityPairRow } from "./liquidity-pair-row";

export function LiquidityPairList({ trade }: { trade: TradeWorkspace }) {
  const { legs, localDevelopmentWallet, setPicker, setSearch } = trade;

  return (
    <>
      <div className="outputs-heading">
        <div>
          <h2>Your liquidity pairs</h2>
          <span>Pair each token with the same base balance</span>
        </div>
      </div>
      <div className="output-list">
        {legs.map((leg, index) => (
          <LiquidityPairRow
            key={leg.address}
            trade={trade}
            leg={leg}
            index={index}
          />
        ))}
      </div>
      <button
        className="add-token"
        disabled={legs.length >= 6 || localDevelopmentWallet}
        onClick={() => {
          setSearch("");
          setPicker(legs.length);
        }}
      >
        <Plus size={16} />
        Add a pair
        <span>{legs.length} / 6</span>
      </button>
    </>
  );
}
