import {
  erc20Abi,
  TransactionReceiptNotFoundError,
  type PublicClient,
} from "viem";
import { aquaObservationAbi } from "./abi";
import type { PositionRpc } from "./types";

/** Public RPC only. Never accepts a wallet client or submits transactions. */
export function createPositionRpc(client: PublicClient): PositionRpc {
  return {
    chainId: () => client.getChainId(),
    head: () => client.getBlockNumber({ cacheTime: 0 }),
    block: async (blockNumber) => {
      const block = await client.getBlock({ blockNumber });
      if (!block.hash) throw new Error("Missing canonical block hash.");
      return { hash: block.hash };
    },
    logs: (address, fromBlock, toBlock) =>
      client.getLogs({ address, fromBlock, toBlock }),
    balance: (address, maker, blockNumber) =>
      client.readContract({
        address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [maker],
        blockNumber,
      }),
    allowance: (address, maker, spender, blockNumber) =>
      client.readContract({
        address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [maker, spender],
        blockNumber,
      }),
    virtual: (address, position, token, blockNumber) =>
      client.readContract({
        address,
        abi: aquaObservationAbi,
        functionName: "rawBalances",
        args: [position.maker, position.app, position.strategyHash, token],
        blockNumber,
      }),
    receipt: async (hash) => {
      try {
        return await client.getTransactionReceipt({ hash });
      } catch (error) {
        if (error instanceof TransactionReceiptNotFoundError) return null;
        throw error;
      }
    },
  };
}
