import mainnet from "../../../data/1.json";
import bnbChain from "../../../data/56.json";
import arbitrum from "../../../data/42161.json";
import robinhoodChain from "../../../data/4663.json";

export const DATA_CHAIN_IDS = [1, 56, 42161, 4663] as const;
export type DataChainId = (typeof DATA_CHAIN_IDS)[number];

export type DataToken = {
  chainId: number;
  address: string;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
};

type DataTokenList = {
  name: string;
  timestamp: string;
  tokens: DataToken[];
};

const tokenLists: Record<DataChainId, DataTokenList> = {
  1: mainnet,
  56: bnbChain,
  42161: arbitrum,
  4663: robinhoodChain,
};

export function dataTokenList(chainId: DataChainId): DataTokenList {
  return tokenLists[chainId];
}

export function dataTokens(chainId: DataChainId): DataToken[] {
  return dataTokenList(chainId).tokens;
}
