import { handleDevWallet } from "@/lib/server/dev-wallet/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ action: string }> },
) {
  const { action } = await context.params;
  return handleDevWallet(request, action);
}
