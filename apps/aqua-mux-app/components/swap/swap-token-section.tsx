import { useId } from "react";
import { Check, Plus } from "lucide-react";
import { liveTokens, type Row, type Side } from "@/lib/live-swap";
import type { SwapDraftAction, TokenPickerTarget } from "@/lib/swap-draft";
import { SwapTokenRow } from "./swap-token-row";
import styles from "./swap.module.css";

type Props = {
  side: Side;
  rows: Row[];
  exact: boolean;
  expanded: boolean;
  locked: boolean;
  connected: boolean;
  canAdd: boolean;
  amounts?: string[];
  balances: Partial<Record<Row["symbol"], { balance: string } | null>>;
  quoteLabel: string;
  onEdit: (action: SwapDraftAction) => void;
  onPick: (target: TokenPickerTarget) => void;
};
export function SwapTokenSection({
  side,
  rows,
  exact,
  expanded,
  locked,
  connected,
  canAdd,
  amounts,
  balances,
  quoteLabel,
  onEdit,
  onPick,
}: Props) {
  const sectionId = useId();
  return (
    <section
      className={`${styles.tokenSection} ${rows.length === 1 ? styles.singleSide : ""}`}
      aria-label={side === "input" ? "Input tokens" : "Output tokens"}
    >
      <div className={styles.sectionHeading}>
        <div>
          <h2>{side === "input" ? "You pay" : "You receive"}</h2>
          <span className={styles.count}>
            {rows.length} {rows.length === 1 ? "token" : "tokens"}
          </span>
        </div>
        <span className={exact ? styles.exactBadge : styles.estimateBadge}>
          {exact ? <Check size={11} /> : "≈"}{" "}
          {exact ? "Exact amounts" : "Estimated amounts"}
        </span>
      </div>
      <div className={styles.tokenRows}>
        {rows.map((item, index) => (
          <SwapTokenRow
            key={item.symbol}
            selectorId={`${sectionId}-token-${index}`}
            item={item}
            index={index}
            side={side}
            exact={exact}
            expanded={expanded}
            removable={expanded && rows.length > 1}
            locked={locked}
            connected={connected}
            balance={balances[item.symbol]?.balance}
            amount={exact ? item.amount : (amounts?.[index] ?? "")}
            quoteLabel={quoteLabel}
            onPick={() => onPick({ side, index })}
            onRemove={() => onEdit({ type: "remove", side, index })}
            onChange={(values) =>
              onEdit({ type: "patch", side, index, values })
            }
          />
        ))}
      </div>
      {expanded && (
        <button
          className={styles.addToken}
          disabled={locked || !canAdd}
          onClick={() => onPick({ side })}
        >
          <Plus size={15} /> Add {side} token{" "}
          <span>
            {rows.length} / {liveTokens.length - 1}
          </span>
        </button>
      )}
      <div className={styles.sectionTotal}>
        <span>
          {side === "input"
            ? "Spend limits include slippage"
            : "Pool fees included in quotes"}
        </span>
      </div>
    </section>
  );
}
