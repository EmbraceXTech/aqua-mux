import { z } from "zod";
import { addressSchema, integerAmountSchema } from "../../managed";
import type { TokenRouteCheck } from "../../token-registry";
import { quoteVerifiedRoute } from "../route-policy";
import { ensureManagedTokens } from "./tokens";

const inputSchema = z.strictObject({
  chainId: z.number().int().positive(),
  src: addressSchema,
  dst: addressSchema,
  amount: integerAmountSchema,
});

/** Metadata checks and policy-verified liquidity are separate requirements. */
export async function checkManagedFundingRoute(
  owner: string,
  raw: unknown,
): Promise<TokenRouteCheck> {
  const input = inputSchema.parse(raw);
  await ensureManagedTokens(input.chainId, [input.src, input.dst]);
  const checkedAt = new Date().toISOString();
  try {
    const quote = await quoteVerifiedRoute({
      chainId: input.chainId,
      maker: addressSchema.parse(owner),
      source: input.src,
      destination: input.dst,
      amountIn: input.amount,
      minimumAmountOut: "1",
      slippageBps: 50,
    });
    return {
      status: "available",
      checkedAt,
      amountIn: input.amount,
      amountOut: quote.amountOut,
    };
  } catch {
    return {
      status: "unavailable",
      reason: "no_route",
      checkedAt,
      amountIn: input.amount,
    };
  }
}
