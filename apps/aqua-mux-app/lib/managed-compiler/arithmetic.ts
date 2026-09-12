/** All quantities are raw token units. Never pass floating point token amounts. */
export function uint(value: string, bits = 256): bigint {
  if (!/^(0|[1-9]\d*)$/.test(value) || value.length > 78)
    throw new Error("Expected a canonical unsigned integer amount.");
  const result = BigInt(value);
  if (result >= 1n << BigInt(bits))
    throw new Error(`Amount exceeds uint${bits}.`);
  return result;
}

export function ceilDiv(numerator: bigint, denominator: bigint): bigint {
  if (numerator < 0n || denominator <= 0n) throw new Error("Invalid division.");
  return (numerator + denominator - 1n) / denominator;
}

export function minimumOutput(expected: bigint, slippageBps: number): bigint {
  if (
    expected <= 0n ||
    !Number.isInteger(slippageBps) ||
    slippageBps < 0 ||
    slippageBps >= 10000
  )
    throw new Error("Invalid output or slippage.");
  const minimum = (expected * BigInt(10000 - slippageBps)) / 10000n;
  if (!minimum) throw new Error("Minimum output rounds to zero.");
  return minimum;
}

/** Allocate the remainder in input order, conserving every raw unit. */
export function allocate(total: bigint, weights: number[]): bigint[] {
  if (
    total < 0n ||
    !weights.length ||
    weights.some((w) => !Number.isSafeInteger(w) || w < 0) ||
    weights.reduce((a, b) => a + b, 0) !== 10000
  )
    throw new Error("Allocation weights must sum to 10000.");
  const amounts = weights.map((w) => (total * BigInt(w)) / 10000n);
  let remainder = total - amounts.reduce((a, b) => a + b, 0n);
  for (let i = 0; remainder > 0n; i = (i + 1) % weights.length)
    if (weights[i]) {
      amounts[i]++;
      remainder--;
    }
  return amounts;
}
