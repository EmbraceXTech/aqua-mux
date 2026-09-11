import { classicRouter } from "../../config";
import {
  routePolicyTargets,
  verifiedRouteCalls,
} from "../route-policy/route-calls";
import { validateCompiledRoute } from "../route-policy/validate";
import { verifyRouteProvenance } from "../route-policy/provenance";
import type { DevBatchPlan } from "./batch";
import { DevWalletError } from "./config";
import { devPlanAssets } from "./assets";

/** Bind the server's independent request, quote, actual batch calls and displayed receipts. */
export function validateDevRoutes(plan: DevBatchPlan, now = Date.now()) {
  const covered = new Set<number>();
  const targets = new Set([
    ...routePolicyTargets(plan.chainId),
    classicRouter(plan.chainId),
  ]);
  const records = plan.verifiedRoutes ?? [];
  const routeIndexes = plan.calls.flatMap((call, index) =>
    targets.has(call.to.toLowerCase() as typeof call.to) ? [index] : [],
  );
  if (!routeIndexes.length && !records.length) return covered;
  if (!records.length)
    throw new DevWalletError(
      "Local wallet swaps require a verified executor policy and exact route records.",
    );
  let cursor = 0;
  const minimums = new Map<string, bigint>();
  const assets = devPlanAssets(plan);
  for (const record of records) {
    const { request, route } = record;
    if (
      ![request.source, request.destination].every((address) =>
        assets.some((asset) => asset.address === address.toLowerCase()),
      )
    )
      throw new DevWalletError(
        "A verified route lacks reviewed token metadata.",
      );
    if (
      request.chainId !== plan.chainId ||
      request.maker.toLowerCase() !== plan.account.toLowerCase() ||
      route.expiresAt < plan.expiresAt
    )
      throw new DevWalletError(
        "Verified route does not match the reviewed maker, chain or expiry.",
      );
    validateCompiledRoute(request, route, now);
    const expected = verifiedRouteCalls(route);
    const matches = (start: number) =>
      expected.every((call, offset) => {
        const actual = plan.calls[start + offset];
        return (
          actual &&
          actual.to.toLowerCase() === call.to.toLowerCase() &&
          actual.data.toLowerCase() === call.data.toLowerCase() &&
          BigInt(actual.value) === BigInt(call.value)
        );
      });
    let start = cursor;
    while (start < plan.calls.length && !matches(start)) start++;
    if (start === plan.calls.length)
      throw new DevWalletError(
        "The batch calls differ from their verified route.",
      );
    for (let offset = 0; offset < expected.length; offset++)
      covered.add(start + offset);
    cursor = start + expected.length;
    const destination = request.destination.toLowerCase();
    minimums.set(
      destination,
      (minimums.get(destination) ?? 0n) + BigInt(route.minimumAmountOut),
    );
  }
  if (routeIndexes.some((index) => !covered.has(index)))
    throw new DevWalletError("An unverified extra route call is present.");
  const receipts = plan.minimumReceipts;
  if (
    !receipts ||
    receipts.length !== minimums.size ||
    new Set(receipts.map((receipt) => receipt.token.address.toLowerCase()))
      .size !== receipts.length
  )
    throw new DevWalletError(
      "Reviewed minimum receipts do not match the verified routes.",
    );
  for (const receipt of receipts) {
    const asset = assets.find(
      (asset) => asset.address === receipt.token.address.toLowerCase(),
    );
    if (!asset || asset.decimals !== receipt.token.decimals)
      throw new DevWalletError(
        "Displayed receipt decimals differ from the reviewed token metadata.",
      );
    if (
      minimums.get(receipt.token.address.toLowerCase()) !==
      BigInt(receipt.amount)
    )
      throw new DevWalletError(
        "Reviewed minimum receipts do not match the encoded output minimums.",
      );
  }
  return covered;
}

export async function verifyDevRoutes(plan: DevBatchPlan) {
  validateDevRoutes(plan);
  for (const { route } of plan.verifiedRoutes ?? [])
    await verifyRouteProvenance(route);
}
