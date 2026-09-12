import { requireOwner } from "@/lib/server/auth";
import { authFailure } from "@/lib/server/auth/http";
import { openManagedStore } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { owner } = requireOwner(request);
    return Response.json(openManagedStore().exportOwner(owner), {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Disposition":
          'attachment; filename="aquamux-owner-export.json"',
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return authFailure(error);
  }
}
