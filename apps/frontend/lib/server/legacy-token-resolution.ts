import type { Address } from "viem";
import { NATIVE, token, tokens, type Token, wrapped } from "../config";
import {
  basketSchema,
  validateBasket,
  type Basket,
  type TokenResolver,
} from "../model";
import {
  findRegistryToken,
  type RegistryToken,
  type TokenMetadataCheck,
} from "../token-registry";
import {
  getTokenRegistry,
  type TokenRegistrySnapshot,
} from "./token-registry-source";
import { checkTokenMetadata } from "./token-validation";

export type ResolvedLegacyBasket = {
  basket: Basket;
  tokens: readonly Token[];
  resolveToken: TokenResolver;
};

export type LegacyTokenResolutionDependencies = {
  registry?: (chainId: number) => Promise<TokenRegistrySnapshot>;
  metadata?: (
    chainId: number,
    token: RegistryToken,
  ) => Promise<TokenMetadataCheck>;
};

function registryToken(
  token: RegistryToken,
  check: TokenMetadataCheck,
  source: string,
): Token {
  return Object.freeze({
    address: token.address,
    symbol: check.onchainSymbol ?? token.symbol,
    name: check.onchainName ?? token.name,
    decimals: check.onchainDecimals!,
    logo: token.logoURI ?? "",
    source,
  });
}

export async function resolveLegacyBasket(
  input: unknown,
  dependencies: LegacyTokenResolutionDependencies = {},
): Promise<ResolvedLegacyBasket> {
  const parsed = basketSchema.parse(input);
  const addresses = [
    ...new Set([
      parsed.source,
      ...parsed.legs.map((leg) => leg.address),
      ...(parsed.mode === "liquidity" && parsed.source === NATIVE
        ? [wrapped(parsed.chainId).address]
        : []),
    ]),
  ];
  const fallbackAddresses = new Set(
    tokens(parsed.chainId).map((candidate) => candidate.address),
  );
  const registry = await (dependencies.registry ?? getTokenRegistry)(
    parsed.chainId,
  );
  const metadata = dependencies.metadata ?? checkTokenMetadata;
  const verified = await Promise.all(
    addresses.map(async (address): Promise<Token> => {
      if (address === NATIVE) {
        return Object.freeze({ ...token(parsed.chainId, address) });
      }
      if (registry.stale && !fallbackAddresses.has(address)) {
        throw new Error(
          "Refresh the token registry before selecting this asset.",
        );
      }
      const listed = findRegistryToken(registry.tokens, address);
      if (!listed.selectable) {
        throw new Error("A risk-flagged token cannot be selected.");
      }
      const check = await metadata(parsed.chainId, listed);
      if (check.status === "unavailable") {
        throw new Error("Token code and decimals could not be verified.");
      }
      if (check.onchainDecimals !== listed.decimals) {
        throw new Error("Registry decimals do not match the token contract.");
      }
      return registryToken(listed, check, registry.source);
    }),
  );
  const verifiedByAddress = new Map(
    verified.map((candidate) => [candidate.address, candidate]),
  );
  const resolveToken: TokenResolver = (chainId, address) => {
    if (chainId !== parsed.chainId) {
      throw new Error("Token network does not match the basket.");
    }
    const resolved = verifiedByAddress.get(address.toLowerCase() as Address);
    if (!resolved) {
      throw new Error("Token was not verified for this basket.");
    }
    return resolved;
  };
  const immutableTokens = Object.freeze([...verified]);
  return Object.freeze({
    basket: validateBasket(parsed, resolveToken),
    tokens: immutableTokens,
    resolveToken,
  });
}
