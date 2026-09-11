export class ServiceError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
  }
}

export function publicError(error: unknown): ServiceError {
  return error instanceof ServiceError ? error : new ServiceError(502, "review_failed");
}
