import type { Address, Hex } from "viem";
import type { Call } from "../../model";

export type RoutePolicyRequest = {
  chainId: number;
  maker: Address;
  source: Address;
  destination: Address;
  amountIn: string;
  minimumAmountOut: string;
  slippageBps: number;
};

/** Persist this server-produced record with the reviewed plan, never accept it from a client. */
export type VerifiedRoute = {
  request: RoutePolicyRequest;
  call: Call;
  spender: Address;
  amountIn: string;
  amountOut: string;
  minimumAmountOut: string;
  quotedAt: number;
  expiresAt: number;
  policy: { version: 1; poolId: string };
};

export type PoolDeployment = {
  id: string;
  chainId: number;
  address: Address;
  codeHash: Hex;
  token0: Address;
  token1: Address;
  protocol: "uniswap-v3" | "uniswap-v2";
  fee: number;
  sourceUrl: string;
};

export type RouterDeployment = {
  address: Address;
  codeHash: Hex;
  wrapped: Address;
  sourceUrl: string;
  quoter?: Address;
};
