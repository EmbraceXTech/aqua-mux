import type { TokenMetadataCheck } from "./token-registry";

/** Display labels may drift; contract availability and exact decimals may not. */
export function hasVerifiedDecimals(
  check: TokenMetadataCheck,
  decimals: number,
): boolean {
  return (
    (check.status === "verified" || check.status === "mismatch") &&
    check.registryDecimals === decimals &&
    check.onchainDecimals === decimals
  );
}
