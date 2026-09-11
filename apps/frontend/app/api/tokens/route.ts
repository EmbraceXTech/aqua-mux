import { failure } from "@/lib/server/rpc";
import { getTokenRegistry } from "@/lib/server/token-registry";
import {
  searchTokenRegistry,
  tokenRegistryChainId,
  type TokenSearchResponse,
} from "@/lib/token-registry";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const parameters = new URL(request.url).searchParams;
    const chainId = tokenRegistryChainId(parameters.get("chainId"));
    const query = parameters.get("q") ?? "";
    if (query.length > 80) throw new Error("Token search is too long.");
    const limitValue = parameters.get("limit") ?? "50";
    if (!/^\d{1,3}$/.test(limitValue)) {
      throw new Error("Token search limit is invalid.");
    }
    if (Number(limitValue) < 1) {
      throw new Error("Token search limit must be positive.");
    }
    const registry = await getTokenRegistry(chainId);
    const results = searchTokenRegistry(
      registry.tokens,
      query,
      Number(limitValue),
    );
    const response: TokenSearchResponse = {
      chainId,
      source: registry.source,
      fetchedAt: registry.fetchedAt,
      stale: registry.stale,
      degraded: registry.degraded,
      rejected: registry.rejected,
      total: results.total,
      items: results.items,
    };
    return Response.json(response, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return failure(error);
  }
}
