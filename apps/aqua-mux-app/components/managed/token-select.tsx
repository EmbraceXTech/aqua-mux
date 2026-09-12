import { useState } from "react";
import { useTokenSearch } from "@/lib/managed-client/use-token-search";
import type { Address } from "viem";

export type SelectedToken = {
  address: Address;
  symbol: string;
  decimals: number;
  name?: string;
};

export function TokenSelect({
  chainId,
  label,
  value,
  onChange,
}: {
  chainId: number;
  label: string;
  value?: SelectedToken;
  onChange: (token: SelectedToken) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { result, error } = useTokenSearch(chainId, query, open);
  return (
    <div className="managed-field">
      <span>{label}</span>
      <button
        type="button"
        className="managed-token-button"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {value
          ? `${value.symbol} (${value.address.slice(0, 6)}...${value.address.slice(-4)})`
          : "Choose a token"}
      </button>
      {open && (
        <div className="managed-token-results">
          <input
            aria-label={`Search ${label}`}
            placeholder="Search symbol or token address"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {error ? (
            <p role="alert">{error}</p>
          ) : !result ? (
            <p role="status">Loading registry...</p>
          ) : (
            <>
              <p>
                {result.stale || result.degraded
                  ? "Cached metadata. Fresh verification required."
                  : "Registry metadata only. Routes have not been checked."}
              </p>
              {result.total > result.items.length && (
                <p className="managed-footnote">
                  Showing {result.items.length} of {result.total} matches.
                  Search a symbol or full address to narrow the results.
                </p>
              )}
              <div className="managed-token-list">
                {result.items.map((item) => (
                  <button
                    key={item.address}
                    type="button"
                    disabled={!item.selectable}
                    onClick={() => {
                      onChange(item);
                      setOpen(false);
                    }}
                  >
                    <strong>{item.symbol}</strong>
                    <span>{item.name}</span>
                    <small>{item.address}</small>
                    <small>
                      {item.risk.replaceAll("_", " ")} / route not checked
                    </small>
                  </button>
                ))}
                {!result.items.length && <p>No matching registry entries.</p>}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
