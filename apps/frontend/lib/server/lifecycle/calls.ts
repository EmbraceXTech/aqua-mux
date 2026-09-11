import {
  encodeFunctionData,
  erc20Abi,
  parseAbi,
  toHex,
  type Address,
} from "viem";
import { AQUA } from "../../config";
import type { Call } from "../../model";
import type { LifecycleSnapshot, PreviousStrategy } from "./types";

export const aquaLifecycleAbi = parseAbi([
  "function dock(address app,bytes32 strategyHash,address[] tokens)",
  "function rawBalances(address maker,address app,bytes32 strategyHash,address token) view returns(uint248,uint8)",
]);
export const wrappedAbi = parseAbi([
  "function deposit() payable",
  "function withdraw(uint256)",
]);
export function dockCall(previous: PreviousStrategy): Call {
  return {
    to: AQUA,
    data: encodeFunctionData({
      abi: aquaLifecycleAbi,
      functionName: "dock",
      args: [previous.app, previous.hash, previous.tokens],
    }),
    value: "0x0",
    label: `Close ${previous.hash}`,
  };
}
export function wrapCall(token: Address, amount: bigint): Call {
  return {
    to: token,
    data: encodeFunctionData({ abi: wrappedAbi, functionName: "deposit" }),
    value: toHex(amount),
    label: "Wrap selected native inventory",
  };
}
export function unwrapCall(token: Address, amount: bigint): Call {
  return {
    to: token,
    data: encodeFunctionData({
      abi: wrappedAbi,
      functionName: "withdraw",
      args: [amount],
    }),
    value: "0x0",
    label: "Unwrap selected converted inventory",
  };
}
export function approvalBuilder(snapshot: LifecycleSnapshot, calls: Call[]) {
  const allowances = new Map(
    snapshot.allowances.map((a) => [
      `${a.token}:${a.spender}`,
      BigInt(a.amount),
    ]),
  );
  return (token: Address, spender: Address, amount: bigint) => {
    const key = `${token}:${spender}`,
      current = allowances.get(key) ?? 0n;
    if (current === amount) return;
    const push = (n: bigint) =>
      calls.push({
        to: token,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, n],
        }),
        value: "0x0",
        label: `Approve ${n} raw units for ${spender}`,
      });
    if (current > 0n) push(0n);
    if (amount > 0n) push(amount);
    allowances.set(key, amount);
  };
}
