import type { BotRun } from "../../managed/records";
import { ManagedError } from "../managed-service/errors";

export const BROWSER_LEASE_MS = 45_000;
export type BotCommand = "start" | "resume" | "stop" | "heartbeat" | "takeover";

export function assertLiveRun(
  bot: BotRun,
  sessionId: string,
  generation: number,
  now: number,
): void {
  if (bot.state !== "running" || generation !== bot.runGeneration)
    throw new ManagedError(
      "stale_generation",
      "This management run is no longer active.",
    );
  if (!bot.lease || bot.lease.expiresAt <= now)
    throw new ManagedError(
      "lease_expired",
      "Browser management paused because its lease expired.",
    );
  if (bot.lease.sessionId !== sessionId)
    throw new ManagedError(
      "lease_owned",
      "Another browser tab owns this management run.",
    );
}

/** Pure transition. Call inside the durable store transaction using server time. */
export function transitionBot(
  bot: BotRun,
  command: BotCommand,
  sessionId: string,
  now: number,
  generation?: number,
): BotRun {
  if (command === "stop")
    return {
      ...bot,
      state: "stopped",
      runGeneration: bot.runGeneration + 1,
      lease: null,
      stopReason: "Stopped by owner. Passive positions remain open.",
    };
  if (command === "heartbeat") {
    assertLiveRun(bot, sessionId, generation ?? -1, now);
    return {
      ...bot,
      lease: { sessionId, heartbeatAt: now, expiresAt: now + BROWSER_LEASE_MS },
    };
  }
  const live = bot.lease && bot.lease.expiresAt > now;
  if (live && bot.lease?.sessionId !== sessionId && command !== "takeover")
    throw new ManagedError(
      "lease_owned",
      "Another tab owns this run. Explicit takeover is required.",
    );
  if (bot.state === "running" && live && command !== "takeover") {
    assertLiveRun(bot, sessionId, generation ?? -1, now);
    return bot;
  }
  return {
    ...bot,
    state: "running",
    runGeneration: bot.runGeneration + 1,
    nextDueAt: now,
    stopReason: null,
    lease: { sessionId, heartbeatAt: now, expiresAt: now + BROWSER_LEASE_MS },
  };
}

export function pauseBot(bot: BotRun, reason: string): BotRun {
  return {
    ...bot,
    state: "paused",
    runGeneration: bot.runGeneration + 1,
    lease: null,
    stopReason: reason,
  };
}
