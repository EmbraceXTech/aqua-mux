export class TokenValidationLimitError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("Token validation capacity is exhausted. Retry shortly.");
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

type LimitOptions = {
  maxOwnerConcurrent?: number;
  maxProcessConcurrent?: number;
  maxOwnerRequestsPerWindow?: number;
  maxProcessRequestsPerWindow?: number;
  windowMs?: number;
  now?: () => number;
};

type OwnerState = {
  active: number;
  requests: number[];
};

export class TokenValidationLimiter {
  // This admission state protects one Node.js process, so hosted replicas still need shared ingress limits.
  private readonly owners = new Map<string, OwnerState>();
  private readonly processRequests: number[] = [];
  private processActive = 0;
  private readonly maxOwnerConcurrent: number;
  private readonly maxProcessConcurrent: number;
  private readonly maxOwnerRequestsPerWindow: number;
  private readonly maxProcessRequestsPerWindow: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor(options: LimitOptions = {}) {
    this.maxOwnerConcurrent = options.maxOwnerConcurrent ?? 1;
    this.maxProcessConcurrent = options.maxProcessConcurrent ?? 4;
    this.maxOwnerRequestsPerWindow = options.maxOwnerRequestsPerWindow ?? 12;
    this.maxProcessRequestsPerWindow =
      options.maxProcessRequestsPerWindow ?? 48;
    this.windowMs = options.windowMs ?? 60_000;
    this.now = options.now ?? Date.now;
  }

  async run<T>(ownerValue: string, operation: () => Promise<T>): Promise<T> {
    const owner = ownerValue.toLowerCase();
    const now = this.now();
    this.pruneOwners(now);
    const ownerState = this.owners.get(owner) ?? { active: 0, requests: [] };
    this.prune(ownerState.requests, now);
    this.prune(this.processRequests, now);

    if (
      ownerState.active >= this.maxOwnerConcurrent ||
      this.processActive >= this.maxProcessConcurrent
    ) {
      throw new TokenValidationLimitError(1);
    }
    if (
      ownerState.requests.length >= this.maxOwnerRequestsPerWindow ||
      this.processRequests.length >= this.maxProcessRequestsPerWindow
    ) {
      const retryAt = Math.max(
        ownerState.requests.length >= this.maxOwnerRequestsPerWindow
          ? ownerState.requests[0] + this.windowMs
          : now,
        this.processRequests.length >= this.maxProcessRequestsPerWindow
          ? this.processRequests[0] + this.windowMs
          : now,
      );
      throw new TokenValidationLimitError(
        Math.max(1, Math.ceil((retryAt - now) / 1_000)),
      );
    }

    ownerState.active++;
    ownerState.requests.push(now);
    this.processActive++;
    this.processRequests.push(now);
    this.owners.set(owner, ownerState);
    try {
      return await operation();
    } finally {
      ownerState.active--;
      this.processActive--;
    }
  }

  private pruneOwners(now: number): void {
    for (const [owner, state] of this.owners) {
      this.prune(state.requests, now);
      if (state.active === 0 && state.requests.length === 0) {
        this.owners.delete(owner);
      }
    }
  }

  private prune(requests: number[], now: number): void {
    while (requests.length > 0 && requests[0] <= now - this.windowMs) {
      requests.shift();
    }
  }
}

export const tokenValidationLimiter = new TokenValidationLimiter();
