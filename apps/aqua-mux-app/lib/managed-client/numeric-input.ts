import { formatUnits, parseUnits } from "viem";
import type { DenominatedPrice } from "@/lib/managed";

export function exactAmount(value: string, decimals: number) {
  if (
    !/^\d+(\.\d+)?$/.test(value) ||
    (value.split(".")[1]?.length ?? 0) > decimals
  )
    throw new Error(
      `Enter a nonnegative amount with at most ${decimals} decimal places.`,
    );
  return parseUnits(value, decimals);
}

export function exactPriceInput(price: DenominatedPrice) {
  const numerator = BigInt(price.numerator),
    denominator = BigInt(price.denominator);
  for (let decimals = 0; decimals <= 18; decimals++) {
    const scaled = numerator * 10n ** BigInt(decimals);
    if (scaled % denominator === 0n)
      return formatUnits(scaled / denominator, decimals);
  }
  return `${price.numerator}/${price.denominator}`;
}

export function parsePriceInput(value: string) {
  if (/^[1-9]\d*\/[1-9]\d*$/.test(value)) {
    const [numerator, denominator] = value.split("/");
    return { numerator, denominator };
  }
  if (!/^\d+(\.\d{1,18})?$/.test(value))
    throw new Error(
      "Enter a positive decimal or an exact numerator/denominator price.",
    );
  const decimals = value.split(".")[1]?.length ?? 0;
  const numerator = exactAmount(value, decimals).toString();
  if (numerator === "0")
    throw new Error("Opening prices and bounds must be positive.");
  return { numerator, denominator: (10n ** BigInt(decimals)).toString() };
}
