import { tool } from "ai";
import { z } from "zod";
import type { ReviewRequest } from "./contract";
import { proposalPreview } from "./proposal-preview";
import {
  canonicalDigest,
  type StrategyConfig,
} from "../../../frontend/lib/managed";

/** All tools are bound to one authenticated immutable request, with no credentials or I/O. */
export function reviewTools(
  request: ReviewRequest,
  signal: AbortSignal,
  record: (name: string) => void,
  savePreview: (id: string, config: StrategyConfig) => void,
) {
  const query = <T>(name: string, read: () => T) => {
    signal.throwIfAborted();
    if (request.deadline && Date.now() >= request.deadline)
      throw new Error("Review deadline elapsed.");
    record(name);
    return structuredClone(read());
  };
  return {
    wallet_snapshot: tool({
      description:
        "Read the verified wallet amounts, native gas funds and block identity for this request.",
      inputSchema: z.strictObject({}),
      execute: async () =>
        query("wallet_snapshot", () => ({
          chainId: request.snapshot.chainId,
          maker: request.snapshot.maker,
          blockNumber: request.snapshot.blockNumber,
          blockHash: request.snapshot.blockHash,
          nativeBalanceWei: request.snapshot.nativeBalanceWei,
          balances: request.snapshot.balances,
          allowances: request.snapshot.allowances,
        })),
    }),
    indexed_positions: tool({
      description:
        "Read existing known strategy exposure and direct backing reconciliation. Partial discovery never means zero exposure.",
      inputSchema: z.strictObject({}),
      execute: async () =>
        query("indexed_positions", () => ({
          strategies: request.snapshot.managedStrategies ?? null,
          reconciliation: request.snapshot.positionReconciliation ?? null,
          coverage: request.snapshot.coverage,
        })),
    }),
    route_observations: tool({
      description:
        "Query exact amount-specific funding quotes by selected destination; unavailable data remains null. These quotes are not a signing authorization.",
      inputSchema: z.strictObject({
        destination: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
      }),
      execute: async ({ destination }) =>
        query("route_observations", () => ({
          quotes:
            request.snapshot.routeQuotes?.filter(
              (quote) => quote.toToken.address === destination.toLowerCase(),
            ) ?? [],
          observedAt: request.snapshot.observedAt,
        })),
    }),
    proposal_preview: tool({
      description:
        "Compute a deterministic initial LP candidate with integer funding conservation, exact rational opening prices, editable recipe fee/range and real compiler bounds. It never signs, submits, or claims RPC simulation.",
      inputSchema: z.strictObject({}),
      execute: async () =>
        query("proposal_preview", () => {
          const preview = proposalPreview(request);
          if (!preview.available || !preview.config) return preview;
          const previewId = canonicalDigest(preview.config);
          savePreview(previewId, preview.config);
          const { config, ...summary } = preview;
          return {
            ...summary,
            previewId,
            pairs: config.pairs,
            wallet: {
              nativeBalanceWei: request.snapshot.nativeBalanceWei,
              balances: request.snapshot.balances,
              blockNumber: request.snapshot.blockNumber,
            },
            exposure: {
              strategies: request.snapshot.managedStrategies ?? null,
              reconciliation: request.snapshot.positionReconciliation ?? null,
              coverage: request.snapshot.coverage,
            },
          };
        }),
    }),
    configuration_context: tool({
      description:
        "Read the durable current configuration and unchanged policy for comparison; no model tool can alter authorization.",
      inputSchema: z.strictObject({}),
      execute: async () =>
        query("configuration_context", () => ({
          config: request.config ?? null,
          policy: request.config?.policy ?? request.policyTemplate,
          recipeDefaults: { feeBps: 5, rangeBps: 2000 },
          coverage: request.snapshot.coverage,
        })),
    }),
  };
}
