import { createHash } from "node:crypto";
import { decodeFunctionData, erc20Abi, type Address } from "viem";
import { AQUA, classicRouter, tokens, wrapped } from "../../config";
import type { Plan } from "../../model";
import { assertDevChain, DevWalletError } from "./config";

export function planDigest(plan: Plan) {
  return createHash("sha256").update(JSON.stringify(plan)).digest("hex");
}

// Only server compiler output can reach this check. It is defense in depth,
// not an API for authorizing client-supplied calls or arbitrary router programs.
export function validateDevPlan(plan: Plan, maker: Address, now = Date.now()) {
  assertDevChain(plan.chainId);
  if (plan.account.toLowerCase() !== maker.toLowerCase())
    throw new DevWalletError(
      "The reviewed maker does not match the local wallet.",
    );
  if (
    !Number.isSafeInteger(plan.expiresAt) ||
    plan.expiresAt <= now ||
    plan.createdAt > now ||
    plan.expiresAt - plan.createdAt > 120_000
  )
    throw new DevWalletError(
      "The review expired. Prepare and confirm a fresh plan.",
    );
  if (!plan.calls.length || plan.calls.length > 64)
    throw new DevWalletError("Invalid atomic batch size.");
  const router = classicRouter(plan.chainId).toLowerCase();
  const assets = new Set(
    tokens(plan.chainId).map((asset) => asset.address.toLowerCase()),
  );
  for (const call of plan.calls) {
    const target = call.to.toLowerCase();
    if (
      !/^0x[0-9a-fA-F]{40}$/.test(target) ||
      !/^0x(?:[0-9a-fA-F]{2})+$/.test(call.data) ||
      !/^0x[0-9a-fA-F]+$/.test(call.value) ||
      target === maker.toLowerCase()
    )
      throw new DevWalletError("Invalid call in the reviewed batch.");
    if (target === AQUA || target === router) continue;
    if (!assets.has(target))
      throw new DevWalletError("Unapproved call target.");
    if (
      target === wrapped(plan.chainId).address.toLowerCase() &&
      call.data === "0xd0e30db0"
    )
      continue;
    try {
      const decoded = decodeFunctionData({ abi: erc20Abi, data: call.data });
      if (
        decoded.functionName !== "approve" ||
        BigInt(call.value) !== 0n ||
        ![AQUA, router].includes(decoded.args[0].toLowerCase())
      )
        throw new Error();
    } catch {
      throw new DevWalletError("Unapproved token call.");
    }
  }
}
