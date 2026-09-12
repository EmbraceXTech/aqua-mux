import type { Address } from "viem";
import { client } from "../rpc";
import {
  externalAdapterId,
  verifyExternalAccount,
} from "../external-adapter/account";
import { ManagedError } from "./errors";
export {
  prepareExternalExecution,
  relayExternalExecution,
} from "../external-adapter/execution";

const reason =
  "External execution requires a verified Simple7702Account and a provider supporting transaction signing without broadcasting.";
export const manualExternal = Object.freeze({ enabled: true, reason });
// Catalog support is distinct from verification of the selected execution account.
export const executionCapabilities = Object.freeze({
  external: Object.freeze({
    verified: false,
    adapter: externalAdapterId,
    reason,
  }),
});
export async function externalExecutionCapabilities(
  owner: string,
  chainId: number,
  maker: Address,
) {
  try {
    await verifyExternalAccount(owner, maker, chainId, client(chainId));
    return { external: { verified: true, adapter: externalAdapterId, reason } };
  } catch {
    return {
      external: {
        verified: false,
        adapter: externalAdapterId,
        reason:
          "This account or chain does not have the verified atomic execution implementation.",
      },
    };
  }
}
// Retain fail-closed behavior for any endpoint that has not migrated to the account adapter.
export function assertExternalExecutionAvailable(): never {
  throw new ManagedError("external_execution_unverified", reason);
}
