export class ManagedError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 409,
  ) {
    super(message);
    this.name = "ManagedError";
  }
}

export function managedFailure(error: unknown): Response {
  if (error instanceof ManagedError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  // Upstream exceptions can contain RPC URLs, authentication headers, or calldata.
  return Response.json(
    {
      error: "Managed request failed. Refresh and retry.",
      code: "request_failed",
    },
    { status: 500 },
  );
}
