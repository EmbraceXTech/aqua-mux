import { ChevronDown, X } from "lucide-react";
import type { TradeWorkspace } from "@/hooks/useTradeWorkspace";
import type { Leg } from "@/types/swap";
import { TokenIcon } from "@/components/managed/token-icon";
import { evenWeights } from "@/lib/model";
import { compact, palette } from "@/lib/utils/swap";

export function LiquidityPairRow({
  trade,
  leg,
  index,
}: {
  trade: TradeWorkspace;
  leg: Leg;
  index: number;
}) {
  const {
    account,
    balances,
    base,
    catalog,
    change,
    chartLeg,
    legs,
    setChartPair,
    setLegs,
    setPicker,
    setSearch,
  } = trade;
  const token = catalog.find((item) => item.address === leg.address)!;

  return (
    <div
      className={`output-row liquidity-pair${
        chartLeg.address === leg.address ? " selected" : ""
      }`}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("button, input")
        )
          return;
        setChartPair(leg.address);
      }}
    >
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
          <strong>
            {base.symbol} / {token.symbol}
          </strong>
          <small>{token.name}</small>
        </span>
        <ChevronDown size={13} />
      </button>
      <div className="output-value">
        <input
          aria-label={`${token.symbol} paired amount`}
          inputMode="decimal"
          value={leg.amount}
          onChange={(event) => {
            change();
            setLegs((old) =>
              old.map((item, itemIndex) =>
                index === itemIndex
                  ? { ...item, amount: event.target.value }
                  : item,
              ),
            );
          }}
        />
        {account ? (
          <button
            className="balance-button output-balance"
            disabled={balances[token.address] == null}
            onClick={() => {
              if (balances[token.address] == null) return;
              change();
              setLegs((old) =>
                old.map((item, itemIndex) =>
                  index === itemIndex
                    ? { ...item, amount: balances[token.address]! }
                    : item,
                ),
              );
            }}
          >
            Balance: {compact(balances[token.address])}
          </button>
        ) : (
          <small>Connect wallet</small>
        )}
      </div>
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
