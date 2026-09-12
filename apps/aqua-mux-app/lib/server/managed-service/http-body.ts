import { ManagedError } from "./errors";

export async function body(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new ManagedError("invalid_request", "Send a JSON request.", 400);
  const reader = request.body?.getReader();
  if (!reader)
    throw new ManagedError("invalid_request", "A JSON body is required.", 400);
  let size = 0;
  const chunks: Uint8Array[] = [];
  for (;;) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.byteLength;
    if (size > 128_000) {
      await reader.cancel();
      throw new ManagedError(
        "request_too_large",
        "The request body is too large.",
        413,
      );
    }
    chunks.push(item.value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ManagedError(
      "invalid_request",
      "The request body is not valid JSON.",
      400,
    );
  }
}
export const ok = (value: unknown) =>
  Response.json(value, { headers: { "Cache-Control": "no-store" } });
