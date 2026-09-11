import { parseAbi, type Address, type PublicClient } from "viem";
import catalog from "../token-catalog.json";
import {
  findRegistryToken,
  parseTokenRegistry,
  tokenRegistryChainId,
  type RegistryToken,
  type TokenRegistryChainId,
} from "../token-registry";
import { NATIVE } from "../config";
import { client } from "./rpc";

const REGISTRY_TTL_MS = 6 * 60 * 1_000;
const REGISTRY_STALE_MS = 24 * 60 * 60 * 1_000;
const TOKEN_ABI = parseAbi([
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function name() view returns (string)",
]);

export type TokenRegistrySnapshot = {
  chainId: TokenRegistryChainId;
  source: string;
  fetchedAt: string;
  stale: boolean;
  degraded: boolean;
  rejected: number;
  tokens: RegistryToken[];
};

export type TokenMetadataCheck = {
  status: "verified" | "mismatch" | "unavailable";
  checkedAt: string;
  registryDecimals: number;
  onchainDecimals?: number;
  onchainSymbol?: string;
  onchainName?: string;
  warnings: string[];
};

export type TokenRouteCheck = {
  status: "available" | "unavailable";
  reason?: "no_route" | "provider_error" | "invalid_response";
  checkedAt: string;
  amountIn: string;
  amountOut?: string;
};

export type TokenPairValidation = {
  chainId: TokenRegistryChainId;
  source: RegistryToken;
  destination: RegistryToken;
  metadata: {
    source: TokenMetadataCheck;
    destination: TokenMetadataCheck;
  };
  route: TokenRouteCheck;
};

type RegistryCacheEntry = TokenRegistrySnapshot & {
  expiresAtMs: number;
  staleUntilMs: number;
};

type RegistryDependencies = {
  apiKey?: string;
  fetch?: typeof fetch;
  now?: () => number;
};

type MetadataDependencies = {
  publicClient?: PublicClient;
  now?: () => number;
};

const registryCache = new Map<TokenRegistryChainId, RegistryCacheEntry>();
const registryRequests = new Map<
  TokenRegistryChainId,
  Promise<TokenRegistrySnapshot>
>();

function snapshotWithoutExpiry(entry: RegistryCacheEntry): TokenRegistrySnapshot {
  return {
    chainId: entry.chainId,
    source: entry.source,
    fetchedAt: entry.fetchedAt,
    stale: entry.stale,
    degraded: entry.degraded,
    rejected: entry.rejected,
    tokens: entry.tokens,
  };
}

function fallbackSnapshot(
  chainId: TokenRegistryChainId,
  nowMs: number,
): TokenRegistrySnapshot {
  const entries = catalog.chains[String(chainId) as keyof typeof catalog.chains];
  const parsed = parseTokenRegistry(
    chainId,
    entries.map((token) => ({
      ...token,
      chainId,
      logoURI: token.source,
      tags: [],
      providers: ["AquaMux curated fallback"],
    })),
  );
  return {
    chainId,
    source: catalog.source,
    fetchedAt: catalog.capturedAt,
    stale: nowMs - Date.parse(catalog.capturedAt) > REGISTRY_STALE_MS,
    degraded: true,
    rejected: parsed.rejected,
    tokens: parsed.tokens,
  };
}

async function refreshTokenRegistry(
  chainId: TokenRegistryChainId,
  dependencies: RegistryDependencies,
): Promise<TokenRegistrySnapshot> {
  const request = dependencies.fetch ?? fetch;
  const nowMs = (dependencies.now ?? Date.now)();
  const apiKey = dependencies.apiKey ?? process.env.ONEINCH_API_KEY;
  if (!apiKey) return fallbackSnapshot(chainId, nowMs);

  try {
    const response = await request(
      `https://api.1inch.com/swap/v6.1/${chainId}/tokens`,
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        cache: "no-store",
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) throw new Error("1inch token registry request failed.");
    const parsed = parseTokenRegistry(chainId, await response.json());
    if (parsed.tokens.length === 0) {
      throw new Error("1inch token registry returned no valid tokens.");
    }
    const entry: RegistryCacheEntry = {
      chainId,
      source: `https://api.1inch.com/swap/v6.1/${chainId}/tokens`,
      fetchedAt: new Date(nowMs).toISOString(),
      stale: false,
      degraded: parsed.rejected > 0,
      rejected: parsed.rejected,
      tokens: parsed.tokens,
      expiresAtMs: nowMs + REGISTRY_TTL_MS,
      staleUntilMs: nowMs + REGISTRY_STALE_MS,
    };
    registryCache.set(chainId, entry);
    return snapshotWithoutExpiry(entry);
  } catch {
    const cached = registryCache.get(chainId);
    if (cached && nowMs <= cached.staleUntilMs) {
      return { ...snapshotWithoutExpiry(cached), stale: true, degraded: true };
    }
    return fallbackSnapshot(chainId, nowMs);
  }
}

