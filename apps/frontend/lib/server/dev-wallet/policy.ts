import { createHash } from "node:crypto";
import { decodeFunctionData, erc20Abi, parseAbi, type Address } from "viem";
import { AQUA, SWAP_VM, classicRouter, wrapped } from "../../config";
import type { Plan } from "../../model";
import { canonicalJson } from "../../managed";
import { assertDevChain, DevWalletError } from "./config";
import type { DevBatchPlan } from "./batch";
import { devPlanAssets } from "./assets";
import { validateDevRoutes } from "./routes";

const aquaAbi = parseAbi([
  "function ship(address app,bytes strategy,address[] tokens,uint256[] amounts) returns(bytes32)",
  "function dock(address app,bytes32 strategyHash,address[] tokens)",
]);
const wrapAbi = parseAbi(["function withdraw(uint256 amount)"]);

export function planDigest(plan: Plan) {
  return createHash("sha256").update(canonicalJson(plan)).digest("hex");
}

export function validateBatchEnvelope(
  plan: Plan,
  maker: Address,
  now = Date.now(),
) {
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
  for (const call of plan.calls) {
    const target = call.to.toLowerCase();
    if (
      !/^0x[0-9a-fA-F]{40}$/.test(target) ||
      !/^0x(?:[0-9a-fA-F]{2})+$/.test(call.data) ||
      !/^0x[0-9a-fA-F]+$/.test(call.value) ||
      target === maker.toLowerCase()
    )
      throw new DevWalletError("Invalid call in the reviewed batch.");
  }
}

// Only trusted server compiler output can reach this authority check.
export function validateDevPlan(
  plan: DevBatchPlan,
  maker: Address,
  now = Date.now(),
) {
  validateBatchEnvelope(plan, maker, now);
  validateDevRoutes(plan, now);
  const router = classicRouter(plan.chainId).toLowerCase();
  const assets = new Set(
    devPlanAssets(plan).map((asset) => asset.address.toLowerCase()),
  );
  for (const call of plan.calls) {
    const target = call.to.toLowerCase();
    if (target === AQUA) {
      try {
        const decoded = decodeFunctionData({ abi: aquaAbi, data: call.data });
        if (
          decoded.args[0].toLowerCase() !== SWAP_VM ||
          BigInt(call.value) !== 0n
        )
          throw new Error();
      } catch {
        throw new DevWalletError("Unapproved Aqua call.");
      }
      continue;
    }
    if (target === router) {
      // validateDevRoutes has already checked the complete call and its authority.
      continue;
    }
    if (!assets.has(target))
      throw new DevWalletError("Unapproved call target.");
    if (
      target === wrapped(plan.chainId).address.toLowerCase() &&
      call.data === "0xd0e30db0"
    )
      continue;
    if (
      target === wrapped(plan.chainId).address.toLowerCase() &&
      call.data.startsWith("0x2e1a7d4d")
    ) {
      try {
        const { args } = decodeFunctionData({ abi: wrapAbi, data: call.data });
        if (BigInt(call.value) !== 0n || args[0] <= 0n) throw new Error();
      } catch {
        throw new DevWalletError("Invalid unwrap call.");
      }
      continue;
    }
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
