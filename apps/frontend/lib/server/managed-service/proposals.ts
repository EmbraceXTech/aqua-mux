import { randomUUID } from "node:crypto";
import type { Address } from "viem";
import {
  canonicalDigest,
  type Records,
  type StrategyGroup,
  type BotRun,
} from "../../managed";
import { openManagedStore } from "../store";
import { configuredRunner } from "./runner";
import { DevelopmentReviewEntitlement } from "../payments/review-service";
import { intentSchema, type ProposalIntent } from "./inputs";
import {
  intentSnapshot,
  validateConfigTokens,
  verifiedToken,
} from "./snapshot";
import { proposalPolicy } from "./policy-template";
import { createGroup } from "./groups";
import { ManagedError } from "./errors";

type ProposalResponse = {
  review: Records["review"];
  group?: StrategyGroup;
  bot?: BotRun;
};
type ProposalDocument = {
  digest: string;
  deadline: number;
  response: ProposalResponse;
};
export async function proposeIntent(
  owner: Address,
  key: string,
  raw: ProposalIntent,
): Promise<ProposalResponse> {
  const intent = intentSchema.parse(raw),
    store = openManagedStore();
  if (intent.maker !== owner)
    throw new ManagedError(
      "maker_ownership",
      "Authenticate the maker wallet first.",
      403,
    );
  const digest = canonicalDigest(intent),
    id = canonicalDigest({ owner, key });
  const reservation = store.transaction(() => {
    const previous = store.getDocument<ProposalDocument>(
      "proposal-intents",
      id,
      owner,
    );
    if (previous) {
      if (previous.data.digest !== digest)
        throw new ManagedError(
          "idempotency_conflict",
          "This proposal key was used with different inputs.",
        );
      return { previous: previous.data };
    }
    if (
      store
        .listDocuments<ProposalDocument>("proposal-intents", owner)
        .some(
          (d) =>
            d.data.response.review.status === "pending" &&
            d.data.deadline > Date.now(),
        )
    )
      throw new ManagedError(
        "review_busy",
        "A wallet proposal is already running.",
      );
    const review: Records["review"] = {
      id: randomUUID(),
      owner,
      groupId: randomUUID(),
      botId: randomUUID(),
      createdAt: Date.now(),
      runGeneration: 0,
      snapshot: {},
      coverage: [],
      provider: "unavailable",
      model: "unavailable",
      runtimeVersion: "unavailable",
      status: "pending",
      errors: [],
      usage: { cost: null },
    };
    const document = {
      digest,
      deadline: Date.now() + 120_000,
      response: { review },
    };
    store.putDocument("proposal-intents", id, owner, document);
    return { document };
  });
  if (reservation.previous) {
    if (
      reservation.previous.response.review.status === "pending" &&
      reservation.previous.deadline <= Date.now()
    ) {
      reservation.previous.response.review.status = "cancelled";
      reservation.previous.response.review.errors = [
        "The proposal did not complete before its deadline. Submit a fresh request.",
      ];
      store.putDocument("proposal-intents", id, owner, reservation.previous);
    }
    return reservation.previous.response;
  }
  const document = reservation.document!;
  const review = document.response.review;
  try {
    await new DevelopmentReviewEntitlement(
      Number(process.env.AQUAMUX_REVIEW_QUOTA ?? 100),
    ).authorize({
      owner,
      requestId: review.id,
      priorReviews:
        store.listDocuments("proposal-intents", owner).length -
        1 +
        store.list("review", owner).length,
    });
    const snapshot = await intentSnapshot(intent);
    review.snapshot = snapshot;
    review.coverage = snapshot.coverage;
    const policyTemplate = proposalPolicy(
      intent,
      `policy:${review.id}`,
      Date.now(),
    );
    const result = await configuredRunner().review(
      {
        requestId: review.id,
        owner,
        groupId: review.groupId,
        botId: review.botId,
        runGeneration: 0,
        purpose: "proposal",
        intent,
        policyTemplate,
        snapshot,
        deadline: document.deadline,
      },
      AbortSignal.timeout(Math.max(1, document.deadline - Date.now())),
    );
    if (Date.now() >= document.deadline)
      throw new ManagedError(
        "review_timeout",
        "The proposal deadline elapsed.",
      );
    if (
      Date.now() - snapshot.blockTimestamp >
        policyTemplate.maxReferenceAgeMs.value ||
      snapshot.blockTimestamp > Date.now() + 10_000
    )
      throw new ManagedError(
        "stale_data",
        "Wallet data became stale while the proposal ran. Request a fresh proposal.",
      );
    const config = result.result.proposedConfig;
    if (config) {
      validateConfigTokens(config);
      if (
        config.chainId !== intent.chainId ||
        config.maker !== owner ||
        config.recipeId !== intent.recipeId ||
        canonicalDigest(config.policy) !== canonicalDigest(policyTemplate)
      )
        throw new ManagedError(
          "invalid_review",
          "The proposed configuration changed the selected policy or wallet.",
        );
    }
    Object.assign(review, {
      status: "succeeded",
      result: result.result,
      provider: result.provider,
      model: result.model,
      runtimeVersion: result.runtimeVersion,
      usage: result.usage,
    });
    store.transaction(() => {
      if (config) {
        const created = createGroup(owner, config, "manual", store);
        review.groupId = created.group.id;
        review.botId = created.bot.id;
        const funding = {
          token: verifiedToken(intent.chainId, intent.fundingToken),
          amount: intent.budget,
        };
        // Authoritative selected capital is the explicit funding budget, never every wallet asset.
        created.group.inventory = [
          { token: funding.token, amount: funding.amount },
        ];
        store.put("group", created.group, owner);
        store.put("review", review, owner);
        store.putDocument("group-intent", created.group.id, owner, {
          intent,
          policyTemplate,
        });
        document.response = { review, ...created };
      }
      store.putDocument("proposal-intents", id, owner, document);
    });
  } catch (error) {
    review.status = "failed";
    review.errors = [
      error instanceof ManagedError
        ? error.message
        : "A fresh authenticated proposal could not be completed.",
    ];
    store.putDocument("proposal-intents", id, owner, document);
  }
  return document.response;
}
