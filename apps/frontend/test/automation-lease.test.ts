import test from "node:test";
import assert from "node:assert/strict";
import type { BotRun } from "../lib/managed/records";
import {
  assertLiveRun,
  BROWSER_LEASE_MS,
  transitionBot,
} from "../lib/server/automation/lease";
const initial: BotRun = {
  id: "bot",
  owner: "0x1111111111111111111111111111111111111111",
  groupId: "group",
  mode: "manual",
  state: "idle",
  intervalMs: 60_000,
  nextDueAt: 0,
  runGeneration: 0,
  policyId: "policy",
  stopReason: null,
  lease: null,
};
test("only one tab owns the server-time lease and explicit takeover fences old results", () => {
  const first = transitionBot(initial, "start", "tab-a", 100);
  assert.throws(
    () => transitionBot(first, "start", "tab-b", 101),
    /Another tab/,
  );
  assert.throws(
    () => transitionBot(first, "heartbeat", "tab-b", 101, first.runGeneration),
    /Another browser/,
  );
  const second = transitionBot(first, "takeover", "tab-b", 102);
  assert.throws(
    () => assertLiveRun(second, "tab-a", first.runGeneration, 103),
    /no longer active/,
  );
  assertLiveRun(second, "tab-b", second.runGeneration, 103);
});
test("expired lease cannot be revived by heartbeat and resume coalesces missed intervals", () => {
  const first = transitionBot(initial, "start", "tab-a", 100);
  assert.throws(
    () =>
      transitionBot(
        first,
        "heartbeat",
        "tab-a",
        100 + BROWSER_LEASE_MS,
        first.runGeneration,
      ),
    /expired/,
  );
  const resumed = transitionBot(first, "resume", "tab-a", 1_000_000);
  assert.equal(resumed.nextDueAt, 1_000_000);
  assert.equal(resumed.runGeneration, first.runGeneration + 1);
});
test("stop invalidates a model result and leaves passive position semantics explicit", () => {
  const first = transitionBot(initial, "start", "tab-a", 100);
  const stopped = transitionBot(first, "stop", "tab-b", 110);
  assert.throws(
    () => assertLiveRun(stopped, "tab-a", first.runGeneration, 111),
    /no longer active/,
  );
  assert.match(stopped.stopReason!, /Passive positions remain open/);
  assert.equal(stopped.lease, null);
});
