import { VerifiedTokenCache } from "./token-cache";
import { erc20Abi } from "viem";
import { NATIVE, token as catalogToken } from "../../config";
import type { Token } from "../../managed";
import { findRegistryToken } from "../../token-registry";
import { getTokenRegistry } from "../token-registry-source";
import { checkTokenMetadata } from "../token-validation";
import { client } from "../rpc";
import { ManagedError } from "./errors";

const verified = new VerifiedTokenCache();
export function verifiedToken(chainId: number, address: string): Token {
  const saved = verified.get(`${chainId}:${address.toLowerCase()}`);
  if (saved) return saved;
  const token = catalogToken(chainId, address);
  return {
    address: token.address,
    decimals: token.decimals,
    symbol: token.symbol,
  };
}
/** Stored metadata is allowed only from authoritative group/plan records, never a request body. */
export async function ensureManagedTokens(
  chainId: number,
  addresses: string[],
  stored: Token[] = [],
  dependencies: {
    registry?: typeof getTokenRegistry;
    metadata?: typeof checkTokenMetadata;
    storedDecimals?: (chainId: number, token: Token) => Promise<number>;
  } = {},
) {
  const missing = [
    ...new Set(addresses.map((address) => address.toLowerCase())),
  ];
  if (!missing.length) return;
  const registry = missing.some(
    (address) => !stored.some((token) => token.address === address),
  )
    ? await (dependencies.registry ?? getTokenRegistry)(chainId)
    : null;
  for (const address of missing) {
    let token: Token;
    const saved = stored.find((t) => t.address === address);
    if (saved) {
      const decimals =
        saved.address === NATIVE
          ? 18
          : dependencies.storedDecimals
            ? await dependencies.storedDecimals(chainId, saved)
            : await client(chainId).readContract({
                address: saved.address,
                abi: erc20Abi,
                functionName: "decimals",
              });
      if (decimals !== saved.decimals)
        throw new ManagedError(
          "invalid_token",
          "Stored token decimals no longer match the token contract.",
          400,
        );
      token = saved;
    } else {
      if (!registry || registry.stale)
        throw new ManagedError(
          "stale_registry",
          "Refresh the token registry before selecting a new asset.",
          503,
        );
      const listed = findRegistryToken(registry.tokens, address);
      if (!listed.selectable)
        throw new ManagedError(
          "token_not_selectable",
          "This registry token is not selectable.",
          400,
        );
      const metadata = await (dependencies.metadata ?? checkTokenMetadata)(
        chainId,
        listed,
      );
      if (metadata.status !== "verified")
        throw new ManagedError(
          "invalid_token",
          "Selected token metadata could not be verified onchain.",
          400,
        );
      token = {
        address: listed.address,
        decimals: listed.decimals,
        symbol: listed.symbol,
      };
    }
    if (token.address === NATIVE && token.decimals !== 18)
      throw new ManagedError(
        "invalid_token",
        "Native token decimals are invalid.",
        400,
      );
    verified.set(`${chainId}:${address}`, token);
  }
}
