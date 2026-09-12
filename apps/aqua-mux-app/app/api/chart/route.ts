import { chartQuerySchema } from "@/lib/model";
import { currentPrice, priceHistory } from "@/lib/server/charts";
import { failure } from "@/lib/server/rpc";
export async function POST(request: Request) {
  try {
    const q = chartQuerySchema.parse(await request.json());
    const [data, marketPrice] = await Promise.all([
      priceHistory(q.chainId, q.token0, q.token1, q.period),
      currentPrice(q.chainId, q.token0, q.token1),
    ]);
    return Response.json({ data, marketPrice });
  } catch (e) {
    return failure(e);
  }
}
