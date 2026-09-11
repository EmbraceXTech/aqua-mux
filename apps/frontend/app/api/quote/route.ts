import type { OwnerSession } from "@/lib/server/auth";
import {
  legacyFailure,
  legacyPost,
  type LegacyAdmission,
} from "@/lib/server/legacy-http";
import { resolveLegacyBasket } from "@/lib/server/legacy-token-resolution";
import { quoteBasket } from "@/lib/server/swap";
import type { ResolvedLegacyBasket } from "@/lib/server/legacy-token-resolution";

type QuotePostDependencies = {
  authenticate?: (request: Request) => OwnerSession;
  limiter?: LegacyAdmission;
  resolve?: (input: unknown) => Promise<ResolvedLegacyBasket>;
  quote?: typeof quoteBasket;
};

export function createQuotePost(dependencies: QuotePostDependencies = {}) {
  return async function quotePost(request: Request): Promise<Response> {
    try {
      return await legacyPost(
        request,
        async (body) => {
          const resolved = await (dependencies.resolve ?? resolveLegacyBasket)(
            body,
          );
          if (resolved.basket.mode !== "swap") {
            throw new Error("Quotes are for swaps.");
          }
          const result = await (dependencies.quote ?? quoteBasket)(
            resolved.basket,
            undefined,
            resolved.resolveToken,
          );
          return Response.json(result, {
            headers: { "Cache-Control": "private, no-store" },
          });
        },
        dependencies,
      );
    } catch (error) {
      return legacyFailure(error);
    }
  };
}

export const POST = createQuotePost();
