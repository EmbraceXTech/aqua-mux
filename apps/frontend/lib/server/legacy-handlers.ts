import { z } from "zod";
import { addressSchema } from "../model";
import type { OwnerSession } from "./auth";
import { legacyFailure, legacyPost, type LegacyAdmission } from "./legacy-http";
import {
  resolveLegacyBasket,
  type ResolvedLegacyBasket,
} from "./legacy-token-resolution";
import { buildPlan } from "./plan";
import { quoteBasket } from "./swap";

const planRequestSchema = z
  .object({ basket: z.unknown(), account: addressSchema })
  .strict();

type CommonDependencies = {
  authenticate?: (request: Request) => OwnerSession;
  limiter?: LegacyAdmission;
};

type QuotePostDependencies = CommonDependencies & {
  resolve?: (input: unknown) => Promise<ResolvedLegacyBasket>;
  quote?: typeof quoteBasket;
};

type PlanPostDependencies = CommonDependencies & {
  build?: typeof buildPlan;
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

export function createPlanPost(dependencies: PlanPostDependencies = {}) {
  return async function planPost(request: Request): Promise<Response> {
    try {
      return await legacyPost(
        request,
        async (body, session) => {
          const input = planRequestSchema.parse(body);
          if (input.account !== session.owner) {
            throw new Error(
              "Plan account must match the authenticated wallet.",
            );
          }
          const plan = await (dependencies.build ?? buildPlan)(
            input.basket,
            session.owner,
          );
          return Response.json(plan, {
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

export const quotePost = createQuotePost();
export const planPost = createPlanPost();
