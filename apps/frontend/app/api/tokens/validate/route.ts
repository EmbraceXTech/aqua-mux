import { failure } from "@/lib/server/rpc";
import { validateTokenPair } from "@/lib/server/token-registry";
import { z } from "zod";

export const dynamic = "force-dynamic";

const requestSchema = z.object({
  chainId: z.union([
    z.literal(1),
    z.literal(56),
    z.literal(42161),
    z.literal(4663),
  ]),
  src: z.string(),
  dst: z.string(),
  amount: z.string().regex(/^\d+$/),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    return Response.json(await validateTokenPair(input), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
