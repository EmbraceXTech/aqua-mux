import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createHash, timingSafeEqual } from "node:crypto";
import { parseRequest } from "./contract";
import { ServiceError, publicError } from "./errors";
import { Reviews } from "./reviews";

export function validateServerToken(token: string): void {
  // Require at least 256 encoded bits and reject common repeated placeholders.
  if (!/^[A-Za-z0-9_+/=-]{43,256}$/.test(token) || new Set(token).size < 16)
    throw new Error("AQUAMUX_AGENT_RUNNER_TOKEN must be a randomly generated token of at least 32 bytes");
}

export function createReviewServer(reviews: Reviews, token: string, options: { maxPayloadBytes?: number; requestsPerMinute?: number } = {}) {
  validateServerToken(token);
  const expected = createHash("sha256").update(`Bearer ${token}`).digest();
  const maxPayload = options.maxPayloadBytes ?? 128 * 1024;
  const requestsPerMinute = options.requestsPerMinute ?? 120;
  let windowStart = Date.now();
  let requests = 0;

  const server = createServer(async (req, res) => {
    try {
      const auth = createHash("sha256").update(req.headers.authorization ?? "").digest();
      if (!timingSafeEqual(expected, auth)) throw new ServiceError(401, "unauthorized");
      if (Date.now() - windowStart >= 60_000) { windowStart = Date.now(); requests = 0; }
      // Cancellation is always available to an authenticated caller, even at the review quota.
      if (req.method !== "DELETE" && ++requests > requestsPerMinute) throw new ServiceError(429, "request_rate_exceeded");
      if (req.headers.origin) throw new ServiceError(403, "browser_origin_forbidden");
      if (req.method === "POST" && req.url === "/reviews") {
        if (req.headers["content-type"]?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ServiceError(415, "json_required");
        const key = req.headers["idempotency-key"];
        const body = await readJSON(req, maxPayload);
        const request = parseRequest(body, typeof key === "string" ? key : undefined);
        sendJSON(res, 200, await reviews.submit(request));
      } else if (req.method === "DELETE" && /^\/reviews\/[a-zA-Z0-9:_-]{1,160}$/.test(req.url ?? "")) {
        sendJSON(res, 200, reviews.cancel(req.url!.slice("/reviews/".length)));
      } else {
        throw new ServiceError(404, "not_found");
      }
    } catch (error) {
      const failure = publicError(error);
      // Error details from a provider may contain credentials or sensitive paths.
      sendJSON(res, failure.status, { error: { code: failure.code } });
    }
  });
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 32;
  server.maxConnections = 64;
  return server;
}

async function readJSON(req: IncomingMessage, max: number): Promise<unknown> {
  if (Number(req.headers["content-length"] ?? 0) > max) throw new ServiceError(413, "payload_too_large");
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > max) throw new ServiceError(413, "payload_too_large");
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new ServiceError(400, "invalid_json"); }
}

function sendJSON(res: ServerResponse, status: number, value: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  res.end(JSON.stringify(value));
}
