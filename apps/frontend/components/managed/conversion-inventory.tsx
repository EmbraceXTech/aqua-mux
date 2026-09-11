import { useState } from "react";
import { formatUnits } from "viem";
import type { TokenAmount } from "@/lib/managed";
import { exactAmount } from "@/lib/managed-client/numeric-input";
import { Button } from "../ui/button";

export function ConversionInventory({
  busy,
  onRead,
  onChange,
}: {
  busy: boolean;
  onRead: () => Promise<TokenAmount[]>;
  onChange: (inventory: TokenAmount[] | undefined) => void;
}) {
  const [balances, setBalances] = useState<TokenAmount[]>([]);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [consent, setConsent] = useState(false);
  function changed(next: Record<string, string>, approved = false) {
    setAmounts(next);
    setConsent(approved);
    setError("");
    onChange(undefined);
    if (!approved) return;
    try {
      const selected = balances.flatMap(({ token, amount }) => {
        const value = next[token.address]?.trim();
        if (!value) return [];
        const raw = exactAmount(value, token.decimals);
        if (raw <= 0n || raw > BigInt(amount))
          throw new Error(
            "Choose a positive quantity within the displayed wallet balance.",
          );
        return [{ token, amount: raw.toString() }];
      });
      if (!selected.length)
        throw new Error("Enter at least one token quantity.");
      onChange(selected);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Invalid quantity.");
      setConsent(false);
    }
  }
  async function refresh() {
    setLoading(true);
    setConsent(false);
    onChange(undefined);
    setError("");
    try {
      setBalances(await onRead());
      setAmounts({});
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Wallet snapshot unavailable.",
      );
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="managed-stack">
      <p>
        Wallet balances may include unrelated assets. Attribution is incomplete,
        so enter only the quantities you choose to convert. No amounts are
        selected automatically.
      </p>
      <Button
        variant="outline"
        disabled={busy || loading}
        onClick={() => void refresh()}
      >
        {loading ? "Reading wallet quantities..." : "Refresh wallet quantities"}
      </Button>
      {balances.map(({ token, amount }) => (
        <label className="managed-field" key={token.address}>
          <span>
            {token.symbol}: wallet balance{" "}
            {formatUnits(BigInt(amount), token.decimals)}
          </span>
          <small className="managed-address">{token.address}</small>
          <input
            aria-label={`Convert ${token.symbol} quantity`}
            inputMode="decimal"
            placeholder="0"
            value={amounts[token.address] ?? ""}
            onChange={(event) =>
              changed({ ...amounts, [token.address]: event.target.value })
            }
          />
        </label>
      ))}
      {!!balances.length && (
        <label className="managed-consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(event) => changed(amounts, event.target.checked)}
          />
          I reviewed these exact quantities and excluded unrelated assets I want
          to keep.
        </label>
      )}
      {error && (
        <p role="alert" className="managed-error">
          {error}
        </p>
      )}
    </div>
  );
}
