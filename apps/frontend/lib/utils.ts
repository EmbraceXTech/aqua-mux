import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
export function shortAddress(address: string, length = 5) {
  return `${address.slice(0, length + 2)}...${address.slice(-4)}`;
}
export function usd(
  value: string | number | null | undefined,
  compact = false,
) {
  if (value == null) return "Unavailable";
  const n = Number(value);
  if (!Number.isFinite(n)) return "Unavailable";
  if (n > 0 && n < 0.01) return "<$0.01";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: compact ? 1 : 2,
    notation: compact && Math.abs(n) >= 10000 ? "compact" : "standard",
  }).format(n);
}
export function number(value: number | string) {
  return new Intl.NumberFormat("en-US", {
    maximumSignificantDigits: 10,
  }).format(Number(value));
}
export function date(timestamp: number, time = false) {
  return new Date(timestamp * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    ...(time
      ? { hour: "2-digit", minute: "2-digit", timeZoneName: "short" }
      : {}),
  });
}
