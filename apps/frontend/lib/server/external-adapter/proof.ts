import { keccak256, type Hex } from "viem";
import type { LifecyclePlan } from "../../managed";
import {
  implementation,
  implementationHash,
  encodeDevBatch,
} from "../dev-wallet/batch";
import { delegatedAccountCode } from "./account";
import {
  implementationFromSlots,
  proxyImplementationSlots,
} from "../proxy-implementation";

type Trace = {
  type?: string;
  from?: string;
  to?: string;
  input?: string;
  value?: string;
  error?: string;
  calls?: Trace[];
};
export function exactBatchTrace(trace: unknown, plan: LifecyclePlan): boolean {
  try {
    const root = trace as Trace;
    if (
      !root ||
      root.type !== "CALL" ||
      root.error ||
      root.from?.toLowerCase() !== plan.maker ||
      root.to?.toLowerCase() !== plan.maker ||
      root.input?.toLowerCase() !== encodeDevBatch(plan.calls).toLowerCase() ||
      BigInt(root.value ?? "0x0") !== 0n ||
      !Array.isArray(root.calls) ||
      root.calls.length !== plan.calls.length
    )
      return false;
    return root.calls.every((call, index) => {
      const expected = plan.calls[index];
      return (
        call.type === "CALL" &&
        !call.error &&
        call.from?.toLowerCase() === plan.maker &&
        call.to?.toLowerCase() === expected.to &&
        call.input?.toLowerCase() === expected.data.toLowerCase() &&
        BigInt(call.value ?? "0x0") === BigInt(expected.value)
      );
    });
  } catch {
    return false;
  }
}

/** prestateTracer code is from the start of this transaction, not the end of its block. */
export function accountPrestateProvesExecution(
  prestate: unknown,
  maker: string,
  initializedByTransaction = false,
) {
  if (!prestate || typeof prestate !== "object" || Array.isArray(prestate))
    return false;
  const accounts = Object.fromEntries(
    Object.entries(prestate).map(([address, account]) => [
      address.toLowerCase(),
      account as { code?: Hex },
    ]),
  );
  const code = accounts[implementation.toLowerCase()]?.code;
  return (
    (accounts[maker.toLowerCase()]?.code?.toLowerCase() ===
      delegatedAccountCode ||
      (initializedByTransaction &&
        (!accounts[maker.toLowerCase()]?.code ||
          accounts[maker.toLowerCase()]?.code === "0x"))) &&
    !!code &&
    keccak256(code) === implementationHash
  );
}

export function prestateProvesPlanDependencies(
  prestate: unknown,
  plan: LifecyclePlan,
) {
  if (!plan.deploymentEvidence?.length) return false;
  if (!prestate || typeof prestate !== "object") return false;
  const accounts = Object.fromEntries(
    Object.entries(prestate).map(([address, account]) => [
      address.toLowerCase(),
      account as { code?: Hex; storage?: Record<string, string> },
    ]),
  );
  const directTargets = new Set(plan.calls.map((call) => call.to));
  const observedTargets = plan.deploymentEvidence
    .filter((entry) => accounts[entry.address]?.code)
    .map((entry) => entry.address);
  for (const target of new Set([...directTargets, ...observedTargets])) {
    const dependency = plan.deploymentEvidence.find(
      (entry) => entry.address === target,
    );
    const actual = accounts[target];
    if (
      !dependency ||
      !actual?.code ||
      keccak256(actual.code) !== dependency.codeHash
    )
      return false;
    if (dependency.implementation) {
      const implementationEvidence = plan.deploymentEvidence.find(
        (entry) => entry.address === dependency.implementation,
      );
      const implementationCode = accounts[dependency.implementation]?.code;
      let implementation: string | undefined;
      try {
        implementation = implementationFromSlots(
          proxyImplementationSlots.map(
            (slot) => actual.storage?.[slot] as Hex | undefined,
          ),
        );
      } catch {
        return false;
      }
      if (
        implementation !== dependency.implementation ||
        !implementationEvidence ||
        !implementationCode ||
        keccak256(implementationCode) !== implementationEvidence.codeHash
      )
        return false;
    }
  }
  return true;
}
