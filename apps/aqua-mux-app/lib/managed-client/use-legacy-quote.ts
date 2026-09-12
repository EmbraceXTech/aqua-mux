import { useEffect, useState } from "react";
import { validateBasket } from "../model";
import { errorMessage } from "../errors";
import { managedRequest, type ManagedSession } from "./api";
import { catalogTokenResolver } from "./catalog-token";

export type LegacyQuote = {
  legs: { address: string; amountOut: string; minAmountOut: string }[];
  quotedAt: number;
  expiresAt: number;
};

/** Bind visible quotes to the current editor, identity and chain. */
export function useLegacyQuote(input: {
  enabled: boolean;
  chainId: number;
  basket: string;
  catalog: string;
  session?: ManagedSession;
}) {
  const { enabled, chainId, basket, catalog, session } = input;
  const key = JSON.stringify([
    enabled,
    chainId,
    basket,
    catalog,
    session?.sessionId,
  ]);
  const [state, setState] = useState<{
    key: string;
    quote?: LegacyQuote;
    busy: boolean;
    error: string;
  }>();
  useEffect(() => {
    if (!enabled || !session) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const validated = validateBasket(
          JSON.parse(basket),
          catalogTokenResolver(chainId, JSON.parse(catalog)),
        );
        setState({ key, busy: true, error: "" });
        const quote = await managedRequest<LegacyQuote>(
          "/api/quote",
          session,
          validated,
          undefined,
          controller.signal,
        );
        if (!controller.signal.aborted)
          setState({ key, quote, busy: false, error: "" });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({ key, busy: false, error: errorMessage(error) });
      }
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [enabled, chainId, basket, catalog, session, key]);
  return state?.key === key
    ? state
    : { quote: undefined, busy: false, error: "" };
}
