import { classicRouter } from "../../config";
import { validateCompiledRoute } from "../route-policy/validate";
import { verifyRouteProvenance } from "../route-policy/provenance";
import type { DevBatchPlan } from "./batch";
import { DevWalletError } from "./config";
import { devPlanAssets } from "./assets";

/** Bind the server's independent request, quote, actual batch calls and displayed receipts. */
export function validateDevRoutes(plan: DevBatchPlan, now = Date.now()) {
  const calls = plan.calls.filter(
    (call) => call.to.toLowerCase() === classicRouter(plan.chainId),
  );
  const records = plan.verifiedRoutes ?? [];
  if (!calls.length && !records.length) return;
  if (!records.length || calls.length !== records.length)
    throw new DevWalletError(
      "Local wallet swaps require a verified executor policy and exact route records.",
    );
  const minimums = new Map<string, bigint>();
  const assets = devPlanAssets(plan);
  for (const [index, record] of records.entries()) {
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
    const call = calls[index];
    if (
      call.to.toLowerCase() !== route.call.to.toLowerCase() ||
      call.data.toLowerCase() !== route.call.data.toLowerCase() ||
      BigInt(call.value) !== BigInt(route.call.value)
    )
      throw new DevWalletError(
        "The batch call differs from its verified route.",
      );
    const destination = request.destination.toLowerCase();
    minimums.set(
      destination,
      (minimums.get(destination) ?? 0n) + BigInt(route.minimumAmountOut),
    );
  }
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
}

export async function verifyDevRoutes(plan: DevBatchPlan) {
  validateDevRoutes(plan);
  for (const { route } of plan.verifiedRoutes ?? [])
    await verifyRouteProvenance(route);
}
