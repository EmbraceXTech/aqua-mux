import assert from "node:assert/strict";
import type { Address } from "viem";
import type {
  LifecyclePlan,
  ReviewRecord,
  LPStrategyConfig,
} from "../../lib/managed";
import { describeLPPrice } from "../../lib/managed-compiler/lp";
import type { ManagedStore } from "../../lib/server/store";
import type { managedHttp } from "./managed-http";

/** Owner-authorized policy edits and actual HTTP planning on the isolated fork. */
export async function verifyUpwardOnly(input: {
  store: ManagedStore;
  owner: Address;
  groupId: string;
  api: Awaited<ReturnType<typeof managedHttp>>;
  review: ReviewRecord;
  execute: (plan: { plan: LifecyclePlan; digest: string }) => Promise<unknown>;
}) {
  const { store, owner, groupId, api, review, execute } = input;
  const group = store.get("group", groupId, owner)!;
  assert.equal(group.config.family, "lp");
  const original = group.config as LPStrategyConfig;
  const policy = {
    ...original.policy,
    triggers: {
      ...original.policy.triggers,
      value: { ...original.policy.triggers.value, upwardOnly: true },
    },
  };
  const down = {
    ...original,
    policy,
    pairs: original.pairs.map((pair) => ({
      ...pair,
      openingPrice: {
        ...pair.openingPrice,
        numerator: (BigInt(pair.openingPrice.numerator) * 99n).toString(),
        denominator: (BigInt(pair.openingPrice.denominator) * 100n).toString(),
      },
    })),
  };
  const path = `groups/${groupId}`;
  const refused = await api.send(path, { config: down }, "PATCH");
  assert.equal(refused.data.code, "policy_authorization_required");
  assert.equal(
    (await api.send(path, { config: down, authorizePolicy: true }, "PATCH"))
      .status,
    200,
  );
  const baseline = store.getDocument<{
    config: LPStrategyConfig;
    confirmedAt: number;
  }>("active-configuration", groupId, owner)!.data;
  store.putDocument("active-configuration", groupId, owner, {
    ...baseline,
    confirmedAt: Date.now() - 60001,
  });
  const reviewConfig = (config: LPStrategyConfig, id: string) => {
    const bot = store.list("bot", owner, groupId)[0];
    store.put(
      "review",
      {
        ...review,
        owner,
        id,
        runGeneration: bot.runGeneration,
        result: {
          ...review.result!,
          decision: "replace",
          proposedConfig: config,
        },
      },
      owner,
    );
    return api.send(`${path}/plans`, { action: "replace", reviewId: id });
  };
  const declined = await reviewConfig(down, "downward-review");
  assert.equal(declined.data.code, "direction_refused");
  const up: LPStrategyConfig = {
    ...original,
    policy,
    pairs: original.pairs.map((pair) => {
      assert.equal(pair.range.kind, "bounded");
      if (pair.range.kind !== "bounded")
        throw new Error("Expected bounded fixture");
      const scale = (price: typeof pair.openingPrice) => ({
        ...price,
        numerator: (BigInt(price.numerator) * 11n).toString(),
        denominator: (BigInt(price.denominator) * 10n).toString(),
      });
      const adjusted = {
        ...pair,
        baseAmount: ((BigInt(pair.baseAmount) * 9n) / 10n).toString(),
        range: {
          kind: "bounded" as const,
          lower: scale(pair.range.lower),
          upper: scale(pair.range.upper),
        },
      };
      return { ...adjusted, openingPrice: describeLPPrice(adjusted) };
    }),
  };
  assert.equal(
    (await api.send(path, { config: up, authorizePolicy: true }, "PATCH"))
      .status,
    200,
  );
  const accepted = await reviewConfig(up, "upward-review");
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  const receipt = await execute(accepted.data);
  return {
    policyAuthorizationRefused: refused.data.code,
    downwardRefused: declined.data.code,
    upwardReplacement: receipt,
  };
}
