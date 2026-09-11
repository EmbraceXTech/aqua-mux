import { erc20Abi, keccak256, type Address } from "viem";
import { routePolicyTargets } from "../route-policy/route-calls";
import { AQUA, SWAP_VM, NATIVE } from "../../config";
import { client } from "../rpc";
import { implementationSlot } from "../route-policy/provenance";
import { aquaLifecycleAbi } from "./calls";
import { requestTokens, verifyLifecycleToken } from "./metadata";
import type { LifecycleRequest, LifecycleSnapshot } from "./types";

const aquaCodeHash =
  "0x720bc02d220db318164dc3bade86eec1f3655bdc00fc1174de7d816a95c341f8";
const swapVmCodeHashes: Record<number, string> = {
  1: "0x1ffc57300722e5a2c523b5131e17c01950f447718449e1c9fd2ab382b3e340f9",
  42161: "0x7cb8785de84b35bced79fbecbbc6336f473623568cba28b7af3ed001b20d580e",
  56: "0x1d0fee80375eefa84811dd8231b159e97e4925e3e7a35cd227eb0279d54d3754",
  4663: "0xc945eab9457f0edc9673118443b9cadac7e7bdedf0dd734b260c2f39fef5f1c4",
};

/** Pin every read to one block and reject a deployment change before compiling. */
export async function readLifecycleSnapshot(
  request: LifecycleRequest,
): Promise<LifecycleSnapshot> {
  const { chainId, maker } = request.config,
    rpc = client(chainId);
  if ((await rpc.getChainId()) !== chainId)
    throw new Error("RPC chain mismatch.");
  const block = await rpc.getBlock();
  if (
    Date.now() - Number(block.timestamp) * 1000 >
    Math.min(30000, request.config.policy.maxReferenceAgeMs.value)
  )
    throw new Error("Latest chain block is stale.");
  const blockNumber = block.number;
  const selectedTokens = requestTokens(request);
  const addresses = new Set<Address>(selectedTokens.map((t) => t.address));
  await Promise.all(
    selectedTokens.map((t) => verifyLifecycleToken(t, rpc, blockNumber)),
  );
  const needsRoute =
    !!request.funding?.purchases.length || request.kind === "close-and-convert";
  const contracts = await Promise.all(
    [
      ...new Set([
        AQUA,
        SWAP_VM,
        ...(needsRoute ? routePolicyTargets(chainId) : []),
        ...selectedTokens
          .map((token) => token.address)
          .filter((address) => address !== NATIVE),
      ]),
    ].map(async (address) => {
      const code = await rpc.getCode({ address, blockNumber });
      if (!code || code === "0x")
        throw new Error("Required contract is unavailable.");
      const codeHash = keccak256(code);
      if (
        (address === AQUA && codeHash !== aquaCodeHash) ||
        (address === SWAP_VM && codeHash !== swapVmCodeHashes[chainId])
      )
        throw new Error(
          "Deployed Aqua or SwapVM bytecode differs from verified provenance.",
        );
      return { address, codeHash };
    }),
  );
  for (const contract of [...contracts]) {
    const value = await rpc.getStorageAt({
      address: contract.address,
      slot: implementationSlot,
      blockNumber,
    });
    if (value && BigInt(value) !== 0n) {
      if (BigInt(value) >= 1n << 160n)
        throw new Error("Invalid proxy implementation slot.");
      const implementation = `0x${value.slice(-40)}` as Address;
      const code = await rpc.getCode({ address: implementation, blockNumber });
      if (!code || code === "0x")
        throw new Error("Proxy implementation is unavailable.");
      Object.assign(contract, { implementation });
      if (!contracts.some((entry) => entry.address === implementation))
        contracts.push({ address: implementation, codeHash: keccak256(code) });
    }
  }
  const nativeBalance = await rpc.getBalance({ address: maker, blockNumber });
  const balances = await Promise.all(
    [...addresses].map(async (address) => ({
      token: selectedTokens.find((t) => t.address === address)!,
      amount: String(
        address === NATIVE
          ? nativeBalance
          : await rpc.readContract({
              address,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [maker],
              blockNumber,
            }),
      ),
    })),
  );
  const allowances = await Promise.all(
    [...addresses]
      .filter((a) => a !== NATIVE)
      .flatMap((address) =>
        [AQUA, ...(needsRoute ? routePolicyTargets(chainId) : [])].map(
          async (spender) => ({
            token: address,
            spender,
            amount: String(
              await rpc.readContract({
                address,
                abi: erc20Abi,
                functionName: "allowance",
                args: [maker, spender],
                blockNumber,
              }),
            ),
          }),
        ),
      ),
  );
  const strategies = [];
  for (const previous of request.previous ?? []) {
    const states = await Promise.all(
      previous.tokens.map((t) =>
        rpc.readContract({
          address: AQUA,
          abi: aquaLifecycleAbi,
          functionName: "rawBalances",
          args: [maker, previous.app, previous.hash, t],
          blockNumber,
        }),
      ),
    );
    if (states.every(([, count]) => count === previous.tokens.length))
      strategies.push(previous);
  }
  return {
    chainId,
    maker,
    observedAt: Date.now(),
    blockNumber: String(blockNumber),
    blockHash: block.hash,
    nativeBalance: String(nativeBalance),
    balances,
    allowances,
    contracts,
    strategies,
  };
}
