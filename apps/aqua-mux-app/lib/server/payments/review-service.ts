import { ManagedError } from "../managed-service/errors";

export interface ReviewEntitlement {
  authorize(input: {
    owner: string;
    requestId: string;
    priorReviews: number;
  }): Promise<{
    kind: "uncharged-development";
    charge: null;
  }>;
}

/** Entitlement permits inference only. It never permits a wallet operation. */
export class DevelopmentReviewEntitlement implements ReviewEntitlement {
  constructor(private readonly maxReviews: number) {
    if (!Number.isSafeInteger(maxReviews) || maxReviews < 0)
      throw new Error("Invalid review quota.");
  }
  async authorize(input: {
    owner: string;
    requestId: string;
    priorReviews: number;
  }) {
    if (input.priorReviews >= this.maxReviews) {
      throw new ManagedError(
        "quota_exhausted",
        "The development review quota is exhausted.",
        429,
      );
    }
    return { kind: "uncharged-development" as const, charge: null };
  }
}
