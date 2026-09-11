import { randomBytes } from "node:crypto";
import type { Hex } from "viem";
import { NATIVE, classicRouter } from "../../config";
import { strategyConfigSchema } from "../../managed/config";
import {
  lifecyclePlanSchema,
  type LifecyclePlan,
} from "../../managed/lifecycle";
import type { Token } from "../../managed/primitives";
import { uint } from "../../managed-compiler/arithmetic";
import { compileLP } from "../../managed-compiler/lp";
import type { Call } from "../../model";
import { approvalBuilder, dockCall } from "./calls";
import { digest } from "./digest";
import { validateSnapshot } from "./guards";
import { fundInventory } from "./funding";
import { convertInventory } from "./conversion";
import { Inventory } from "./inventory";
import { validateRoute } from "./routes";
import type { LifecycleDependencies, LifecycleRequest } from "./types";
export type * from "./types";
export { digest } from "./digest";
export { reconcileResiduals } from "./inventory";

export async function buildLifecyclePlan(
  input: LifecycleRequest,
  deps: LifecycleDependencies,
): Promise<LifecyclePlan> {
  const request = {
    ...input,
    config: strategyConfigSchema.parse(input.config),
  };
  const now = deps.now ?? Date.now,
    createdAt = now();
  const snapshot = await deps.snapshot(request);
  validateSnapshot(request, snapshot, now());
  const inventory = new Inventory(request.inventory),
    receipts = new Inventory([]);
  const calls: Call[] = [],
    approve = approvalBuilder(snapshot, calls);
  let expiresAt =
    request.kind === "fund-and-open" || request.kind === "replace"
      ? Math.min(request.expiresAt, request.config.policy.expiresAt.value)
      : request.expiresAt;
  expiresAt = Math.min(
    expiresAt,
    snapshot.observedAt +
      Math.min(30000, request.config.policy.maxReferenceAgeMs.value),
  );
  const previous = request.previous ?? [];
  calls.push(...previous.map(dockCall));
  async function swap(
    source: Token,
    destination: Token,
    amount: string,
    minimum: string,
  ) {
    if (source.address === destination.address)
      throw new Error("Cannot swap a token to itself.");
    const amountIn = uint(amount);
    if (!amountIn) throw new Error("Swap amount must be positive.");
    inventory.debit(source, amountIn);
    const routeRequest = {
      chainId: request.config.chainId,
      maker: request.config.maker,
      source,
      destination,
      amountIn: amount,
      minimumAmountOut: minimum,
      slippageBps: request.config.policy.maxSlippageBps.value,
    };
    const route = await deps.quote(routeRequest);
    validateRoute(routeRequest, route, now());
    if (
      !request.config.policy.allowedRoutes.value.includes(
        classicRouter(request.config.chainId),
      )
    )
      throw new Error("Swap router is outside the reviewed policy.");
    if (!snapshot.contracts.some((c) => c.address === route.call.to))
      throw new Error("Swap deployment provenance is unavailable.");
    if (source.address !== NATIVE)
      approve(source.address, route.spender, amountIn);
    calls.push(route.call);
    if (source.address !== NATIVE)
      approve.consume(source.address, route.spender, amountIn);
    const output = uint(route.minimumAmountOut);
    inventory.credit(destination, output);
    receipts.credit(destination, output);
    expiresAt = Math.min(expiresAt, route.expiresAt);
  }
  const registrations: LifecyclePlan["registrations"] = [];
  if (request.kind === "fund-and-open" || request.kind === "replace") {
    if (request.config.family !== "lp")
      throw new Error(
        "MM is unavailable: no verified deployed directional encoding.",
      );
    await fundInventory(
      { ...request, config: request.config },
      inventory,
      calls,
      approve,
      swap,
    );
    const compiled = compileLP(
      request.config,
      deps.nonce?.() ?? `0x${randomBytes(32).toString("hex")}`,
      now(),
    );
    if (request.kind === "replace" && previous.length !== compiled.length)
      throw new Error("Replacement requires one old strategy per replacement.");
    for (const [i, strategy] of compiled.entries()) {
      if (previous.some((old) => old.hash === strategy.hash))
        throw new Error("Replacement must have a fresh hash.");
      calls.push(strategy.call);
      registrations.push({
        hash: strategy.hash,
        app: strategy.app,
        tokens: strategy.tokens,
        amounts: strategy.amounts,
        program: strategy.program,
        strategy: strategy.strategy,
        ...(previous[i] ? { replaces: previous[i].hash } : {}),
      });
      if (strategy.pair.programExpiresAt)
        expiresAt = Math.min(expiresAt, strategy.pair.programExpiresAt);
    }
  }
  if (request.kind === "close-and-convert")
    await convertInventory(request, inventory, receipts, calls, swap);
  const zeroHash = `0x${"0".repeat(64)}` as Hex;
  let plan = lifecyclePlanSchema.parse({
    version: 1,
    id: request.id,
    groupId: request.groupId,
    owner: request.owner,
    chainId: request.config.chainId,
    maker: request.config.maker,
    kind: request.kind,
    configDigest: digest(request.config),
    policyDigest: digest(request.config.policy),
    snapshotDigest: digest(snapshot),
    runGeneration: request.runGeneration,
    calls,
    inventoryBefore: new Inventory(request.inventory).values(),
    conservativeInventoryAfter: inventory.values(),
    registrations,
    retirements: previous,
    gasReserveWei: String(uint(request.gasReserveWei)),
    estimatedGasWei: "0",
    simulation: {
      blockNumber: snapshot.blockNumber,
      blockHash: zeroHash,
      simulatedAt: createdAt,
      callsDigest: digest(calls),
    },
    expectedEffects: [
      "Execute the complete batch atomically.",
      `${previous.length} strategies retire; ${registrations.length} strategies register.`,
      "Real inventory is counted once; virtual strategy claims compete for this backing.",
      "Excess swap receipts remain in the maker wallet and require post-transaction reconciliation.",
    ],
    minimumReceipts: receipts.values(),
    createdAt,
    expiresAt,
    atomicRequired: true,
    authorization: { kind: "unconfirmed" },
  });
  const simulation = await deps.simulate(plan);
  if (
    !simulation.success ||
    !simulation.atomic ||
    simulation.callsDigest !== digest(plan.calls) ||
    simulation.simulatedAt < createdAt ||
    simulation.simulatedAt > now() ||
    now() - simulation.simulatedAt > 30000 ||
    now() >= expiresAt
  )
    throw new Error("A fresh successful whole-batch simulation is required.");
  const finalSnapshot = await deps.snapshot(request);
  validateSnapshot(request, finalSnapshot, now());
  if (
    now() >= expiresAt ||
    uint(finalSnapshot.blockNumber) < uint(simulation.blockNumber)
  )
    throw new Error("Snapshot expired or predates the completed simulation.");
  const nativeValue = calls.reduce((sum, c) => sum + BigInt(c.value), 0n);
  if (
    uint(finalSnapshot.nativeBalance) <
    nativeValue + uint(request.gasReserveWei) + uint(simulation.estimatedGasWei)
  )
    throw new Error("Insufficient native gas reserve after execution costs.");
  plan = lifecyclePlanSchema.parse({
    ...plan,
    snapshotDigest: digest(finalSnapshot),
    estimatedGasWei: simulation.estimatedGasWei,
    simulation: {
      blockNumber: simulation.blockNumber,
      blockHash: simulation.blockHash,
      simulatedAt: simulation.simulatedAt,
      callsDigest: simulation.callsDigest,
    },
  });
  return plan;
}
