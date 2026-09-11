import { requireOwner, walletAuth } from "@/lib/server/auth";
import { authFailure } from "@/lib/server/auth/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOwner(request);
    walletAuth().revoke(request.headers.get("authorization")!.slice(7));
    return Response.json(
      { revoked: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return authFailure(error);
  }
}
