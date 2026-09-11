import test from "node:test";
import assert from "node:assert/strict";
import {
  decodeProviderOutput,
  providerOutputSchema,
} from "../src/service/output-schema";
import { reviewResultSchema, validateResult } from "../src/service/contract";
import { requestFixture, stubReview } from "./service-fixtures";

test("provider schema is derived, strict, and replaces unsupported oneOf recursively", () => {
  const schema = providerOutputSchema();
  function inspect(node: unknown) {
    if (!node || typeof node !== "object") return;
    const s = node as Record<string, unknown>;
    assert.equal(s.oneOf, undefined);
    if (s.properties) {
      assert.deepEqual(s.required, Object.keys(s.properties));
      assert.equal(s.additionalProperties, false);
    }
    Object.values(s).forEach(inspect);
  }
  inspect(schema);
});

test("optional null wire values decode without accepting missing required fields or unknown keys", () => {
  const value = {
    ...stubReview().result,
    proposedConfig: null,
    evidence: [
      {
        source: "fixture",
        status: "partial",
        observedAt: Date.now(),
        detail: null,
      },
    ],
  };
  const decoded = reviewResultSchema.parse(decodeProviderOutput(value));
  assert.equal("proposedConfig" in decoded, false);
  assert.equal("detail" in decoded.evidence[0], false);
  assert.throws(() =>
    reviewResultSchema.parse(
      decodeProviderOutput({ ...value, rationale: null }),
    ),
  );
  assert.throws(() =>
    reviewResultSchema.parse(
      decodeProviderOutput({ ...value, calldata: null }),
    ),
  );
});

test("nested config optional values round trip through the shared policy validator", () => {
  const request = requestFixture();
  const config = structuredClone(request.config!);
  const value = {
    ...stubReview().result,
    proposedConfig: {
      ...config,
      pairs: config.pairs.map((p) => ({ ...p, programExpiresAt: null })),
    },
  };
  assert.deepEqual(
    validateResult(decodeProviderOutput(value), request).proposedConfig,
    config,
  );
});
