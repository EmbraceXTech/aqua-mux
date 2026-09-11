import { fingerprint, validateFreshRequest, validateResult, type ProviderReview, type ReviewRequest, type ReviewResponse } from "./contract";
import { ServiceError, publicError } from "./errors";
import { ReviewStore, type StoredReview } from "./store";

export type ReviewLimits = { concurrency: number; timeoutMs: number; reviewsPerMinute: number; reviewsPerDay: number };
export const defaultLimits: ReviewLimits = { concurrency: 2, timeoutMs: 120_000, reviewsPerMinute: 6, reviewsPerDay: 200 };

/** Owns durable idempotency and active inference. HTTP disconnects do not erase a request. */
export class Reviews {
  private active = new Map<string, { controller: AbortController; promise: Promise<ReviewResponse> }>();
  private closing = false;
  readonly limits: ReviewLimits;

  constructor(private store: ReviewStore, private provider: ProviderReview, limits: Partial<ReviewLimits> = {}) {
    this.limits = { ...defaultLimits, ...limits };
    if (Object.values(this.limits).some(v => !Number.isSafeInteger(v) || v <= 0)) throw new Error("Invalid review limits");
    if (this.limits.concurrency > 8 || this.limits.timeoutMs > 300_000) throw new Error("Review limits exceed safety ceiling");
  }

  async submit(request: ReviewRequest): Promise<ReviewResponse> {
    if (this.closing) throw new ServiceError(503, "runner_closing");
    const digest = fingerprint(request);
    const previous = this.store.get(request.requestId);
    if (previous) {
      if (previous.fingerprint !== digest) throw new ServiceError(409, "idempotency_conflict");
      const active = this.active.get(request.requestId);
      if (active) return active.promise;
      return this.restore(previous);
    }
    validateFreshRequest(request);
    if (this.active.size >= this.limits.concurrency) throw new ServiceError(429, "concurrency_exhausted");
    const now = Date.now();
    if (this.store.countSince(now - 60_000) >= this.limits.reviewsPerMinute || this.store.countSince(now - 86_400_000) >= this.limits.reviewsPerDay)
      throw new ServiceError(429, "development_quota_exhausted");
    this.store.insert(request.requestId, digest, request);
    const controller = new AbortController();
    // Schedule work after ownership is recorded so cancellation always finds the controller.
    const promise = Promise.resolve().then(() => this.run(request, controller));
    this.active.set(request.requestId, { controller, promise });
    return promise;
  }

  private restore(row: StoredReview): ReviewResponse {
    if (row.status === "succeeded" && row.response) return JSON.parse(row.response);
    throw new ServiceError(row.error_status ?? 409, row.error_code ?? "review_not_available");
  }

  private async run(request: ReviewRequest, controller: AbortController): Promise<ReviewResponse> {
    const timeout = Math.min(this.limits.timeoutMs, (request.deadline ?? Infinity) - Date.now());
    const timer = setTimeout(() => controller.abort(new ServiceError(504, "review_timeout")), Math.max(1, timeout));
    try {
      controller.signal.throwIfAborted();
      const output = await this.provider(request, controller.signal);
      controller.signal.throwIfAborted();
      const result = validateResult(output.result, request);
      const response = { ...output, requestId: request.requestId, result };
      this.store.finish(request.requestId, "succeeded", response);
      return response;
    } catch (error) {
      const failure = publicError(controller.signal.aborted ? controller.signal.reason : error);
      this.store.finish(request.requestId, failure.code === "review_cancelled" ? "cancelled" : "failed", null, failure.code, failure.status);
      throw failure;
    } finally {
      clearTimeout(timer);
      this.active.delete(request.requestId);
    }
  }

  cancel(id: string): { requestId: string; status: string } {
    const row = this.store.get(id);
    if (!row) throw new ServiceError(404, "review_not_found");
    if (row.status !== "running") return { requestId: id, status: row.status };
    this.store.finish(id, "cancelled", null, "review_cancelled", 409);
    this.active.get(id)?.controller.abort(new ServiceError(409, "review_cancelled"));
    return { requestId: id, status: "cancelled" };
  }

  async close(): Promise<void> {
    this.closing = true;
    for (const [id] of this.active) this.cancel(id);
    await Promise.allSettled([...this.active.values()].map(v => v.promise));
    this.store.close();
  }
}
