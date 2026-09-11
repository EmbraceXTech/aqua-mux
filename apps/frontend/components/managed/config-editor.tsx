import { useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { strategyConfigSchema, type LPStrategyConfig } from "@/lib/managed";
import { Button } from "../ui/button";
import { priceLabel } from "./format";

function decimalRatio(value: string) {
  if (!/^\d+(\.\d{1,18})?$/.test(value))
    throw new Error(
      "Prices must be positive decimals with at most 18 decimal places.",
    );
  const decimals = value.split(".")[1]?.length ?? 0;
  return {
    numerator: parseUnits(value, decimals).toString(),
    denominator: (10n ** BigInt(decimals)).toString(),
  };
}

export function ConfigEditor({
  config,
  busy,
  onSave,
  onCancel,
}: {
  config: LPStrategyConfig;
  busy: boolean;
  onSave: (config: LPStrategyConfig) => Promise<void>;
  onCancel: () => void;
}) {
  const [pairs, setPairs] = useState(() =>
    config.pairs.map((pair) => ({
      base: formatUnits(BigInt(pair.baseAmount), pair.baseToken.decimals),
      quote: formatUnits(BigInt(pair.quoteAmount), pair.quoteToken.decimals),
      fee: String(pair.feeBps),
      opening: priceLabel(pair.openingPrice),
      full: pair.range.kind === "full",
      lower: pair.range.kind === "bounded" ? priceLabel(pair.range.lower) : "",
      upper: pair.range.kind === "bounded" ? priceLabel(pair.range.upper) : "",
    })),
  );
  const [error, setError] = useState("");
  const update = (index: number, field: string, value: string | boolean) =>
    setPairs((old) =>
      old.map((pair, i) => (i === index ? { ...pair, [field]: value } : pair)),
    );
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const next = {
        ...config,
        pairs: config.pairs.map((pair, index) => {
          const draft = pairs[index];
          const price = (value: string) => ({
            baseToken: pair.baseToken.address,
            quoteToken: pair.quoteToken.address,
            ...decimalRatio(value),
          });
          return {
            ...pair,
            baseAmount: parseUnits(
              draft.base,
              pair.baseToken.decimals,
            ).toString(),
            quoteAmount: parseUnits(
              draft.quote,
              pair.quoteToken.decimals,
            ).toString(),
            feeBps: Number(draft.fee),
            openingPrice: price(draft.opening),
            range: draft.full
              ? { kind: "full" as const }
              : {
                  kind: "bounded" as const,
                  lower: price(draft.lower),
                  upper: price(draft.upper),
                },
          };
        }),
      };
      const parsed = strategyConfigSchema.parse(next);
      if (parsed.family !== "lp")
        throw new Error("Only LP configuration editing is supported.");
      await onSave(parsed);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Configuration is invalid.",
      );
    }
  }
  return (
    <form className="managed-panel managed-stack" onSubmit={submit}>
      <h2>Edit proposed pair parameters</h2>
      <p>
        Saving invalidates the previous review and confirmation. Request a fresh
        analysis before preparing another execution plan.
      </p>
      {config.pairs.map((pair, index) => (
        <section
          className="managed-pair managed-stack"
          key={`${pair.baseToken.address}:${pair.quoteToken.address}`}
        >
          <h3>
            {pair.baseToken.symbol} / {pair.quoteToken.symbol}
          </h3>
          <div className="managed-fields">
            {(
              [
                {
                  key: "base",
                  label: `${pair.baseToken.symbol} virtual amount`,
                },
                {
                  key: "quote",
                  label: `${pair.quoteToken.symbol} virtual amount`,
                },
                {
                  key: "opening",
                  label: `Opening price, ${pair.quoteToken.symbol} per ${pair.baseToken.symbol}`,
                },
                { key: "fee", label: "Fee, basis points" },
              ] as const
            ).map(({ key, label }) => (
              <label className="managed-field" key={key}>
                <span>{label}</span>
                <input
                  aria-label={`${label} pair ${index + 1}`}
                  inputMode="decimal"
                  value={pairs[index][key]}
                  onChange={(event) => update(index, key, event.target.value)}
                />
              </label>
            ))}
          </div>
          <label className="managed-consent">
            <input
              type="checkbox"
              checked={pairs[index].full}
              onChange={(event) => update(index, "full", event.target.checked)}
            />
            Full range for this pair
          </label>
          {!pairs[index].full && (
            <div className="managed-fields">
              {(["lower", "upper"] as const).map((key) => (
                <label className="managed-field" key={key}>
                  <span>
                    {key === "lower" ? "Minimum" : "Maximum"}{" "}
                    {pair.quoteToken.symbol} per {pair.baseToken.symbol}
                  </span>
                  <input
                    aria-label={`${key} bound pair ${index + 1}`}
                    inputMode="decimal"
                    value={pairs[index][key]}
                    onChange={(event) => update(index, key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          )}
        </section>
      ))}
      {error && (
        <div className="managed-notice managed-error" role="alert">
          {error}
        </div>
      )}
      <div className="managed-actions">
        <Button type="submit" disabled={busy}>
          Save and invalidate old plan
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel edit
        </Button>
      </div>
    </form>
  );
}
