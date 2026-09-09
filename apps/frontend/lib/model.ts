import { z } from "zod";
import { parseUnits, type Address, type Hex } from "viem";
import { token } from "./config";
export const amountSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)(\.\d+)?$/, "Enter a positive decimal amount.")
  .max(80);
export const addressSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{40}$/)
  .transform((a) => a.toLowerCase() as Address);
export const basketSchema = z
  .object({
    chainId: z.union([
      z.literal(1),
      z.literal(42161),
      z.literal(4663),
      z.literal(56),
    ]),
    mode: z.enum(["swap", "liquidity"]),
    source: addressSchema,
    amount: amountSchema,
    slippageBps: z.number().int().min(1).max(500),
    feeBps: z.number().int().min(1).max(100),
    range: z.union([z.literal(10), z.literal(20), z.literal(50), z.literal(0)]),
    legs: z
      .array(
        z.object({
          address: addressSchema,
          bps: z.number().int().min(1).max(10000),
          amount: amountSchema,
        }),
      )
      .min(2)
      .max(6),
  })
  .superRefine((v, ctx) => {
    if (new Set(v.legs.map((l) => l.address)).size !== v.legs.length)
      ctx.addIssue({
        code: "custom",
        message: "Choose different output tokens.",
      });
    if (v.legs.some((l) => l.address === v.source))
      ctx.addIssue({
        code: "custom",
        message: "Input and output tokens must differ.",
      });
    if (v.legs.reduce((s, l) => s + l.bps, 0) !== 10000)
      ctx.addIssue({
        code: "custom",
        message: "Allocations must add up to 100%.",
      });
  });
export type Basket = z.infer<typeof basketSchema>;
export type Call = { to: Address; data: Hex; value: Hex; label: string };
export type Plan = {
  chainId: number;
  account: Address;
  mode: Basket["mode"];
  calls: Call[];
  createdAt: number;
  expiresAt: number;
  strategies: { hash: Hex; pair: string; tokens: Address[] }[];
  summary: string[];
};
export function units(amount: string, decimals: number): bigint {
  amountSchema.parse(amount);
  if ((amount.split(".")[1]?.length ?? 0) > decimals)
    throw new Error(`This token supports at most ${decimals} decimal places.`);
  const n = parseUnits(amount, decimals);
  if (n <= 0n || n >= 2n ** 248n)
    throw new Error("Amount is outside the supported range.");
  return n;
}
export function splitAmount(total: bigint, weights: number[]) {
  if (
    weights.length < 2 ||
    weights.some((w) => !Number.isInteger(w) || w <= 0) ||
    weights.reduce((a, b) => a + b, 0) !== 10000
  )
    throw new Error("Allocations must add up to 100%.");
  let used = 0n;
  return weights.map((w, i) => {
    const n =
      i === weights.length - 1 ? total - used : (total * BigInt(w)) / 10000n;
    used += n;
    if (n === 0n) throw new Error("Amount is too small for this allocation.");
    return n;
  });
}
export function validateBasket(input: unknown) {
  const b = basketSchema.parse(input);
  const src = token(b.chainId, b.source);
  units(b.amount, src.decimals);
  b.legs.forEach((l) => {
    const t = token(b.chainId, l.address);
    if (b.mode === "liquidity") units(l.amount, t.decimals);
  });
  return b;
}
export function evenWeights(count: number) {
  return Array.from({ length: count }, (_, i) =>
    i === count - 1
      ? 10000 - Math.floor(10000 / count) * (count - 1)
      : Math.floor(10000 / count),
  );
}
