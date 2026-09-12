import { readFileSync, writeFileSync } from "node:fs";
import { client } from "../lib/server/rpc";
import type { Hex } from "viem";

// Read-only capability check against previously recorded public transactions.
// No account, signer, wallet client, or transaction submission is created.
process.loadEnvFile(new URL("../.env", import.meta.url).pathname);
const historical = JSON.parse(
  readFileSync(
    new URL("../verification/live-execution.json", import.meta.url),
    "utf8",
  ),
) as {
  runs: { chainId: number; mode: string; hash: Hex }[];
};
const results = await Promise.all(
  [42161, 56, 4663].map(async (chainId) => {
    const rpc = client(chainId);
    const hash = historical.runs.find(
      (run) => run.chainId === chainId && run.mode === "liquidity",
    )!.hash;
    const read = async (tracer: string) => {
      try {
        const result = await rpc.request({
          method: "debug_traceTransaction",
          params: [
            hash,
            {
              tracer,
              ...(tracer === "prestateTracer"
                ? { tracerConfig: { diffMode: false } }
                : {}),
            },
          ],
        } as never);
        return {
          available: !!result && typeof result === "object",
          shape: Array.isArray(result) ? "array" : typeof result,
        };
      } catch {
        return { available: false, shape: "unavailable" };
      }
    };
    const [identity, receipt, callTrace, prestate] = await Promise.allSettled([
      rpc.getChainId(),
      rpc.getTransactionReceipt({ hash }),
      read("callTracer"),
      read("prestateTracer"),
    ]);
    return {
      chainId,
      historicalHash: hash,
      chainMatches:
        identity.status === "fulfilled" && identity.value === chainId,
      receiptStatus:
        receipt.status === "fulfilled" ? receipt.value.status : "unavailable",
      callTrace:
        callTrace.status === "fulfilled"
          ? callTrace.value
          : { available: false },
      prestate:
        prestate.status === "fulfilled" ? prestate.value : { available: false },
    };
  }),
);
const report = {
  checkedAt: new Date().toISOString(),
  liveTransactionsSubmitted: 0,
  limitation:
    "Historical RPC capability checks do not prove a new application transaction or canonical plan binding.",
  results,
};
const output = process.argv[2];
if (!output) throw new Error("Provide a destination JSON path.");
writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
