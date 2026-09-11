import assert from "node:assert/strict";
import {
  decodeFunctionData,
  encodeFunctionData,
  erc20Abi,
  type Hex,
} from "viem";
import type { LifecyclePlan } from "../../lib/managed";
import { encodeDevBatch } from "../../lib/server/dev-wallet/batch";
import { directPairAbi } from "../../lib/server/route-policy/direct/calldata";
import { directPools } from "../../lib/server/route-policy/direct/deployments";

/** Exercise the real signed-transaction relay with altered provider output. */
export async function rejectAlteredSignedPlans(
  plan: LifecyclePlan,
  sign: (data: Hex) => Promise<Hex>,
  relay: (serialized: Hex) => Promise<unknown>,
) {
  const candidates: Hex[] = ["0xdeadbeef"];
  if (plan.chainId === 4663) {
    const poolIndex = plan.calls.findIndex((call) =>
      directPools.some((pool) => pool.address === call.to),
    );
    if (poolIndex >= 0) {
      const decoded = decodeFunctionData({
        abi: directPairAbi,
        data: plan.calls[poolIndex].data,
      });
      assert.equal(decoded.functionName, "swap");
      const [a, b, receiver] = decoded.args;
      for (const args of [
        [a ? 1n : 0n, b ? 1n : 0n, receiver, "0x"],
        [a, b, "0x0000000000000000000000000000000000000002", "0x"],
        [a, b, receiver, "0xdeadbeef"],
      ] as const) {
        const calls = structuredClone(plan.calls);
        calls[poolIndex].data = encodeFunctionData({
          abi: directPairAbi,
          functionName: "swap",
          args,
        });
        candidates.push(encodeDevBatch(calls));
      }
      const transferIndex = poolIndex - 1;
      const transfer = decodeFunctionData({
        abi: erc20Abi,
        data: plan.calls[transferIndex].data,
      });
      assert.equal(transfer.functionName, "transfer");
      const calls = structuredClone(plan.calls);
      calls[transferIndex].data = encodeFunctionData({
        abi: erc20Abi,
        functionName: "transfer",
        args: [transfer.args[0], transfer.args[1] + 1n],
      });
      candidates.push(encodeDevBatch(calls));
      candidates.push(encodeDevBatch([...plan.calls, plan.calls[poolIndex]]));
    }
  }
  for (const data of candidates)
    await assert.rejects(relay(await sign(data)), /differs/);
  return candidates.length;
}
