import type { Address } from "viem";
import { NATIVE, tokens, type ChainId, type Token } from "@/lib/config";
import { normalizeBatchStatus, type BatchStatus } from "@/lib/wallet";
import type { WalletExecutionStatus } from "@/lib/managed-client/wallet-execution";
import type { Leg } from "@/types/swap";

export const palette = [
  "#356cff",
  "#8b68e8",
  "#21ad91",
  "#ecae44",
  "#dd709a",
  "#69a8d9",
];

export function compact(value: string | undefined | null) {
  return value == null
    ? "Unavailable"
    : Number(value).toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function transactionState(status?: WalletExecutionStatus) {
  return status?.state ?? "pending";
}

export function storedExecutionStatus(value: unknown): WalletExecutionStatus {
  if (value && typeof value === "object" && "state" in value) {
    const state = (value as { state?: unknown }).state;
    if (
      ["pending", "confirmed", "reverted", "unknown"].includes(String(state))
    ) {
      return value as WalletExecutionStatus;
    }
  }
  if (value && typeof value === "object" && "status" in value) {
    return { state: normalizeBatchStatus(value as BatchStatus) };
  }
  return { state: "pending" };
}

export async function api<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(
    url,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : undefined,
  );
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed.");
  return result;
}

export function initialLegs(id: number): Leg[] {
  const list = tokens(id);
  const symbols =
    id === 4663
      ? ["USDG", "AAPL", "TSLA"]
      : ["USDC", id === 56 ? "BTCB" : "WBTC", "LINK"];
  const chosen = symbols
    .map((symbol) => list.find((token) => token.symbol === symbol))
    .filter((token): token is Token => !!token);
  if (chosen.length < 3) {
    const token = list.find(
      (item) =>
        item.address !== NATIVE &&
        !chosen.includes(item) &&
        !item.symbol.startsWith("W"),
    );
    if (token) chosen.push(token);
  }
  return chosen.map((token, index) => ({
    address: token.address,
    bps: [5000, 3000, 2000][index],
    amount: "0",
  }));
}

export function localDevelopmentLegs(id: ChainId): Leg[] {
  const symbols = id === 4663 ? ["USDG", "PONS"] : ["USDC", "USDT"];
  const selected = symbols
    .map((symbol) => tokens(id).find((token) => token.symbol === symbol))
    .filter((token): token is Token => !!token);
  if (selected.length !== 2) {
    throw new Error(
      "Local wallet outputs are not configured for this network.",
    );
  }
  return selected.map((token, index) => ({
    address: token.address as Address,
    bps: [5000, 5000][index],
    amount: "0",
  }));
}
