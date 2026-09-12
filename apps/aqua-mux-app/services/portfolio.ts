import type { StrategyGroup } from "@/lib/managed";
import {
  managedRequest,
  type GroupDetail,
  type ManagedSession,
} from "@/lib/managed-client/api";
import { positionsFromDetail } from "@/lib/utils/portfolio";
import type {
  Balances,
  RecordedPosition,
  WalletBalanceQuery,
} from "@/types/portfolio";

export async function fetchWalletBalances(
  { account, chainId }: WalletBalanceQuery,
  signal: AbortSignal,
): Promise<Balances> {
  const response = await fetch(
    `/api/balances?chainId=${chainId}&address=${account}`,
    { cache: "no-store", signal },
  );
  const result = (await response.json().catch(() => null)) as {
    balances?: Balances;
    error?: string;
  } | null;
  if (!response.ok || !result?.balances)
    throw new Error(result?.error ?? "Wallet balances could not be loaded.");
  return result.balances;
}

export async function fetchRecordedPositions(
  session: ManagedSession,
  signal: AbortSignal,
): Promise<RecordedPosition[]> {
  const { groups } = await managedRequest<{ groups: StrategyGroup[] }>(
    "/groups",
    session,
    undefined,
    undefined,
    signal,
  );
  const details = await Promise.all(
    groups
      .filter((group) => group.config.family === "lp")
      .map((group) =>
        managedRequest<GroupDetail>(
          `/groups/${group.id}`,
          session,
          undefined,
          undefined,
          signal,
        ),
      ),
  );
  return details.flatMap(positionsFromDetail);
}
