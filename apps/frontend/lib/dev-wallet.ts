import type { Address } from "viem";
import type { Basket, Plan } from "./model";

export type DevWalletConnection = {
  mode: "local-development";
  label: string;
  account: Address;
  token: string;
  expiresAt: number;
  maxFeeWei: string;
  networks: { chainId: number; name: string; testnet: boolean }[];
};
export type DevWalletReview = { id: string; digest: string; plan: Plan };
export type DevWalletOutcome = {
  id: string;
  state: "pending" | "confirmed" | "reverted" | "unknown";
  transactionHash?: `0x${string}`;
};

async function request<T>(
  action: string,
  body: unknown,
  token?: string,
): Promise<T> {
  const response = await fetch(`/api/dev-wallet/${action}`, {
    method: "POST",
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "content-type": "application/json",
      "x-aquamux-dev-wallet": "manual",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "Local development wallet request failed.");
  return result as T;
}

// Call only after an explicit click on the labelled local development wallet option.
export function connectDevWallet() {
  return request<DevWalletConnection>("connect", {});
}

export function prepareDevWalletPlan(token: string, basket: Basket) {
  return request<DevWalletReview>("plan", { basket }, token);
}

export function submitDevWalletPlan(
  token: string,
  review: Pick<DevWalletReview, "id" | "digest">,
  confirmed: true,
) {
  if (confirmed !== true)
    throw new Error("Confirm this action before signing.");
  return request<DevWalletOutcome>(
    "execute",
    { id: review.id, digest: review.digest, confirmed },
    token,
  );
}

export function devWalletStatus(token: string, id: string) {
  return request<DevWalletOutcome>("status", { id }, token);
}

export function disconnectDevWallet(token: string) {
  return request<{ disconnected: true }>("disconnect", {}, token);
}
