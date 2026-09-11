import { useEffect, useState } from "react";
import { managedRequest } from "@/lib/managed-client/api";
import type { Address } from "viem";

export type SelectedToken = {
  address: Address;
  symbol: string;
  decimals: number;
  name?: string;
};
type RegistryItem = SelectedToken & {
  selectable: boolean;
  risk: string;
  routeStatus: string;
};
type RegistryResponse = {
  items: RegistryItem[];
  stale: boolean;
  degraded: boolean;
  fetchedAt: number;
  total: number;
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
  const [result, setResult] = useState<RegistryResponse>();
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      managedRequest<RegistryResponse>(
        `/api/tokens?chainId=${chainId}&q=${encodeURIComponent(query)}&limit=30`,
        undefined,
        undefined,
        undefined,
        controller.signal,
      )
        .then((data) => {
          setResult(data);
          setError("");
        })
        .catch((cause) => {
          if (!controller.signal.aborted) {
            setResult(undefined);
            setError(
              cause instanceof Error
                ? cause.message
                : "Token registry unavailable.",
            );
          }
        });
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [chainId, query, open]);
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
                      {item.risk === "normal" ? "Listed" : item.risk} / route
                      not checked
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
