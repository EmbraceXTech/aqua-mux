import { decodeEventLog, toEventSelector, type Log } from "viem";
import { aquaObservationAbi, swapObservationAbi } from "./abi";
import type { ChainObservationConfig, ObservedEvent } from "./types";

export function decodePositionLog(
  log: Log,
  config: ChainObservationConfig,
): ObservedEvent | null {
  const isAqua = log.address.toLowerCase() === config.aqua.toLowerCase();
  if (!isAqua && log.address.toLowerCase() !== config.swapVm.toLowerCase())
    return null;
  const abi = isAqua ? aquaObservationAbi : swapObservationAbi;
  if (
    !abi.some(
      (item) =>
        item.type === "event" && toEventSelector(item) === log.topics[0],
    )
  )
    return null;
  if (
    log.removed ||
    log.blockNumber === null ||
    !log.blockHash ||
    !log.transactionHash ||
    log.logIndex === null ||
    log.transactionIndex === null
  ) {
    throw new Error("Noncanonical or pending position log.");
  }
  const decoded = decodeEventLog({
    abi,
    data: log.data,
    topics: log.topics,
    strict: true,
  });
  const args = decoded.args;
  const base = {
    id: `${config.chainId}:${log.blockHash}:${log.transactionHash}:${log.logIndex}`,
    chainId: config.chainId,
    blockNumber: log.blockNumber.toString(),
    blockHash: log.blockHash,
    transactionHash: log.transactionHash,
    transactionIndex: log.transactionIndex,
    logIndex: log.logIndex,
    maker: args.maker,
  };
  if (decoded.eventName === "Swapped") {
    const fill = decoded.args;
    return {
      ...base,
      kind: "Swapped",
      app: config.swapVm,
      strategyHash: fill.orderHash,
      taker: fill.taker,
      tokenIn: fill.tokenIn,
      tokenOut: fill.tokenOut,
      amountIn: fill.amountIn.toString(),
      amountOut: fill.amountOut.toString(),
    };
  }
  const movement = decoded.args;
  return {
    ...base,
    kind: decoded.eventName,
    app: movement.app,
    strategyHash: movement.strategyHash,
    ...(decoded.eventName === "Shipped"
      ? { strategy: decoded.args.strategy }
      : {}),
    ...(decoded.eventName === "Pulled" || decoded.eventName === "Pushed"
      ? { token: decoded.args.token, amount: decoded.args.amount.toString() }
      : {}),
  };
}
