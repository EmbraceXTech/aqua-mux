import { ManagedError } from "./errors";

const reason =
  "No external wallet account adapter has verified atomic execution and receipt recovery. Proposals and existing transaction recovery remain available.";

export const manualExternal = Object.freeze({ enabled: false, reason });
export const executionCapabilities = Object.freeze({
  external: Object.freeze({ verified: false, adapter: "none", reason }),
});

export function assertExternalExecutionAvailable(): never {
  throw new ManagedError("external_execution_unverified", reason);
}
