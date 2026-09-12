import type { Address, Chain } from "viem";

export type Token = {
  address: Address;
  symbol: string;
};

export type Network = {
  name: string;
  chain: Chain;
  rpcEnv: string;
  tokenApiNetwork?: string;
  alchemyHost: string;
  tokens: readonly Token[];
};

export type AssetBalance = {
  symbol: string;
  value: bigint;
  decimals: number;
  formatted: string;
  address?: Address;
};

export type NetworkBalances = {
  native: AssetBalance;
  tokens: AssetBalance[];
};
