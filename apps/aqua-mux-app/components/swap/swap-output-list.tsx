import { Check, Plus } from "lucide-react";
import type { TradeWorkspace } from "@/hooks/useTradeWorkspace";
import type { Leg } from "@/types/swap";
import { evenWeights } from "@/lib/model";
import { palette } from "@/lib/utils/swap";
import { SwapOutputRow } from "./swap-output-row";

export function SwapOutputList({ trade }: { trade: TradeWorkspace }) {
  const {
    change,
    legs,
    localDevelopmentWallet,
    setLegs,
    setPicker,
    setSearch,
    total,
  } = trade;

  return (
    <>
      <div className="outputs-heading">
        <div>
          <h2>Your token mix</h2>
          <span>Choose tokens and set your allocation</span>
        </div>
        <button
          className="text-button"
          onClick={() => {
            change();
            setLegs((old) =>
              old.map((leg, index) => ({
                ...leg,
                bps: evenWeights(old.length)[index],
              })),
            );
          }}
        >
          Split equally
        </button>
      </div>
      <div className="output-list">
        {legs.map((leg, index) => (
          <SwapOutputRow
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
        Add a token
        <span>{legs.length} / 6</span>
      </button>
      <SwapAllocation legs={legs} total={total} />
    </>
  );
}

function SwapAllocation({ legs, total }: { legs: Leg[]; total: number }) {
  return (
    <div className="allocation">
      <div className="allocation-bar">
        {legs.map((leg, index) => (
          <span
            key={leg.address}
            style={{
              width: `${(leg.bps / (total || 1)) * 100}%`,
              background: palette[index],
            }}
          />
        ))}
      </div>
      <div className="allocation-caption">
        <span>Total allocation</span>
        <strong className={total === 10000 ? "good" : "bad"}>
          {total / 100}% {total === 10000 && <Check size={13} />}
        </strong>
      </div>
    </div>
  );
}
