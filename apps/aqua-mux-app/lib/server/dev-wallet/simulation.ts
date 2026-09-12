import { keccak256 } from "viem";
import type { LifecyclePlan } from "../../managed";
import { digest } from "../lifecycle/digest";
import type { SimulationResult } from "../lifecycle/types";
import { client } from "../rpc";
import {
  encodeDevBatch,
  implementation,
  implementationHash,
  lifecycleBatch,
} from "./batch";
import { DevWalletError } from "./config";
import { validateBatchEnvelope } from "./policy";

// This read-only simulator needs no local signer, key, auth challenge, or dev-mode flag.
// A state override demonstrates the account's batch execution, not wallet compatibility.
export async function simulateLifecyclePlan(
  plan: LifecyclePlan,
): Promise<SimulationResult> {
  validateBatchEnvelope(lifecycleBatch(plan), plan.maker);
  const rpc = client(plan.chainId);
  if ((await rpc.getChainId()) !== plan.chainId)
    throw new DevWalletError("Configured RPC returned the wrong chain.");
  const block = await rpc.getBlock({ blockTag: "latest" });
  const code = await rpc.getCode({
    address: implementation,
    blockNumber: block.number,
  });
  if (!code || keccak256(code) !== implementationHash)
    throw new DevWalletError(
      "The atomic account implementation is not verified on this chain.",
    );
  const call = {
    account: plan.maker,
    to: plan.maker,
    data: encodeDevBatch(plan.calls),
    blockNumber: block.number,
    stateOverride: [{ address: plan.maker, code }],
  };
  await rpc.call(call);
  const gas = await rpc.estimateGas(call);
  const gasPrice = await rpc.getGasPrice();
  return {
    success: true,
    atomic: true,
    callsDigest: digest(plan.calls),
    blockNumber: String(block.number),
    blockHash: block.hash,
    simulatedAt: Date.now(),
    estimatedGasWei: String((((gas + 25_000n) * 130n) / 100n) * gasPrice * 2n),
  };
}
