import type { Token } from "@/lib/config";
import type { TokenResolver } from "@/lib/model";

export function catalogTokenResolver(
  chainId: number,
  catalog: readonly Token[],
): TokenResolver {
  return (requestedChain, address) => {
    if (requestedChain !== chainId)
      throw new Error("Token network changed. Refresh the selection.");
    const selected = catalog.find(
      (token) => token.address.toLowerCase() === address.toLowerCase(),
    );
    if (!selected)
      throw new Error("Token metadata is unavailable. Reselect the token.");
    return selected;
  };
}
