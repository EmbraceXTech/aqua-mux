import { z } from "zod";
import {
  reviewRecordSchema,
  reviewResultSchema,
} from "../../../frontend/lib/managed/review";
import {
  validateResult,
  type ReviewRequest,
  type ReviewResponse,
} from "./contract";
import { ServiceError } from "./errors";

const envelopeSchema = z.strictObject({
  result: reviewResultSchema,
  provider: z.string().min(1).max(160),
  model: z.string().min(1).max(160),
  runtimeVersion: z.string().min(1).max(160),
  usage: reviewRecordSchema.shape.usage,
});

export function validateResponse(
  output: unknown,
  request: ReviewRequest,
): ReviewResponse {
  const parsed = envelopeSchema.safeParse(output);
  if (!parsed.success) throw new ServiceError(502, "invalid_provider_envelope");
  const { provider, model, runtimeVersion, usage } = parsed.data;
  const result = validateResult(parsed.data.result, request);
  const response = {
    requestId: request.requestId,
    result,
    provider,
    model,
    runtimeVersion,
    usage,
  };
  if (Buffer.byteLength(JSON.stringify(response)) > 128 * 1024)
    throw new ServiceError(502, "provider_output_limit");
  return response;
}