export async function getTokenRegistry(
  chainValue: unknown,
  dependencies: RegistryDependencies = {},
): Promise<TokenRegistrySnapshot> {
  const chainId = tokenRegistryChainId(chainValue);
  const nowMs = (dependencies.now ?? Date.now)();
  const cached = registryCache.get(chainId);
  if (cached && nowMs <= cached.expiresAtMs) {
    return snapshotWithoutExpiry(cached);
  }
  const active = registryRequests.get(chainId);
  if (active) return active;
  const pending = refreshTokenRegistry(chainId, dependencies).finally(() => {
    registryRequests.delete(chainId);
  });
  registryRequests.set(chainId, pending);
  return pending;
}

export async function checkTokenMetadata(
  chainValue: unknown,
  token: RegistryToken,
  dependencies: MetadataDependencies = {},
): Promise<TokenMetadataCheck> {
  const chainId = tokenRegistryChainId(chainValue);
  const checkedAt = new Date((dependencies.now ?? Date.now)()).toISOString();
  if (token.chainId !== chainId) throw new Error("Token network does not match.");
  if (token.address === NATIVE) {
    return {
      status: token.decimals === 18 ? "verified" : "mismatch",
      checkedAt,
      registryDecimals: token.decimals,
      onchainDecimals: 18,
      warnings: token.decimals === 18 ? [] : ["Native asset decimals do not match."],
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
    const [decimalsResult, symbolResult, nameResult] = await Promise.allSettled([
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
    ]);
    if (decimalsResult.status !== "fulfilled") {
      return {
        status: "unavailable",
        checkedAt,
        registryDecimals: token.decimals,
        warnings: ["Token decimals could not be read from the selected address."],
      };
    }
    const onchainDecimals = Number(decimalsResult.value);
    const warnings: string[] = [];
    if (onchainDecimals !== token.decimals) {
      warnings.push("Registry decimals do not match the token contract.");
    }
    const onchainSymbol =
      symbolResult.status === "fulfilled" ? String(symbolResult.value) : undefined;
    const onchainName =
      nameResult.status === "fulfilled" ? String(nameResult.value) : undefined;
    if (onchainSymbol && onchainSymbol !== token.symbol) {
      warnings.push("Registry symbol differs from the token contract.");
    }
    if (onchainName && onchainName !== token.name) {
      warnings.push("Registry name differs from the token contract.");
    }
    return {
      status: onchainDecimals === token.decimals ? "verified" : "mismatch",
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
  dependencies: RegistryDependencies,
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
          response.status >= 400 && response.status < 500
            ? "no_route"
            : "provider_error",
        checkedAt,
        amountIn: amount,
      };
    }
    const quote = (await response.json()) as { dstAmount?: unknown };
    if (!/^\d+$/.test(String(quote.dstAmount)) || BigInt(String(quote.dstAmount)) <= 0n) {
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
  dependencies: RegistryDependencies & MetadataDependencies = {},
): Promise<TokenPairValidation> {
  const chainId = tokenRegistryChainId(input.chainId);
  if (!/^\d+$/.test(input.amount) || BigInt(input.amount) <= 0n) {
    throw new Error("Route amount must be a positive integer in raw token units.");
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

export function resetTokenRegistryCacheForTests(): void {
  registryCache.clear();
  registryRequests.clear();
}
