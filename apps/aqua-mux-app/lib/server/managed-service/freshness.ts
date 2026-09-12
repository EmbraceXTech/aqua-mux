import { ManagedError } from "./errors";
import type { WalletSnapshot } from "./snapshot";

/** A successful model response does not extend the lifetime of its evidence. */
export function assertReviewSnapshotFresh(
  snapshot: WalletSnapshot,
  maxAgeMs: number,
  now: number,
) {
  const times = [
    snapshot.observedAt,
    snapshot.blockTimestamp,
    ...snapshot.coverage.map((source) => source.observedAt),
  ];
  if (times.some((time) => time > now + 10_000 || now - time > maxAgeMs))
    throw new ManagedError(
      "stale_data",
      "Wallet or source data became stale while the review ran. Request a fresh review.",
    );
  if (
    snapshot.routeQuotes?.some(
      (quote) =>
        quote.expiresAt <= now ||
        quote.observedAt > now ||
        now - quote.observedAt > maxAgeMs,
    )
  )
    throw new ManagedError(
      "stale_data",
      "A route quote expired while the review ran. Request a fresh review.",
    );
}
