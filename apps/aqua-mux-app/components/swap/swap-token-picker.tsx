import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { liveTokens, type Draft, type Symbol } from "@/lib/live-swap";
import { SwapTokenMark } from "./swap-token-mark";
import styles from "./swap.module.css";

type Props = {
  draft: Draft;
  locked: boolean;
  balances: Partial<Record<Symbol, { balance: string } | null>>;
  account?: string;
  onPick: (symbol: Symbol) => void;
};
function displayName(name: string) {
  return name.length > 20 ? `${name.slice(0, 20)}…` : name;
}

// Mounted for one picker session, so search resets on close without an effect.
export function SwapTokenPicker({
  draft,
  locked,
  balances,
  account,
  onPick,
}: Props) {
  const [search, setSearch] = useState("");
  const [pickerBalances, setPickerBalances] = useState<
    Partial<Record<Symbol, { balance: string } | null>>
  >({});
  const available = liveTokens.filter((token) =>
    `${token.symbol} ${token.name} ${token.address}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const selected = new Set(
    [...draft.input, ...draft.output].map((item) => item.symbol),
  );
  const tokenIds = available
    .slice(0, 10)
    .map((token) => token.id)
    .join(",");
  useEffect(() => {
    if (!account || !tokenIds) return;
    const controller = new AbortController();
    fetch(
      `/api/live-swap?account=${account}&tokens=${encodeURIComponent(tokenIds)}`,
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error("Balance request failed.");
        return response.json() as Promise<
          Partial<Record<Symbol, { balance: string } | null>>
        >;
      })
      .then((next) => setPickerBalances(next))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
      });
    return () => controller.abort();
  }, [account, tokenIds]);
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
            key={token.id}
            disabled={selected.has(token.id) || locked}
            onClick={() => onPick(token.id)}
          >
            <SwapTokenMark symbol={token.id} />
            <span>
              <strong>{token.symbol}</strong>
              <small title={token.name}>{displayName(token.name)}</small>
              <small title={token.address}>
                {token.address.slice(0, 6)}…{token.address.slice(-4)}
              </small>
            </span>
            <span>
              <strong>
                {selected.has(token.id)
                  ? "Already selected"
                  : (balances[token.id]?.balance ??
                    pickerBalances[token.id]?.balance ??
                    "")}
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
