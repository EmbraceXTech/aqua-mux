import { keccak256, stringToHex } from "viem";
import type { LifecyclePlan } from "./lifecycle";

/** Stable JSON binding, rejecting non-JSON values rather than silently dropping them. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number" && Number.isSafeInteger(value))
    return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (
    typeof value === "object" &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  )
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`,
      )
      .join(",")}}`;
  throw new Error(
    "Digest input must contain only JSON values and safe integers.",
  );
}
export function canonicalDigest(value: unknown) {
  return keccak256(stringToHex(canonicalJson(value)));
}
export function planDigest(plan: LifecyclePlan) {
  const { authorization: _authorization, ...unsigned } = plan;
  void _authorization;
  return canonicalDigest(unsigned);
}
