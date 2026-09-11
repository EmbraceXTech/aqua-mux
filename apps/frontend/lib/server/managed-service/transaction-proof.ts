import type { LifecyclePlan } from "../../managed";
import { encodeDevBatch } from "../dev-wallet/batch";

/** RPC callTracer data, never browser-supplied. */
type Trace = {
  type?: string;
  from?: string;
  to?: string;
  input?: string;
  value?: string;
  error?: string;
  calls?: Trace[];
};
export function traceProvesPlan(trace: unknown, plan: LifecyclePlan): boolean {
  let nodes = 0;
  const visit = (node: Trace, depth: number): boolean => {
    if (
      !node ||
      typeof node !== "object" ||
      ++nodes > 10_000 ||
      depth > 128 ||
      node.error
    )
      return false;
    const calls = Array.isArray(node.calls) ? node.calls : [];
    if (
      node.to?.toLowerCase() === plan.maker &&
      calls.length === plan.calls.length &&
      calls.every((call, index) => {
        const expected = plan.calls[index];
        try {
          return (
            call.type === "CALL" &&
            !call.error &&
            call.from?.toLowerCase() === plan.maker &&
            call.to?.toLowerCase() === expected.to &&
            call.input?.toLowerCase() === expected.data.toLowerCase() &&
            BigInt(call.value ?? "0x0") === BigInt(expected.value)
          );
        } catch {
          return false;
        }
      })
    )
      return true;
    return calls.some((child) => visit(child, depth + 1));
  };
  return visit(trace as Trace, 0);
}
export function directBatchProvesPlan(
  tx: { from: string; to: string | null; input: string; value: bigint },
  plan: LifecyclePlan,
) {
  return (
    tx.from.toLowerCase() === plan.maker &&
    tx.to?.toLowerCase() === plan.maker &&
    tx.value === 0n &&
    tx.input.toLowerCase() === encodeDevBatch(plan.calls).toLowerCase()
  );
}
