import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import type { controlledFork } from "./controlled-fork";
import type { Address } from "viem";
import type { ManagedStore } from "../../lib/server/store";
import { groupReviewSnapshot } from "../../lib/server/managed-service/review-snapshot";
import { assertReviewSnapshotFresh } from "../../lib/server/managed-service/freshness";
/** Exercise the production active-group snapshot after fork entry. */
export async function verifyReviewObservations(
  fork: Awaited<ReturnType<typeof controlledFork>>,
  store: ManagedStore,
  owner: Address,
  groupId: string,
) {
  const group = store.get("group", groupId, owner)!;
  assert.equal(group.state, "active");
  const snapshot = await groupReviewSnapshot(group, store);
  const observations = group.config.pairs.map((pair) => ({
    quotes:
      snapshot.routeQuotes?.filter(
        (quote) => quote.toToken.address === pair.quoteToken.address,
      ) ?? [],
    observedAt: snapshot.observedAt,
  }));
  const expected = process.argv.includes("--expect-observations");
  assert.equal((snapshot.routeQuotes?.length ?? 0) > 0, expected);
  if (expected) {
    assert.equal(snapshot.routeQuotes!.length, group.config.pairs.length);
    assertReviewSnapshotFresh(
      snapshot,
      group.config.policy.maxReferenceAgeMs.value,
      Date.now(),
    );
    assert.throws(
      () =>
        assertReviewSnapshotFresh(
          snapshot,
          120000,
          Math.max(...snapshot.routeQuotes!.map((q) => q.expiresAt)),
        ),
      /quote expired/,
    );
  }
  if (expected) {
    const target = group.config.policy.allowedRoutes.value[0];
    const code = (await fork.rpc.getCode({ address: target }))!;
    await fork.request("anvil_setCode", [target, "0x"]);
    try {
      await assert.rejects(
        groupReviewSnapshot(group, store),
        /market observations/,
      );
      const monitoring = structuredClone(group);
      monitoring.config.policy.allowedActions.value = ["hold", "close"];
      const limited = await groupReviewSnapshot(monitoring, store);
      assert.equal(limited.routeQuotes?.length, 0);
      assert.ok(
        limited.coverage.some((source) => source.status === "unavailable"),
      );
    } finally {
      await fork.request("anvil_setCode", [target, code]);
    }
  }
  const evidence = {
    chainId: group.chainId,
    groupState: group.state,
    evidence: "production active snapshot after controlled fork LP entry",
    publicBroadcasts: 0,
    observations,
    expiryRefused: expected,
    missingMarketRefusesReplacementReview: expected,
    backingOnlyReviewPreservesUnavailableCoverage: expected,
  };
  writeFileSync(
    `/tmp/aquamux-active-observations-${group.chainId}-${group.config.pairs[0].quoteToken.address}.json`,
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(JSON.stringify(evidence));
}
