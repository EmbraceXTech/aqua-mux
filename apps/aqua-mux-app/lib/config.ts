import type { Address } from "viem";
import { dataTokens, type DataChainId } from "./data-token-list";
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
const REQUIRED_TOKENS: Record<ChainId, Token[]> = {
  1: [],
  56: [
    {
      address: "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
      symbol: "USDC",
      name: "USD Coin",
      decimals: 18,
      logo: "",
      source: "AquaMux required asset",
    },
  ],
  42161: [],
  4663: [
    {
      address: "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
      logo: "",
      source: "AquaMux required asset",
    },
    {
      address: "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
      symbol: "USDG",
      name: "Global Dollar",
      decimals: 6,
      logo: "",
      source: "AquaMux required asset",
    },
    {
      address: "0x39dbed3a2bd333467115de45665cc57f813c4571",
      symbol: "PONS",
      name: "PONS",
      decimals: 18,
      logo: "",
      source: "AquaMux required asset",
    },
  ],
};

const tokenCache = new Map<ChainId, Token[]>();

function nativeToken(chainId: ChainId): Token {
  const wrappedSymbol = chainId === 56 ? "WBNB" : "WETH";
  const wrapped = dataTokens(chainId).find(
    (candidate) => candidate.symbol === wrappedSymbol,
  );
  return {
    address: NATIVE,
    symbol: network(chainId).symbol,
    name: chainId === 56 ? "BNB" : "Ether",
    decimals: 18,
    logo: wrapped?.logoURI ?? "",
    source: "Native asset",
  };
}

function appToken(
  chainId: ChainId,
  candidate: ReturnType<typeof dataTokens>[number],
): Token {
  return {
    address: candidate.address.toLowerCase() as Address,
    symbol: candidate.symbol,
    name: candidate.name,
    decimals: candidate.decimals,
    logo: candidate.logoURI ?? "",
    source: `data/${chainId}.json`,
  };
}

export function tokens(id: number): Token[] {
  const chainId = network(id).id as DataChainId;
  const existing = tokenCache.get(chainId);
  if (existing) return existing;

  const listed = [
    nativeToken(chainId),
    ...dataTokens(chainId).map((candidate) => appToken(chainId, candidate)),
    ...REQUIRED_TOKENS[chainId],
  ];
  const unique = new Map(
    listed.map((candidate) => [candidate.address, candidate]),
  );
  const result = [...unique.values()];
  tokenCache.set(chainId, result);
  return result;
}

export function token(id: number, address: string) {
  const t = tokens(id).find((t) => t.address === address.toLowerCase());
  if (!t)
    throw new Error("Token is not in the verified list for this network.");
  return t;
}

export function wrapped(id: number) {
  const chainId = network(id).id;
  const token = tokens(chainId).find(
    (candidate) => candidate.symbol === (chainId === 56 ? "WBNB" : "WETH"),
  );
  if (!token) throw new Error("Wrapped native token is not configured.");
  return token;
}
