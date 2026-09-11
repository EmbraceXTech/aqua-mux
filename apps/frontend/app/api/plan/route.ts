import { z } from "zod";
import { addressSchema } from "@/lib/model";
import type { OwnerSession } from "@/lib/server/auth";
import {
  legacyFailure,
  legacyPost,
  type LegacyAdmission,
} from "@/lib/server/legacy-http";
import { buildPlan } from "@/lib/server/plan";

const requestSchema = z
  .object({ basket: z.unknown(), account: addressSchema })
  .strict();

type PlanPostDependencies = {
  authenticate?: (request: Request) => OwnerSession;
  limiter?: LegacyAdmission;
  build?: typeof buildPlan;
};

export function createPlanPost(dependencies: PlanPostDependencies = {}) {
  return async function planPost(request: Request): Promise<Response> {
    try {
      return await legacyPost(
        request,
        async (body, session) => {
          const input = requestSchema.parse(body);
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

export const POST = createPlanPost();
