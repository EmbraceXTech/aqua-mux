import { developmentWalletAvailability } from "@/lib/server/dev-wallet/config";
import { handleDevWallet } from "@/lib/server/dev-wallet/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  if (action !== "status")
    return Response.json(
      { error: "Unknown local wallet action." },
      { status: 404 },
    );
  return Response.json(developmentWalletAvailability(), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  return handleDevWallet(request, action);
}
