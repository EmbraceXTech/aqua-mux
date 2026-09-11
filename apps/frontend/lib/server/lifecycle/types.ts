import type { Address, Hex } from "viem";
import type { StrategyConfig } from "../../managed/config";
import type { Token, TokenAmount } from "../../managed/primitives";
import type { LifecyclePlan } from "../../managed/lifecycle";
import type { Call } from "../../model";
import type { RoutePolicyRequest, VerifiedRoute } from "../route-policy/types";

export type PreviousStrategy = { hash: Hex; app: Address; tokens: Address[] };
export type LifecycleRequest = {
  id: string;
  groupId: string;
  owner: Address;
  config: StrategyConfig;
  runGeneration: number;
  kind: LifecyclePlan["kind"];
  inventory: TokenAmount[];
  funding?: {
    token: Token;
    amount: string;
    purchases: { token: Token; amountIn: string; minimumAmountOut: string }[];
  };
  previous?: PreviousStrategy[];
  conversion?: { targetToken: Token; amounts: TokenAmount[]; unwrap?: boolean };
  gasReserveWei: string;
  expiresAt: number;
};
export type LifecycleSnapshot = {
  chainId: number;
  maker: Address;
  observedAt: number;
  blockNumber: string;
  blockHash: Hex;
  nativeBalance: string;
  balances: TokenAmount[];
  allowances: { token: Address; spender: Address; amount: string }[];
  contracts: { address: Address; codeHash: Hex; implementation?: Address }[];
  strategies: PreviousStrategy[];
};
export type RouteRequest = {
  chainId: number;
  maker: Address;
  source: Token;
  destination: Token;
  amountIn: string;
  minimumAmountOut: string;
  slippageBps: number;
};
export type LifecycleRoute = {
  call: Call;
  spender: Address;
  amountOut: string;
  minimumAmountOut: string;
  quotedAt: number;
  expiresAt: number;
  request?: RoutePolicyRequest;
  policy?: VerifiedRoute["policy"];
  amountIn?: string;
};
export type LifecycleRouteBinding = {
  request: RouteRequest;
  route: LifecycleRoute;
};
export type LifecyclePlanBundle = {
  plan: LifecyclePlan;
  routes: LifecycleRouteBinding[];
};
export type SimulationResult = {
  success: boolean;
  atomic: boolean;
  callsDigest: Hex;
  blockNumber: string;
  blockHash: Hex;
  simulatedAt: number;
  estimatedGasWei: string;
};
export type LifecycleDependencies = {
  now?: () => number;
  nonce?: () => Hex;
  snapshot(request: LifecycleRequest): Promise<LifecycleSnapshot>;
  quote(request: RouteRequest): Promise<LifecycleRoute>;
  simulate(plan: LifecyclePlan): Promise<SimulationResult>;
  /** Trusted dependency injection for isolated fixtures, never client-supplied. */
  validateRoute?(
    request: RouteRequest,
    route: LifecycleRoute,
    now: number,
  ): void;
  verifyRouteProvenance?(
    request: RouteRequest,
    route: LifecycleRoute,
  ): Promise<void>;
};
