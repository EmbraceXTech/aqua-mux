import { toHex, type Address } from "viem";
import type { Plan } from "./model";
export type Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, fn: (value: unknown) => void) => void;
  removeListener?: (event: string, fn: (value: unknown) => void) => void;
};
declare global {
  interface Window {
    ethereum?: Provider;
  }
}
export async function connectWallet() {
  const p = window.ethereum;
  if (!p)
    throw new Error(
      "Open AquaMux in a browser with an Ethereum wallet installed.",
    );
  const accounts = (await p.request({
    method: "eth_requestAccounts",
  })) as Address[];
  if (!accounts[0]) throw new Error("No wallet account selected.");
  return accounts[0];
}
export async function ensureChain(chainId: number) {
  const p = window.ethereum!;
  const current = await p.request({ method: "eth_chainId" });
  if (current !== toHex(chainId))
    await p.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: toHex(chainId) }],
    });
}
export async function submitPlan(plan: Plan) {
  const p = window.ethereum;
  if (!p) throw new Error("Wallet disconnected.");
  if (Date.now() > plan.expiresAt)
    throw new Error(
      "This review has expired. Close it and review a fresh plan.",
    );
  await ensureChain(plan.chainId);
  const accounts = (await p.request({ method: "eth_accounts" })) as string[];
  if (accounts[0]?.toLowerCase() !== plan.account.toLowerCase())
    throw new Error("Wallet account changed. Review a new plan.");
  let capabilities: Record<string, { atomic?: { status: string } }>;
  try {
    capabilities = (await p.request({
      method: "wallet_getCapabilities",
      params: [plan.account, [toHex(plan.chainId)]],
    })) as typeof capabilities;
  } catch {
    throw new Error(
      "This wallet does not support atomic batches. Use a wallet with EIP-5792 atomic call support.",
    );
  }
  const status = capabilities[toHex(plan.chainId)]?.atomic?.status;
  if (!["supported", "ready"].includes(status ?? ""))
    throw new Error(
      "Atomic transactions are unavailable for this wallet on this network. No transactions were sent.",
    );
  if (Date.now() > plan.expiresAt)
    throw new Error(
      "The quote expired during wallet setup. Review a fresh plan.",
    );
  const result = (await p.request({
    method: "wallet_sendCalls",
    params: [
      {
        version: "2.0.0",
        chainId: toHex(plan.chainId),
        from: plan.account,
        atomicRequired: true,
        calls: plan.calls.map(({ to, data, value }) => ({ to, data, value })),
      },
    ],
  })) as { id: string };
  if (!result?.id)
    throw new Error(
      "Wallet did not return a batch ID. Check your wallet activity before retrying.",
    );
  return result.id;
}
export type BatchStatus = {
  status: number;
  atomic?: boolean;
  receipts?: { transactionHash: string; status: string }[];
};
export async function batchStatus(id: string) {
  return (await window.ethereum!.request({
    method: "wallet_getCallsStatus",
    params: [id],
  })) as BatchStatus;
}
