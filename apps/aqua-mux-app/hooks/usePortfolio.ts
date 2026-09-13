"use client";

import { skipToken, useQueries, useQuery } from "@tanstack/react-query";
import { networks, tokens } from "@/lib/config";
import type { ManagedSession } from "@/lib/managed-client/api";
import {
  fetchRecordedPositions,
  fetchWalletBalances,
} from "@/services/portfolio";
import type { PortfolioAsset } from "@/types/portfolio";

/** Read-only portfolio queries. Filters and selection belong to the UI. */
export function usePortfolio(session: ManagedSession | undefined) {
  const balanceQueries = useQueries({
    queries: networks.map((item) => ({
      queryKey: ["portfolio", "balances", session?.owner, item.id],
      queryFn: session
        ? ({ signal }: { signal: AbortSignal }) =>
            fetchWalletBalances(
              { account: session.owner, chainId: item.id },
              signal,
            )
        : skipToken,
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
    })),
  });
  const positionQuery = useQuery({
    queryKey: ["portfolio", "positions", session?.owner, session?.sessionId],
    queryFn: session
      ? ({ signal }) => fetchRecordedPositions(session, signal)
      : skipToken,
  });
  const assets: PortfolioAsset[] = session
    ? networks.flatMap((item, index) => {
        const balances = balanceQueries[index].data;
        return tokens(item.id).flatMap((token) => {
          const balance = balances?.[token.address];
          return balance && !/^0(?:\.0+)?$/.test(balance)
            ? [{ ...token, balance, chainId: item.id }]
            : [];
        });
      })
    : [];
  const positions = session ? (positionQuery.data ?? []) : [];
  const loading =
    !!session &&
    (balanceQueries.some((result) => result.isFetching) ||
      positionQuery.isFetching);
  const initialLoading =
    !!session && balanceQueries.some((result) => result.isPending);
  const failedNetworks = session
    ? networks.filter((_, index) => balanceQueries[index].isError)
    : [];
  const missingBalances = session
    ? networks.filter((_, index) =>
        Object.values(balanceQueries[index].data ?? {}).some(
          (balance) => balance === null,
        ),
      )
    : [];

  function refresh() {
    if (!session) return;
    void Promise.all([
      ...balanceQueries.map((result) => result.refetch()),
      positionQuery.refetch(),
    ]);
  }
  function retryPositions() {
    if (session) void positionQuery.refetch();
  }

  return {
    assets,
    positions,
    loading,
    initialLoading,
    failedNetworks,
    missingBalances,
    positionsLoading: !!session && positionQuery.isPending,
    positionsError: !!session && positionQuery.isError,
    refresh,
    retryPositions,
  };
}
