import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { keccak256, stringToHex, toHex, type Address } from "viem";
import type { LifecyclePlan } from "../../lib/managed";
import type { ManagedStore } from "../../lib/server/store";
import { prepareExternalExecution } from "../../lib/server/external-adapter/execution";
import type { controlledFork } from "./controlled-fork";
import type { createExternalExecution } from "./external-execution";

/** Change only disposable fork state at the signing/inclusion boundaries. */
export async function verifyProxyUpgrade({
  fork,
  store,
  input,
  plan,
  token,
  execute,
  indirectDependency,
  beforeSigning,
  expectedProof,
}: {
  fork: Awaited<ReturnType<typeof controlledFork>>;
  store: ManagedStore;
  input: Parameters<typeof createExternalExecution>[2];
  plan: LifecyclePlan;
  token: Address;
  execute: ReturnType<typeof createExternalExecution>["execute"];
  indirectDependency: boolean;
  beforeSigning: boolean;
  expectedProof: boolean;
}) {
  const proxy = token;
  if (indirectDependency)
    assert.ok(!plan.calls.some((call) => call.to === proxy));
  const slot = keccak256(stringToHex("org.zeppelinos.proxy.implementation"));
  const stored = await fork.rpc.getStorageAt({ address: proxy, slot });
  assert.ok(stored && BigInt(stored) > 0n);
  const implementation = `0x${stored.slice(-40)}` as Address;
  const code = await fork.rpc.getCode({ address: implementation });
  assert.ok(code && code !== "0x");
  if (beforeSigning) {
    const changedImplementation = "0x000000000000000000000000000000000000beef";
    await fork.request("anvil_setCode", [changedImplementation, code]);
    await fork.request("anvil_setStorageAt", [
      proxy,
      slot,
      toHex(BigInt(changedImplementation), { size: 32 }),
    ]);
    await assert.rejects(prepareExternalExecution(input, store), {
      code: "external_preflight_unavailable",
    });
    assert.equal(
      store.list("transaction", input.owner, input.groupId).length,
      0,
    );
    const evidence = {
      chainId: fork.rpc.chain.id,
      evidence: "controlled fork proxy pointer change before signing",
      proxy,
      implementation,
      changedImplementation,
      refusedBeforeSigning: true,
      journalEntries: 0,
      publicBroadcasts: 0,
    };
    writeFileSync(
      "/tmp/aquamux-proxy-pointer-before-signing.json",
      JSON.stringify(evidence, null, 2),
    );
    console.log(JSON.stringify(evidence));
    return;
  }

  const receipt = await execute(plan.id, false, {
    expectedProof,
    beforeBroadcast: async () => {
      await fork.request("anvil_setCode", [implementation, `${code}00`]);
    },
  });
  const evidence = {
    chainId: fork.rpc.chain.id,
    indirectDependency,
    evidence: "controlled fork implementation change after final preflight",
    proxy,
    implementation,
    originalImplementationHash: keccak256(code),
    changedImplementationHash: keccak256(`${code}00`),
    receiptStatus: receipt.status,
    hash: receipt.transactionHash,
    incorrectlyConfirmed: expectedProof,
    finalAttemptStatus: store
      .list("transaction", input.owner, input.groupId)
      .at(-1)?.status,
    publicBroadcasts: 0,
  };
  writeFileSync(
    `/tmp/aquamux-proxy-upgrade-${indirectDependency ? "indirect-" : ""}${expectedProof ? "before" : "after"}.json`,
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence));
}
