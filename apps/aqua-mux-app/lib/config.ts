import type { Address } from "viem";
import catalog from "./token-catalog.json";
export const NATIVE = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" as Address;
export const AQUA = "0x1111113ccf1426a8e30e2bff5e005d929bf6a90a" as Address;
export const SWAP_VM = "0x111111338c5091e8440b67b168bae16a668ac0de" as Address;
export const KYC = "0x26ffc7d378e8e49be2c483295a3e3e511f96a468" as Address;
// Verified against the authenticated 1inch /approve/spender endpoint on each chain.
const CLASSIC_ROUTERS: Record<ChainId, Address> = {
  1: "0x111111125421ca6dc452d289314280a0f8842a65",
  42161: "0x111111125421ca6dc452d289314280a0f8842a65",
  56: "0x111111125421ca6dc452d289314280a0f8842a65",
  4663: "0x5a705de8982235a7fa45bb83dcacf03a211389c7",
};
export function classicRouter(chainId: number): Address {
  return CLASSIC_ROUTERS[network(chainId).id];
}
export const networks = [
  {
    id: 42161,
    name: "Arbitrum",
    symbol: "ETH",
    env: "ARBITRUM_RPC_URL",
    explorer: "https://arbiscan.io",
    color: "#337bb6",
    mark: "A",
    logo: "/tokens/42161-0x912ce59144191c1204e64559fe8253a0e49e6548.png",
  },
  {
    id: 1,
    name: "Ethereum",
    symbol: "ETH",
    env: "ETHEREUM_RPC_URL",
    explorer: "https://etherscan.io",
    color: "#6477ed",
    mark: "E",
  },
  {
    id: 4663,
    name: "Robinhood Chain",
    symbol: "ETH",
    env: "ROBINHOOD_RPC_URL",
    explorer: "https://robinhoodchain.blockscout.com",
    color: "#bdf600",
    mark: "R",
    logo: "/networks/4663-robinhood-chain.png",
  },
  {
    id: 56,
    name: "BNB Chain",
    symbol: "BNB",
    env: "BNB_RPC_URL",
    explorer: "https://bscscan.com",
    color: "#efb90b",
    mark: "B",
  },
] as const;
export type ChainId = (typeof networks)[number]["id"];
export type Token = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logo: string;
  source: string;
};
export function network(id: number) {
  const n = networks.find((n) => n.id === id);
  if (!n) throw new Error("Unsupported network.");
  return n;
}
export function tokens(id: number): Token[] {
  network(id);
  return catalog.chains[String(id) as keyof typeof catalog.chains] as Token[];
}
export function token(id: number, address: string) {
  const t = tokens(id).find((t) => t.address === address.toLowerCase());
  if (!t)
    throw new Error("Token is not in the verified list for this network.");
  return t;
}
export function wrapped(id: number) {
  return tokens(id).find((t) => t.symbol === (id === 56 ? "WBNB" : "WETH"))!;
}
