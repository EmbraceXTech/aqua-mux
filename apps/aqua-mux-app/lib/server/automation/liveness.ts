import type { ManagedStore } from "../store";
import { groupBot } from "../managed-service/groups";
import { pauseBot } from "./lease";

/** This only observes an existing request. It never schedules a review or a trade. */
export function watchReviewLiveness(input: {
  store: ManagedStore;
  owner: string;
  groupId: string;
  generation: number;
  requiresLease: boolean;
  controller: AbortController;
}) {
  const timer = setInterval(() => {
    try {
      const bot = groupBot(input.store, input.owner, input.groupId);
      if (bot.runGeneration !== input.generation) {
        input.controller.abort();
        return;
      }
      if (
        input.requiresLease &&
        (!bot.lease ||
          bot.lease.expiresAt <= Date.now() ||
          bot.state !== "running")
      ) {
        input.store.put(
          "bot",
          pauseBot(
            bot,
            "Browser lease expired. Passive positions remain open.",
          ),
          input.owner,
        );
        input.controller.abort();
      }
    } catch {
      input.controller.abort();
    }
  }, 1000);
  timer.unref();
  return () => clearInterval(timer);
}
