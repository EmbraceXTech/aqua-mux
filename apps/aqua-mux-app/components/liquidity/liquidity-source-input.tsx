import { ChevronDown } from "lucide-react";
import { TokenIcon } from "@/components/managed/token-icon";
import type { TradeWorkspace } from "@/hooks/useTradeWorkspace";
import { compact } from "@/lib/utils/swap";

export function LiquiditySourceInput({ trade }: { trade: TradeWorkspace }) {
  const {
    account,
    amount,
    balances,
    change,
    legs,
    n,
    setAmount,
    setPicker,
    setSearch,
    source,
    src,
  } = trade;

  return (
    <div className="input-panel">
      <div className="field-top">
        <label htmlFor="source-amount">Your shared base</label>
        <span>on {n.name}</span>
      </div>
      <div className="input-main">
        <input
          id="source-amount"
          aria-label="Input amount"
          value={amount}
          inputMode="decimal"
          placeholder="0"
          onChange={(event) => {
            change();
            setAmount(event.target.value);
          }}
        />
        <button
          className="token-select"
          onClick={() => {
            setSearch("");
            setPicker("source");
          }}
        >
          <TokenIcon token={src} size={32} />
          {src.symbol}
          <ChevronDown size={16} />
        </button>
      </div>
      <div className="field-bottom">
        <span>Shared across {legs.length} pairs</span>
        {account ? (
          <button
            className="balance-button"
            disabled={balances[source] == null}
            onClick={() => {
              if (balances[source] == null) return;
              change();
              setAmount(balances[source]!);
            }}
          >
            Balance: {compact(balances[source])}
          </button>
        ) : (
          <span>Wallet not connected</span>
        )}
      </div>
    </div>
  );
}
