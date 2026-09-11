import { z } from "zod";
import type { StrategyConfig } from "../../managed/config";
import type { ManagementPolicy } from "../../managed/policy";
import { reviewResultSchema } from "../../managed/review";
import { integerAmountSchema } from "../../managed/primitives";
import type { ProposalIntent } from "./inputs";
import type { WalletSnapshot } from "./snapshot";
import { ManagedError } from "./errors";

export interface RunnerRequest {
  requestId: string;
  owner: string;
  groupId: string;
  botId: string;
  runGeneration: number;
  purpose: "proposal" | "interval";
  config?: StrategyConfig;
  intent?: ProposalIntent;
  policyTemplate?: ManagementPolicy;
  snapshot: WalletSnapshot;
  deadline: number;
}
const envelopeSchema = z.strictObject({
  requestId: z.string(),
  result: reviewResultSchema,
  provider: z.string().min(1).max(160),
  model: z.string().min(1).max(160),
  runtimeVersion: z.string().min(1).max(160),
  usage: z.strictObject({
    inputTokens: integerAmountSchema.optional(),
    outputTokens: integerAmountSchema.optional(),
    cost: z.string().max(100).nullable(),
  }),
});
export type RunnerResult = z.infer<typeof envelopeSchema>;
export interface ReviewRunner {
  review(request: RunnerRequest, signal: AbortSignal): Promise<RunnerResult>;
  cancel(requestId: string): Promise<void>;
}

export class HttpReviewRunner implements ReviewRunner {
  private readonly base: URL;
  constructor(
    url: string,
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    this.base = new URL(url);
    if (
      this.base.username ||
      this.base.password ||
      this.base.search ||
      this.base.hash ||
      !token ||
      (this.base.protocol !== "https:" &&
        !(
          this.base.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(this.base.hostname)
        ))
    )
      throw new ManagedError(
        "runner_configuration",
        "Configure an authenticated HTTPS or loopback review runner.",
        503,
      );
  }
  async review(
    request: RunnerRequest,
    signal: AbortSignal,
  ): Promise<RunnerResult> {
    try {
      const response = await this.fetcher(new URL("/reviews", this.base), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": request.requestId,
        },
        body: JSON.stringify(request),
        signal,
        redirect: "error",
        cache: "no-store",
      });
      if (!response.ok)
        throw new ManagedError(
          response.status === 429 ? "quota_exhausted" : "runner_failed",
          response.status === 429
            ? "The review provider quota is exhausted."
            : "The authenticated review runner could not complete this request.",
          response.status === 429 ? 429 : 502,
        );
      const reader = response.body?.getReader();
      if (!reader) throw new Error("Missing body");
      let bytes = 0;
      const chunks: Uint8Array[] = [];
      for (;;) {
        const item = await reader.read();
        if (item.done) break;
        bytes += item.value.byteLength;
        if (bytes > 1_000_000) {
          await reader.cancel();
          throw new Error("Oversized result");
        }
        chunks.push(item.value);
      }
      const parsed = envelopeSchema.parse(
        JSON.parse(Buffer.concat(chunks).toString("utf8")),
      );
      if (parsed.requestId !== request.requestId)
        throw new Error("Wrong request identity");
      return parsed;
    } catch (error) {
      if (error instanceof ManagedError) throw error;
      if (signal.aborted)
        throw new ManagedError(
          "review_cancelled",
          "The review was cancelled or timed out.",
          408,
        );
      throw new ManagedError(
        "runner_failed",
        "The review runner returned no valid result.",
        502,
      );
    }
  }
  async cancel(requestId: string): Promise<void> {
    try {
      await this.fetcher(
        new URL(`/reviews/${encodeURIComponent(requestId)}`, this.base),
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${this.token}` },
          signal: AbortSignal.timeout(3000),
          redirect: "error",
        },
      );
    } catch {
      /* Generation fencing remains authoritative if remote cancellation fails. */
    }
  }
}
export function configuredRunner(): ReviewRunner {
  const url = process.env.AQUAMUX_AGENT_RUNNER_URL,
    token = process.env.AQUAMUX_AGENT_RUNNER_TOKEN;
  if (!url || !token)
    throw new ManagedError(
      "runner_unavailable",
      "The authenticated review runner is not configured.",
      503,
    );
  return new HttpReviewRunner(url, token);
}
