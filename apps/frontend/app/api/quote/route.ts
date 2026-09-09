import { validateBasket } from "@/lib/model";
import { quoteBasket } from "@/lib/server/swap";
import { failure } from "@/lib/server/rpc";
export async function POST(request: Request) {
  try {
    const b = validateBasket(await request.json());
    if (b.mode !== "swap") throw new Error("Quotes are for swaps.");
    return Response.json(await quoteBasket(b));
  } catch (e) {
    return failure(e);
  }
}
