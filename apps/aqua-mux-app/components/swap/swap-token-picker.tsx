import { useState } from "react";
import { Search } from "lucide-react";
import { liveTokens, type Draft, type Symbol } from "@/lib/live-swap";
import { SwapTokenMark } from "./swap-token-mark";
import styles from "./swap.module.css";

type Props = {
  draft: Draft;
  locked: boolean;
  balances: Partial<Record<Symbol, { balance: string } | null>>;
  onPick: (symbol: Symbol) => void;
};
// Mounted for one picker session, so search resets on close without an effect.
export function SwapTokenPicker({ draft, locked, balances, onPick }: Props) {
  const [search, setSearch] = useState("");
  const available = liveTokens.filter((token) =>
    `${token.symbol} ${token.name} ${token.address}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const selected = new Set(
    [...draft.input, ...draft.output].map((item) => item.symbol),
  );
  return (
    <div className={styles.dialogContent}>
      <label className={styles.search}>
        <Search size={17} />
        <input
          autoFocus
          aria-label="Search tokens"
          placeholder="Search name, symbol, or address"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      <div className={styles.pickerList}>
        {available.map((token) => (
          <button
            key={token.symbol}
            disabled={selected.has(token.symbol) || locked}
            onClick={() => onPick(token.symbol)}
          >
            <SwapTokenMark symbol={token.symbol} />
            <span>
              <strong>{token.symbol}</strong>
              <small>{token.name}</small>
              <small title={token.address}>
                {token.address.slice(0, 6)}…{token.address.slice(-4)}
              </small>
            </span>
            <span>
              <strong>
                {selected.has(token.symbol)
                  ? "Already selected"
                  : (balances[token.symbol]?.balance ?? "Unavailable")}
              </strong>
            </span>
          </button>
        ))}
        {!available.length && (
          <p className={styles.empty}>No matching supported token.</p>
        )}
      </div>
    </div>
  );
}
