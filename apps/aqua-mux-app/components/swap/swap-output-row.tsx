import { ChevronDown, Loader2, X } from "lucide-react";
import { formatUnits } from "viem";
import { TokenIcon } from "@/components/managed/token-icon";
import type { TradeWorkspace } from "@/hooks/useTradeWorkspace";
import type { Leg } from "@/types/swap";
import { evenWeights } from "@/lib/model";
import { compact, palette } from "@/lib/utils/swap";

export function SwapOutputRow({
  trade,
  leg,
  index,
}: {
  trade: TradeWorkspace;
  leg: Leg;
  index: number;
}) {
  const {
    catalog,
    change,
    legs,
    now,
    quote,
    quoteBusy,
    setLegs,
    setPicker,
    setSearch,
  } = trade;
  const token = catalog.find((item) => item.address === leg.address)!;
  const legQuote =
    quote && quote.expiresAt > now
      ? quote.legs.find((item) => item.address === leg.address)
      : undefined;

  return (
    <div className="output-row">
      <div className="row-color" style={{ background: palette[index] }} />
      <button
        className="output-token"
        onClick={() => {
          setSearch("");
          setPicker(index);
        }}
      >
        <TokenIcon token={token} />
        <span>
          <strong>{token.symbol}</strong>
          <small>{token.name}</small>
        </span>
        <ChevronDown size={13} />
      </button>
      <div className="output-value">
        <strong>
          {quoteBusy ? (
            <Loader2 size={16} className="spin" />
          ) : legQuote ? (
            compact(formatUnits(BigInt(legQuote.amountOut), token.decimals))
          ) : (
            "--"
          )}
        </strong>
        <small>{legQuote ? "Estimated output" : "Awaiting quote"}</small>
      </div>
      <label className="weight">
        <input
          aria-label={`${token.symbol} allocation percent`}
          type="number"
          min="0.01"
          max="100"
          step="0.01"
          value={leg.bps / 100}
          onChange={(event) => {
            change();
            setLegs((old) =>
              old.map((item, itemIndex) =>
                index === itemIndex
                  ? {
                      ...item,
                      bps: Math.round(Number(event.target.value) * 100),
                    }
                  : item,
              ),
            );
          }}
        />
        <span>%</span>
      </label>
      <button
        className="remove-token"
        disabled={legs.length <= 2}
        aria-label={`Remove ${token.symbol}`}
        onClick={() => {
          change();
          setLegs((old) =>
            old
              .filter((_, itemIndex) => itemIndex !== index)
              .map((item, itemIndex, items) => ({
                ...item,
                bps: evenWeights(items.length)[itemIndex],
              })),
          );
        }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
