import { z } from "zod";
import { hexSchema, idSchema } from "@/lib/managed";
import { walletAuth } from "@/lib/server/auth";
import { authBody, authFailure } from "@/lib/server/auth/http";
export const runtime = "nodejs";
const bodySchema = z.strictObject({ id: idSchema, signature: hexSchema });
export async function POST(request: Request) {
  try {
    const auth = walletAuth();
    const origin = request.headers.get("origin");
    auth.assertOrigin(origin);
    const body = bodySchema.parse(await authBody(request));
    return Response.json(await auth.verify(body.id, body.signature, origin!), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return authFailure(error);
  }
}
