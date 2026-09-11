import test from "node:test";
import assert from "node:assert/strict";
import { validateResponse } from "../src/service/response";
import { requestFixture, stubReview } from "./service-fixtures";
import { ReviewStore } from "../src/service/store";
import { Reviews } from "../src/service/reviews";

test("strict provider envelope rejects unknown fields and invalid usage before persistence", async () => {
  const request = requestFixture();
  for (const output of [
    { ...stubReview(), unexpected: "x".repeat(1_100_000) },
    { ...stubReview(), usage: { cost: null, inputTokens: "-1" } },
    { ...stubReview(), usage: { cost: null, inputTokens: -1 } },
    { ...stubReview(), provider: "x".repeat(161) },
  ])
    assert.throws(
      () => validateResponse(output, request),
      /invalid_provider_envelope/,
    );
  const store = new ReviewStore(":memory:");
  const reviews = new Reviews(store, async () => ({
    ...stubReview(),
    unexpected: "x".repeat(1_100_000),
  }));
  await assert.rejects(reviews.submit(request), /invalid_provider_envelope/);
  assert.equal(store.get(request.requestId)?.response, null);
  assert.equal(store.get(request.requestId)?.status, "failed");
  await reviews.close();
});

test("valid but oversized result is rejected before storage and HTTP response", () => {
  const output = stubReview();
  output.result.expectedEffects = Array(32).fill("x".repeat(2000));
  output.result.uncertainties = Array(32).fill("x".repeat(2000));
  output.result.rationale = "x".repeat(12000);
  assert.throws(
    () => validateResponse(output, requestFixture()),
    /provider_output_limit/,
  );
});
