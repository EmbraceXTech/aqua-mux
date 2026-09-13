import { erc20Abi, formatUnits } from "viem";
import { addressSchema } from "@/lib/model";
import { classicRouter } from "@/lib/config";
import {
  finishQuote,
  isNative,
  liveTokens,
  routeLegs,
  SWAP_CHAIN,
} from "@/lib/live-swap";
import { client, failure } from "@/lib/server/rpc";
import { swapApi } from "@/lib/server/swap";

function record(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(message);
  return value as Record<string, unknown>;
}

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 10000) throw new Error("Swap request is too large.");
    const body = record(JSON.parse(text), "Invalid swap request.");
    const account = addressSchema.parse(body.account);
    const { request: swap, legs } = routeLegs(body.request);
    const c = client(SWAP_CHAIN);
    if ((await c.getChainId()) !== SWAP_CHAIN)
      throw new Error("RPC network does not match Arbitrum.");
    const block = await c.getBlockNumber();
    const started = Date.now();
    const routed = await Promise.all(
      legs.map(async (leg) => {
        const result = record(
          await swapApi("swap", SWAP_CHAIN, {
            src: liveTokens.find((token) => token.id === leg.input)!.address,
            dst: liveTokens.find((token) => token.id === leg.output)!.address,
            amount: leg.amount,
            from: account,
            receiver: account,
            slippage: String(swap.slippageBps / 100),
            allowPartialFill: "false",
          }),
          "1inch returned an invalid swap response.",
        );
        if (
          typeof result.dstAmount !== "string" ||
          !/^\d+$/.test(result.dstAmount)
        )
          throw new Error("1inch returned an invalid output amount.");
        const tx = record(result.tx, "1inch returned no transaction.");
        const to = addressSchema.parse(tx.to);
        if (to.toLowerCase() !== classicRouter(SWAP_CHAIN).toLowerCase())
          throw new Error("1inch returned an unexpected router.");
        if (
          typeof tx.from !== "string" ||
          tx.from.toLowerCase() !== account.toLowerCase() ||
          typeof tx.data !== "string" ||
          !/^0x[\da-fA-F]+$/.test(tx.data) ||
          typeof tx.value !== "string" ||
          !/^(0|[1-9]\d*)$/.test(tx.value)
        )
          throw new Error("1inch returned an invalid transaction.");
        if (
          BigInt(tx.value) !== (isNative(leg.input) ? BigInt(leg.amount) : 0n)
        )
          throw new Error(
            "1inch transaction value does not match the requested input.",
          );
        if (
          result.stateOverrides &&
          Object.keys(record(result.stateOverrides, "")).length
        )
          throw new Error(
            "This 1inch route needs unsupported simulation overrides. Refresh the quote.",
          );
        return {
          amountOut: BigInt(result.dstAmount),
          transaction: { to, data: tx.data, value: tx.value },
        };
      }),
    );
    const quote = finishQuote(
      swap,
      legs,
      routed.map((item) => item.amountOut),
      block,
      started,
    );
    if (quote.expiresAt <= Date.now())
      throw new Error("Quote took too long. Please retry.");
    return Response.json(
      { ...quote, transactions: routed.map((item) => item.transaction) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}

export async function GET(request: Request) {
  try {
    const account = addressSchema.parse(
      new URL(request.url).searchParams.get("account"),
    );
    const requestedTokens = new URL(request.url).searchParams
      .get("tokens")
      ?.split(",")
      .filter(Boolean);
    if (!requestedTokens?.length || requestedTokens.length > 10)
      throw new Error("Choose one to ten tokens.");
    const selected = new Set(requestedTokens);
    const tokenList = liveTokens.filter((token) => selected.has(token.id));
    if (tokenList.length !== selected.size)
      throw new Error("A selected token is not in the Arbitrum token list.");
    const c = client(SWAP_CHAIN);
    if ((await c.getChainId()) !== SWAP_CHAIN)
      throw new Error("RPC network does not match Arbitrum.");
    const router = classicRouter(SWAP_CHAIN);
    const entries = await Promise.all(
      tokenList.map(async (t) => {
        try {
          const balance = isNative(t.id)
            ? await c.getBalance({ address: account })
            : await c.readContract({
                address: t.address,
                abi: erc20Abi,
                functionName: "balanceOf",
                args: [account],
              });
          const allowance = isNative(t.id)
            ? 0n
            : await c.readContract({
                address: t.address,
                abi: erc20Abi,
                functionName: "allowance",
                args: [account, router],
              });
          return [
            t.id,
            {
              balance: formatUnits(balance, t.decimals),
              allowance: String(allowance),
            },
          ];
        } catch {
          return [t.id, null];
        }
      }),
    );
    return Response.json(Object.fromEntries(entries), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return failure(e);
  }
}
