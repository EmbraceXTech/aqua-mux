import { ChevronDown, Settings2, X } from "lucide-react";
import { getToken, type Row, type Side } from "@/lib/live-swap";
import { SwapTokenMark } from "./swap-token-mark";
import styles from "./swap.module.css";

type Props = {
  item: Row;
  selectorId: string;
  side: Side;
  index: number;
  exact: boolean;
  expanded: boolean;
  removable: boolean;
  locked: boolean;
  connected: boolean;
  balance?: string;
  amount: string;
  quoteLabel: string;
  onPick: () => void;
  onRemove: () => void;
  onChange: (values: Partial<Pick<Row, "amount" | "weight" | "fee">>) => void;
};
export function SwapTokenRow({
  item,
  selectorId,
  side,
  index,
  exact,
  expanded,
  removable,
  locked,
  connected,
  balance,
  amount,
  quoteLabel,
  onPick,
  onRemove,
  onChange,
}: Props) {
  const token = getToken(item.symbol);
  return (
    <div className={styles.tokenRow}>
      <div className={styles.rowMain}>
        <button
          id={selectorId}
          className={styles.tokenSelector}
          disabled={locked}
          aria-label={`Select ${side} token ${index + 1}: ${item.symbol}`}
          onClick={onPick}
        >
          <SwapTokenMark symbol={item.symbol} />
          <span>
            <strong>{item.symbol}</strong>
            <small>{token.name}</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className={styles.amountBox}>
          <input
            aria-label={`${side} ${item.symbol} amount`}
            inputMode="decimal"
            placeholder="0.00"
            readOnly={!exact || locked}
            value={amount}
            onChange={(event) => onChange({ amount: event.target.value })}
          />
          <small>{exact ? "Exact token amount" : quoteLabel}</small>
        </div>
        {removable && (
          <button
            disabled={locked}
            className={styles.remove}
            aria-label={`Remove ${side} ${item.symbol}`}
            onClick={onRemove}
          >
            <X size={14} />
          </button>
        )}
      </div>
      <div className={styles.rowMeta}>
        <span>
          Balance: {connected ? (balance ?? "Unavailable") : "Connect wallet"}
          {side === "input" &&
            exact &&
            balance !== undefined &&
            item.symbol !== "ETH" && (
              <button
                disabled={locked}
                onClick={() => onChange({ amount: balance })}
              >
                Max
              </button>
            )}
        </span>
        {removable && !exact && (
          <label className={styles.allocation}>
            Allocation{" "}
            <input
              disabled={locked}
              aria-label={`${item.symbol} allocation percent`}
              inputMode="decimal"
              value={item.weight}
              onChange={(event) => onChange({ weight: event.target.value })}
            />
            %
          </label>
        )}
      </div>
      {expanded && (
        <div className={styles.rowFee}>
          <span>
            <Settings2 size={12} /> {item.symbol} pool fee
          </span>
          <div className={styles.feePresets}>
            {(["0.01", "0.05", "0.3", "1"] as const).map((fee) => (
              <button
                key={fee}
                disabled={locked}
                className={item.fee === fee ? styles.activeFee : ""}
                aria-pressed={item.fee === fee}
                aria-label={`${item.symbol} fee ${fee}%`}
                onClick={() => onChange({ fee })}
              >
                {fee}%
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
