import { ZodError } from "zod";
import { AuthError } from "./wallet-auth";

export async function authBody(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new Error("JSON request required.");
  const text = await request.text();
  if (text.length > 8192) throw new Error("Request is too large.");
  return JSON.parse(text);
}
export function authFailure(error: unknown) {
  const status = error instanceof AuthError ? error.status : 400;
  const message =
    error instanceof AuthError
      ? error.message
      : error instanceof ZodError
        ? "Invalid authentication request."
        : "Authentication request failed.";
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
