import type { Address, Hex, Log } from "viem";

export type ChainObservationConfig = {
  chainId: number;
  aqua: Address;
  swapVm: Address;
  startBlock: string;
  confirmations: number;
  chunkSize: number;
};
export type ObservedEvent = {
  id: string;
  chainId: number;
  blockNumber: string;
  blockHash: Hex;
  transactionHash: Hex;
  transactionIndex: number;
  logIndex: number;
  kind: "Shipped" | "Docked" | "Pulled" | "Pushed" | "Swapped";
  maker: Address;
  app: Address;
  strategyHash: Hex;
  strategy?: Hex;
  token?: Address;
  amount?: string;
  taker?: Address;
  tokenIn?: Address;
  tokenOut?: Address;
  amountIn?: string;
  amountOut?: string;
};
export type ChainObservation = {
  schemaVersion: 1;
  config: ChainObservationConfig;
  indexedThrough: { number: string; hash: Hex } | null;
  targetBlock: string | null;
  health: "unknown" | "backfilling" | "current" | "unavailable";
  checkedAt: string;
  error: "rpc_unavailable" | "chain_changed" | null;
  events: ObservedEvent[];
};
export type PositionRef = {
  id: string;
  groupId: string;
  ownerId: string;
  chainId: number;
  maker: Address;
  app: Address;
  strategyHash: Hex;
  tokens: Address[];
};
export type PositionRpc = {
  chainId(): Promise<number>;
  head(): Promise<bigint>;
  block(number: bigint): Promise<{ hash: Hex }>;
  logs(addresses: Address[], from: bigint, to: bigint): Promise<Log[]>;
  balance(token: Address, maker: Address, block: bigint): Promise<bigint>;
  allowance(
    token: Address,
    maker: Address,
    spender: Address,
    block: bigint,
  ): Promise<bigint>;
  virtual(
    aqua: Address,
    position: PositionRef,
    token: Address,
    block: bigint,
  ): Promise<readonly [bigint, number]>;
  receipt(hash: Hex): Promise<{
    status: "success" | "reverted";
    blockNumber: bigint;
    blockHash: Hex;
    gasUsed: bigint;
    effectiveGasPrice: bigint;
  } | null>;
};
export type ObservationRepository = {
  read(key: string): { revision: number; value: ChainObservation } | null;
  write(key: string, revision: number | null, value: ChainObservation): void;
};
