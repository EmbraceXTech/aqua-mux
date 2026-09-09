import { type Address } from "viem";
import { type Basket, splitAmount, units } from "../model";
import { token, classicRouter } from "../config";
export async function swapApi(
  path: string,
  chainId: number,
  params: Record<string, string>,
) {
  const key = process.env.ONEINCH_API_KEY;
  if (!key)
    throw new Error(
      "Live swap quotes need a 1inch API key. Add ONEINCH_API_KEY to AquaMux .env.",
    );
  const r = await fetch(
    `https://api.1inch.com/swap/v6.1/${chainId}/${path}?${new URLSearchParams(params)}`,
    {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    },
  );
  if (!r.ok)
    throw new Error(
      `1inch could not provide a route (${r.status}). Try another pair or amount.`,
    );
  return r.json();
}
export async function quoteBasket(b: Basket, account?: Address) {
  const amounts = splitAmount(
    units(b.amount, token(b.chainId, b.source).decimals),
    b.legs.map((l) => l.bps),
  );
  const startedAt = Date.now();
  const legs = [];
  // Sequential requests stay within basic API rate limits.
  for (let i = 0; i < b.legs.length; i++) {
    if (i) await new Promise((r) => setTimeout(r, 1100));
    const leg = b.legs[i];
    const q = await swapApi(account ? "swap" : "quote", b.chainId, {
      src: b.source,
      dst: leg.address,
      amount: amounts[i].toString(),
      ...(account
        ? {
            from: account,
            receiver: account,
            slippage: String(b.slippageBps / 100),
            disableEstimate: "true",
            allowPartialFill: "false",
          }
        : {}),
    });
    if (!/^\d+$/.test(String(q.dstAmount)) || BigInt(q.dstAmount) <= 0n)
      throw new Error("1inch returned an invalid output amount.");
    const min = (BigInt(q.dstAmount) * BigInt(10000 - b.slippageBps)) / 10000n;
    if (min <= 0n)
      throw new Error(
        "Minimum output rounds to zero. Increase the input amount.",
      );
    if (
      account &&
      (!q.tx ||
        String(q.tx.to).toLowerCase() !== classicRouter(b.chainId) ||
        !/^0x[0-9a-fA-F]+$/.test(q.tx.data) ||
        String(q.tx.from).toLowerCase() !== account.toLowerCase())
    )
      throw new Error("1inch returned an unexpected transaction.");
    legs.push({
      address: leg.address,
      amountIn: amounts[i].toString(),
      amountOut: String(q.dstAmount),
      minAmountOut: min.toString(),
      tx: account ? q.tx : undefined,
    });
  }
  return { legs, quotedAt: startedAt, expiresAt: startedAt + 30000 };
}
