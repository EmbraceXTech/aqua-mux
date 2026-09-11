import { NATIVE, token, wrapped } from "../../config";
import type { Call } from "../../model";
import { unwrapCall } from "./calls";
import type { SwapInventory } from "./funding";
import { Inventory } from "./inventory";
import type { LifecycleRequest } from "./types";

export async function convertInventory(
  request: LifecycleRequest,
  inventory: Inventory,
  receipts: Inventory,
  calls: Call[],
  swap: SwapInventory,
) {
  const conversion = request.conversion;
  if (!conversion)
    throw new Error(
      "Choose explicit attributable inventory and a conversion target.",
    );
  const selected = new Inventory(conversion.amounts),
    target = conversion.targetToken;
  if (target.address === NATIVE)
    throw new Error(
      "Select wrapped native as target and request unwrap explicitly.",
    );
  for (const item of selected.values()) {
    if (BigInt(item.amount) > inventory.amount(item.token))
      throw new Error("Conversion exceeds selected managed inventory.");
    if (item.token.address !== target.address && BigInt(item.amount) > 0n)
      await swap(item.token, target, item.amount, "1");
  }
  if (conversion.unwrap) {
    if (target.address !== wrapped(request.config.chainId).address)
      throw new Error("Only wrapped native can be unwrapped.");
    const amount = selected.amount(target) + receipts.amount(target);
    if (amount > 0n) {
      inventory.debit(target, amount);
      inventory.credit(token(request.config.chainId, NATIVE), amount);
      calls.push(unwrapCall(target.address, amount));
    }
  }
}
