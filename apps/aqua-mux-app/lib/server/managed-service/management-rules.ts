import {
  comparePrices,
  type StrategyConfig,
  type StrategyGroup,
} from "../../managed";
import type { ManagedStore } from "../store";
import { ManagedError } from "./errors";

type ActiveConfiguration = { config: StrategyConfig; confirmedAt: number };

/** This check is repeated by the execution broker after owner approval. */
export function assertManagementAction(
  store: ManagedStore,
  group: StrategyGroup,
  action: string,
  now = Date.now(),
) {
  if (action === "close" || action === "close-and-convert") return;
  const config = group.config;
  if (config.policy.expiresAt.value <= now)
    throw new ManagedError("policy_expired", "The management policy expired.");
  if (!config.policy.allowedActions.value.includes(action as "replace"))
    throw new ManagedError(
      "action_outside_policy",
      "The current policy does not permit this action.",
    );
  if (action !== "replace") return;
  const previous = store.getDocument<ActiveConfiguration>(
    "active-configuration",
    group.id,
    group.owner,
  )?.data;
  if (!previous)
    throw new ManagedError(
      "replacement_baseline_missing",
      "Reconcile a confirmed opening before replacing this group.",
    );
  if (now < previous.confirmedAt + config.policy.cooldownMs.value)
    throw new ManagedError(
      "cooldown_active",
      "The replacement cooldown has not elapsed.",
    );
  if (
    config.recipeId !== "upward-only-lp" &&
    !config.policy.triggers.value.upwardOnly
  )
    return;
  if (
    config.family !== "lp" ||
    previous.config.family !== "lp" ||
    config.pairs.length !== previous.config.pairs.length
  )
    throw new ManagedError(
      "direction_refused",
      "Upward-only replacement must retain the existing pairs.",
    );
  for (const pair of config.pairs) {
    const old = previous.config.pairs.find(
      (candidate) =>
        candidate.baseToken.address === pair.baseToken.address &&
        candidate.quoteToken.address === pair.quoteToken.address,
    );
    if (
      !old ||
      comparePrices(pair.openingPrice, old.openingPrice) <= 0 ||
      pair.range.kind !== "bounded" ||
      old.range.kind !== "bounded" ||
      comparePrices(pair.range.lower, old.range.lower) < 0 ||
      comparePrices(pair.range.upper, old.range.upper) < 0
    )
      throw new ManagedError(
        "direction_refused",
        "Upward-only replacement requires a higher opening price and bounds that do not move down.",
      );
  }
}
