import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import {
  assertCapability,
  canonicalDigest,
  strategyConfigSchema,
  type StrategyConfig,
  type StrategyGroup,
  type BotRun,
} from "../../managed";
import { openManagedStore, type ManagedStore } from "../store";
import { transitionBot, pauseBot, type BotCommand } from "../automation/lease";
import { ManagedError } from "./errors";
import { validateConfigTokens } from "./snapshot";

export function ownedGroup(
  store: ManagedStore,
  owner: string,
  id: string,
): StrategyGroup {
  const group = store.get("group", id, owner);
  if (!group)
    throw new ManagedError("not_found", "Managed group not found.", 404);
  return group;
}
export function groupBot(
  store: ManagedStore,
  owner: string,
  groupId: string,
): BotRun {
  const bot = store.list("bot", owner, groupId)[0];
  if (!bot) throw new ManagedError("not_found", "Managed bot not found.", 404);
  return bot;
}
export function createGroup(
  owner: Address,
  configInput: StrategyConfig,
  mode: "manual" | "delegated" = "manual",
  store: ManagedStore = openManagedStore(),
) {
  const config = strategyConfigSchema.parse(configInput);
  assertCapability(config, mode);
  validateConfigTokens(config);
  if (config.maker !== owner)
    throw new ManagedError(
      "maker_ownership",
      "Authenticate the maker wallet before creating its group.",
      403,
    );
  const now = Date.now();
  if (config.policy.expiresAt.value <= now)
    throw new ManagedError(
      "policy_expired",
      "The proposed policy has expired.",
      400,
    );
  return store.transaction(() => {
    const group: StrategyGroup = {
      id: randomUUID(),
      owner,
      maker: config.maker,
      chainId: config.chainId,
      config,
      state: "draft",
      inventory: [],
      createdAt: now,
      updatedAt: now,
    };
    const bot: BotRun = {
      id: randomUUID(),
      owner,
      groupId: group.id,
      mode,
      state: "idle",
      intervalMs: config.policy.intervalMs.value,
      nextDueAt: now,
      runGeneration: 0,
      policyId: config.policy.id,
      stopReason: null,
      lease: null,
    };
    store.put("group", group, owner);
    store.put("bot", bot, owner);
    return { group, bot };
  });
}
export function editGroup(
  owner: string,
  id: string,
  input: StrategyConfig,
  store: ManagedStore = openManagedStore(),
) {
  const config = strategyConfigSchema.parse(input);
  validateConfigTokens(config);
  return store.transaction(() => {
    const group = ownedGroup(store, owner, id);
    const bot = groupBot(store, owner, id);
    assertCapability(config, bot.mode);
    if (group.maker !== config.maker || group.chainId !== config.chainId)
      throw new ManagedError(
        "immutable_identity",
        "Group wallet and chain cannot change.",
        400,
      );
    if (
      store
        .list("transaction", owner, id)
        .some((a) => ["prepared", "submitted", "unknown"].includes(a.status))
    )
      throw new ManagedError(
        "recovery_required",
        "Reconcile the outstanding transaction before editing.",
      );
    if (canonicalDigest(config) === canonicalDigest(group.config))
      return { group, bot };
    const nextGroup = { ...group, config, updatedAt: Date.now() };
    const nextBot = {
      ...pauseBot(
        bot,
        "Configuration changed. Review a fresh plan before resuming.",
      ),
      intervalMs: config.policy.intervalMs.value,
      policyId: config.policy.id,
    };
    store.put("group", nextGroup, owner);
    store.put("bot", nextBot, owner);
    return { group: nextGroup, bot: nextBot };
  });
}
export function updateBot(
  owner: string,
  id: string,
  command: BotCommand,
  sessionId: string,
  generation?: number,
  store: ManagedStore = openManagedStore(),
) {
  return store.transaction(() => {
    const group = ownedGroup(store, owner, id);
    const bot = groupBot(store, owner, id);
    if (command !== "stop" && command !== "heartbeat") {
      if (group.state === "closed")
        throw new ManagedError("group_closed", "This group is closed.");
      if (
        store
          .list("transaction", owner, id)
          .some((a) => ["prepared", "submitted", "unknown"].includes(a.status))
      )
        throw new ManagedError(
          "recovery_required",
          "Reconcile the outstanding transaction before resuming.",
        );
      if (group.config.policy.expiresAt.value <= Date.now())
        throw new ManagedError(
          "policy_expired",
          "Review an unexpired management policy before resuming.",
        );
    }
    const next = transitionBot(bot, command, sessionId, Date.now(), generation);
    store.put("bot", next, owner);
    return { group, bot: next, serverTime: Date.now(), leaseTimeoutMs: 45_000 };
  });
}
