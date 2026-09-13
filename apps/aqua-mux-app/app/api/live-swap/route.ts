import { erc20Abi, formatUnits } from "viem";
import { addressSchema } from "@/lib/model";
import { client, failure } from "@/lib/server/rpc";
import {
  finishQuote,
  liveTokens,
  poolAddress,
  quoterAbi,
  routeLegs,
  SWAP_CHAIN,
  V3_QUOTER,
  V3_ROUTER,
} from "@/lib/live-swap";

export async function POST(request: Request) {
  try {
    const text = await request.text();
    if (text.length > 10000) throw new Error("Swap request is too large.");
    const { request: swap, legs } = routeLegs(JSON.parse(text));
    const c = client(SWAP_CHAIN);
    if ((await c.getChainId()) !== SWAP_CHAIN)
      throw new Error("RPC network does not match Arbitrum.");
    const block = await c.getBlockNumber();
    const started = Date.now();
    const results = await Promise.all(
      legs.map(async (l) => {
        try {
          const { result } = await c.simulateContract({
            address: V3_QUOTER,
            abi: quoterAbi,
            functionName:
              swap.draft.exact === "input"
                ? "quoteExactInputSingle"
                : "quoteExactOutputSingle",
            args: [
              poolAddress(l.input),
              poolAddress(l.output),
              l.fee,
              BigInt(l.amount),
              0n,
            ],
            blockNumber: block,
          });
          return result;
        } catch {
          throw new Error(
            `Cannot quote ${l.input}/${l.output} at ${l.fee / 10000}%. Try another pool fee or amount. Direct Uniswap v3 pools only.`,
          );
        }
      }),
    );
    const quote = finishQuote(swap, legs, results, block, started);
    if (quote.expiresAt <= Date.now())
      throw new Error("Quote took too long. Please retry.");
    return Response.json(quote, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}

export async function GET(request: Request) {
  try {
    const account = addressSchema.parse(
      new URL(request.url).searchParams.get("account"),
    );
    const c = client(SWAP_CHAIN);
    if ((await c.getChainId()) !== SWAP_CHAIN)
      throw new Error("RPC network does not match Arbitrum.");
    const entries = await Promise.all(
      liveTokens.map(async (t) => {
        try {
          const balance =
            t.symbol === "ETH"
              ? await c.getBalance({ address: account })
              : await c.readContract({
                  address: t.address,
                  abi: erc20Abi,
                  functionName: "balanceOf",
                  args: [account],
                });
          const allowance =
            t.symbol === "ETH"
              ? 0n
              : await c.readContract({
                  address: t.address,
                  abi: erc20Abi,
                  functionName: "allowance",
                  args: [account, V3_ROUTER],
                });
          return [
            t.symbol,
            {
              balance: formatUnits(balance, t.decimals),
              allowance: String(allowance),
            },
          ];
        } catch {
          return [t.symbol, null];
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
