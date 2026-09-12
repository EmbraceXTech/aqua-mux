import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { keccak256, type Hex } from "viem";
import {
  buildLifecyclePlanWithRoutes,
  digest,
  type LifecycleRequest,
} from "../../lib/server/lifecycle";
import type { controlledFork } from "./controlled-fork";

/** Run only after real funded LP entry and resolver fills on the isolated fork. */
export async function verifyRoutelessProvenance(
  fork: Awaited<ReturnType<typeof controlledFork>>,
  request: LifecycleRequest,
  dependencies: Parameters<typeof buildLifecyclePlanWithRoutes>[1],
  openHash: Hex,
  save: (
    bundle: Awaited<ReturnType<typeof buildLifecyclePlanWithRoutes>>,
  ) => void,
  execute: (planId: string) => Promise<{ transactionHash: Hex }>,
) {
  const address = request.config.pairs[1].quoteToken.address;
  const original = (await fork.rpc.getCode({ address }))!;
  // Append unreachable STOP without changing ERC20 behavior, but break exact source provenance.
  await fork.request("anvil_setCode", [address, `${original}00`]);
  let accepted = false;
  let refusal: string | null = null;
  let closeHash: Hex;
  try {
    try {
      const result = await buildLifecyclePlanWithRoutes(request, dependencies);
      accepted =
        result.plan.simulation.callsDigest === digest(result.plan.calls);
    } catch (error) {
      refusal = error instanceof Error ? error.message : "Unknown refusal";
    }
    const close = await buildLifecyclePlanWithRoutes(
      {
        ...request,
        id: "routeless-close",
        kind: "close",
        conversion: undefined,
      },
      dependencies,
    );
    save(close);
    closeHash = (await execute(close.plan.id)).transactionHash;
  } finally {
    await fork.request("anvil_setCode", [address, original]);
  }
  const expectedRefusal = process.argv.includes("--expect-unverified");
  assert.equal(accepted, !expectedRefusal);
  if (expectedRefusal) assert.match(refusal!, /source provenance/);
  const evidence = {
    chainId: 4663,
    evidence:
      "controlled isolated fork after funded two-pair LP entry and resolver fills",
    publicBroadcasts: 0,
    openHash,
    closeWithChangedTokenRuntimeHash: closeHash,
    token: address,
    originalRuntimeHash: keccak256(original),
    changedRuntimeHash: keccak256(`${original}00`),
    noFundingRoutes: request.funding === undefined,
    acceptedWithSuccessfulSimulation: accepted,
    refusal,
  };
  writeFileSync(
    "/tmp/aquamux-routeless-provenance.json",
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
}
