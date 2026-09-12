import { formatUnits } from "viem";
import type { DenominatedPrice, TokenAmount } from "@/lib/managed";

export function amountLabel(value: TokenAmount) {
  return `${formatUnits(BigInt(value.amount), value.token.decimals)} ${value.token.symbol}`;
}
export function dateLabel(value?: number | null) {
  return value == null ? "Unavailable" : new Date(value).toLocaleString();
}
export function priceLabel(value: DenominatedPrice) {
  const scale = 10n ** 8n;
  const scaled = (BigInt(value.numerator) * scale) / BigInt(value.denominator);
  return scaled === 0n
    ? `${value.numerator}/${value.denominator}`
    : formatUnits(scaled, 8);
}
export function titleLabel(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/\blp\b/g, "LP")
    .replace(/\bmm\b/g, "MM")
    .replace(/^./, (letter) => letter.toUpperCase());
}
