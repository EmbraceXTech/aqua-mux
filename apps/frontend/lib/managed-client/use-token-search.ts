import { useEffect, useState } from "react";
import type { TokenSearchResponse } from "@/lib/token-registry";
import { managedRequest } from "./api";

export function useTokenSearch(
  chainId: number,
  query: string,
  enabled: boolean,
) {
  const [state, setState] = useState<{
    key: string;
    result?: TokenSearchResponse;
    error?: string;
  }>();
  const key = `${chainId}:${query}`;
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      managedRequest<TokenSearchResponse>(
        `/api/tokens?chainId=${chainId}&q=${encodeURIComponent(query)}&limit=50`,
        undefined,
        undefined,
        undefined,
        controller.signal,
      )
        .then((result) => {
          if (!controller.signal.aborted) setState({ key, result });
        })
        .catch((cause) => {
          if (!controller.signal.aborted)
            setState({
              key,
              error:
                cause instanceof Error
                  ? cause.message
                  : "Token registry unavailable.",
            });
        });
    }, 200);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [chainId, query, enabled, key]);
  return state?.key === key ? state : { key };
}
