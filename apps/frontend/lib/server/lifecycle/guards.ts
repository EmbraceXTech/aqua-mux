import { AQUA, NATIVE, SWAP_VM, token } from "../../config";
import { uint } from "../../managed-compiler/arithmetic";
import type { Token } from "../../managed/primitives";
import { Inventory } from "./inventory";
import type { LifecycleRequest, LifecycleSnapshot } from "./types";

export function validateSnapshot(
  request: LifecycleRequest,
  snapshot: LifecycleSnapshot,
  now: number,
) {
  if (
    snapshot.chainId !== request.config.chainId ||
    snapshot.maker !== request.config.maker
  )
    throw new Error("Snapshot maker or chain mismatch.");
  const maxAge = Math.min(30000, request.config.policy.maxReferenceAgeMs.value);
  if (snapshot.observedAt > now || now - snapshot.observedAt > maxAge)
    throw new Error("Wallet snapshot is stale.");
  if (
    !Number.isSafeInteger(request.expiresAt) ||
    request.expiresAt <= now ||
    request.expiresAt > now + 120000
  )
    throw new Error("Plan expiry must be within two minutes.");
  if (uint(request.gasReserveWei) === 0n)
    throw new Error("A positive native recovery reserve is required.");
  if (
    (request.kind === "fund-and-open" || request.kind === "replace") &&
    request.config.policy.expiresAt.value <= now
  )
    throw new Error("Management policy has expired.");
  const validateToken = (t: Token) => {
    if (token(request.config.chainId, t.address).decimals !== t.decimals)
      throw new Error("Token metadata mismatch.");
    if (!request.config.policy.allowedAssets.value.includes(t.address))
      throw new Error("Token is outside the reviewed permitted assets.");
  };
  if (request.funding) {
    validateToken(request.funding.token);
    request.funding.purchases.forEach((p) => validateToken(p.token));
  }
  if (request.conversion) {
    validateToken(request.conversion.targetToken);
    request.conversion.amounts.forEach((p) => validateToken(p.token));
  }
  for (const address of [AQUA, SWAP_VM])
    if (
      !snapshot.contracts.some(
        (c) => c.address === address && /^0x[0-9a-f]{64}$/.test(c.codeHash),
      )
    )
      throw new Error("Required deployment provenance is unavailable.");
  const live = new Inventory(snapshot.balances),
    selected = new Inventory(request.inventory);
  for (const item of selected.values()) {
    if (
      token(request.config.chainId, item.token.address).decimals !==
      item.token.decimals
    )
      throw new Error("Selected inventory metadata mismatch.");
    const balance =
      item.token.address === NATIVE
        ? uint(snapshot.nativeBalance)
        : live.amount(item.token);
    if (BigInt(item.amount) > balance)
      throw new Error(
        "Selected inventory exceeds current real wallet balance.",
      );
  }
  const previous = request.previous ?? [];
  if (new Set(previous.map((s) => s.hash)).size !== previous.length)
    throw new Error("Duplicate retirement.");
  if (request.kind === "fund-and-open" && previous.length)
    throw new Error("Opening cannot retire existing strategies.");
  if (request.kind !== "fund-and-open" && !previous.length)
    throw new Error("Select existing managed strategies to retire.");
  for (const old of previous) {
    const observed = snapshot.strategies.find((s) => s.hash === old.hash);
    if (
      old.app !== SWAP_VM ||
      !observed ||
      observed.app !== old.app ||
      observed.tokens.join(":") !== old.tokens.join(":")
    )
      throw new Error(
        "Retirement does not match the fresh active strategy state.",
      );
  }
  if (
    (request.kind === "close" || request.kind === "close-and-convert") &&
    request.funding
  )
    throw new Error("Closing cannot purchase opening inventory.");
  if (request.kind !== "close-and-convert" && request.conversion)
    throw new Error("Conversion requires explicit close-and-convert intent.");
}
