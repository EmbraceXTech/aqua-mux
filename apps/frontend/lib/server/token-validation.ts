import { parseAbi, type Address, type PublicClient } from "viem";
import {
  findRegistryToken,
  tokenRegistryChainId,
  type RegistryToken,
  type TokenMetadataCheck,
  type TokenPairValidation,
  type TokenRegistryChainId,
  type TokenRouteCheck,
} from "../token-registry";
import { NATIVE } from "../config";
import { client } from "./rpc";
import {
  getTokenRegistry,
  type TokenRegistryDependencies,
} from "./token-registry-source";

const TOKEN_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]);

type MetadataDependencies = {
  publicClient?: PublicClient;
  now?: () => number;
};

export async function checkTokenMetadata(
  chainValue: unknown,
  token: RegistryToken,
  dependencies: MetadataDependencies = {},
): Promise<TokenMetadataCheck> {
  const chainId = tokenRegistryChainId(chainValue);
  const checkedAt = new Date((dependencies.now ?? Date.now)()).toISOString();
  if (token.chainId !== chainId) {
    throw new Error("Token network does not match.");
  }
  if (token.address === NATIVE) {
    return {
      status: token.decimals === 18 ? "verified" : "mismatch",
      checkedAt,
      registryDecimals: token.decimals,
      onchainDecimals: 18,
      warnings:
        token.decimals === 18 ? [] : ["Native asset decimals do not match."],
    };
  }

  try {
    const publicClient = dependencies.publicClient ?? client(chainId);
    const code = await publicClient.getCode({ address: token.address });
    if (!code || code === "0x") {
      return {
        status: "unavailable",
        checkedAt,
        registryDecimals: token.decimals,
        warnings: ["The selected address has no contract code."],
      };
    }
    const [decimalsResult, symbolResult, nameResult] = await Promise.allSettled(
      [
        publicClient.readContract({
          address: token.address,
          abi: TOKEN_ABI,
          functionName: "decimals",
        }),
        publicClient.readContract({
          address: token.address,
          abi: TOKEN_ABI,
          functionName: "symbol",
        }),
        publicClient.readContract({
          address: token.address,
          abi: TOKEN_ABI,
          functionName: "name",
        }),
      ],
    );
    if (decimalsResult.status !== "fulfilled") {
      return {
        status: "unavailable",
        checkedAt,
        registryDecimals: token.decimals,
        warnings: [
          "Token decimals could not be read from the selected address.",
        ],
      };
    }
    const onchainDecimals = Number(decimalsResult.value);
    const warnings: string[] = [];
    if (onchainDecimals !== token.decimals) {
      warnings.push("Registry decimals do not match the token contract.");
    }
    const onchainSymbol =
      symbolResult.status === "fulfilled"
        ? String(symbolResult.value)
        : undefined;
    const onchainName =
      nameResult.status === "fulfilled" ? String(nameResult.value) : undefined;
    if (onchainSymbol && onchainSymbol !== token.symbol) {
      warnings.push("Registry symbol differs from the token contract.");
    }
    if (onchainName && onchainName !== token.name) {
      warnings.push("Registry name differs from the token contract.");
    }
    return {
      status: warnings.length === 0 ? "verified" : "mismatch",
      checkedAt,
      registryDecimals: token.decimals,
      onchainDecimals,
      ...(onchainSymbol ? { onchainSymbol } : {}),
      ...(onchainName ? { onchainName } : {}),
      warnings,
    };
  } catch {
    return {
      status: "unavailable",
      checkedAt,
      registryDecimals: token.decimals,
      warnings: ["Token metadata could not be checked on-chain."],
    };
  }
}

async function checkRoute(
  chainId: TokenRegistryChainId,
  source: Address,
  destination: Address,
  amount: string,
  dependencies: TokenRegistryDependencies,
): Promise<TokenRouteCheck> {
  const checkedAt = new Date((dependencies.now ?? Date.now)()).toISOString();
  const apiKey = dependencies.apiKey ?? process.env.ONEINCH_API_KEY;
  if (!apiKey) {
    return {
      status: "unavailable",
      reason: "provider_error",
      checkedAt,
      amountIn: amount,
    };
  }
  try {
    const response = await (dependencies.fetch ?? fetch)(
      `https://api.1inch.com/swap/v6.1/${chainId}/quote?${new URLSearchParams({
        src: source,
        dst: destination,
        amount,
      })}`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      return {
        status: "unavailable",
        reason:
          response.status === 400 || response.status === 404
            ? "no_route"
            : "provider_error",
        checkedAt,
        amountIn: amount,
      };
    }
    const quote = (await response.json()) as { dstAmount?: unknown };
    if (
      !/^\d+$/.test(String(quote.dstAmount)) ||
      BigInt(String(quote.dstAmount)) <= 0n
    ) {
      return {
        status: "unavailable",
        reason: "invalid_response",
        checkedAt,
        amountIn: amount,
      };
    }
    return {
      status: "available",
      checkedAt,
      amountIn: amount,
      amountOut: String(quote.dstAmount),
    };
  } catch {
    return {
      status: "unavailable",
      reason: "provider_error",
      checkedAt,
      amountIn: amount,
    };
  }
}

export async function validateTokenPair(
  input: { chainId: unknown; src: string; dst: string; amount: string },
  dependencies: TokenRegistryDependencies & MetadataDependencies = {},
): Promise<TokenPairValidation> {
  const chainId = tokenRegistryChainId(input.chainId);
  if (!/^\d+$/.test(input.amount) || BigInt(input.amount) <= 0n) {
    throw new Error(
      "Route amount must be a positive integer in raw token units.",
    );
  }
  const registry = await getTokenRegistry(chainId, dependencies);
  const source = findRegistryToken(registry.tokens, input.src);
  const destination = findRegistryToken(registry.tokens, input.dst);
  if (source.address === destination.address) {
    throw new Error("Route tokens must differ.");
  }
  if (!source.selectable || !destination.selectable) {
    throw new Error("A risk-flagged token cannot be selected.");
  }
  const [sourceMetadata, destinationMetadata, route] = await Promise.all([
    checkTokenMetadata(chainId, source, dependencies),
    checkTokenMetadata(chainId, destination, dependencies),
    checkRoute(
      chainId,
      source.address,
      destination.address,
      input.amount,
      dependencies,
    ),
  ]);
  return {
    chainId,
    source,
    destination,
    metadata: { source: sourceMetadata, destination: destinationMetadata },
    route,
  };
}
