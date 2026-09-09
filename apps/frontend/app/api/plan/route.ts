import { addressSchema } from "@/lib/model";
import { buildPlan } from "@/lib/server/plan";
import { failure } from "@/lib/server/rpc";
export async function POST(request: Request) {
  try {
    const { basket, account } = await request.json();
    return Response.json(await buildPlan(basket, addressSchema.parse(account)));
  } catch (e) {
    return failure(e);
  }
}
