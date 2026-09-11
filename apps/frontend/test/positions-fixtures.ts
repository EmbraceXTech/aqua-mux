import {
  encodeAbiParameters,
  encodeEventTopics,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { ABI } from "@1inch/aqua-sdk";
import type {
  ChainObservationConfig,
  ChainObservation,
  ObservationRepository,
  PositionRef,
  PositionRpc,
} from "../lib/server/positions/types";
export const maker = `0x${"11".repeat(20)}` as Address;
export const aqua = `0x${"22".repeat(20)}` as Address;
export const app = `0x${"33".repeat(20)}` as Address;
export const tokenA = `0x${"44".repeat(20)}` as Address;
export const tokenB = `0x${"55".repeat(20)}` as Address;
export const hash = `0x${"66".repeat(32)}` as Hex;
export const blockHash = (number: bigint, fork = 0) =>
  `0x${(number + BigInt(fork) * 1000n).toString(16).padStart(64, "0")}` as Hex;
export const config: ChainObservationConfig = {
  chainId: 42161,
  aqua,
  swapVm: app,
  startBlock: "10",
  confirmations: 2,
  chunkSize: 10,
};
export const position: PositionRef = {
  id: "p",
  groupId: "g",
  ownerId: maker,
  chainId: 42161,
  maker,
  app,
  strategyHash: hash,
  tokens: [tokenA, tokenB],
};
export function shipped(number = 10n, fork = 0): Log {
  const event = ABI.AQUA_ABI.find(
    (item) => item.type === "event" && item.name === "Shipped",
  )!;
  if (event.type !== "event") throw new Error("SDK fixture missing.");
  return {
    address: aqua,
    blockNumber: number,
    blockHash: blockHash(number, fork),
    transactionHash: hash,
    transactionIndex: 0,
    logIndex: 0,
    removed: false,
    topics: encodeEventTopics({ abi: ABI.AQUA_ABI, eventName: "Shipped" }),
    data: encodeAbiParameters(event.inputs, [maker, app, hash, "0x1234"]),
  };
}
export function repository(): ObservationRepository {
  let saved: { revision: number; value: ChainObservation } | null = null;
  return {
    read: () => (saved ? structuredClone(saved) : null),
    write: (_key, revision, value) => {
      if (revision !== (saved?.revision ?? null)) throw new Error("conflict");
      saved = { revision: (revision ?? 0) + 1, value: structuredClone(value) };
    },
  };
}
export function rpc(overrides: Partial<PositionRpc> = {}): PositionRpc {
  return {
    chainId: async () => 42161,
    head: async () => 22n,
    block: async (number) => ({ hash: blockHash(number) }),
    logs: async () => [],
    balance: async () => 100n,
    allowance: async () => 80n,
    virtual: async () => [90n, 2],
    receipt: async () => null,
    ...overrides,
  };
}
