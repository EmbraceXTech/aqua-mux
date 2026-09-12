import { dataTokenList } from "../data-token-list";
import { tokens } from "../config";
import {
  parseTokenRegistry,
  tokenRegistryChainId,
  type RegistryToken,
  type TokenRegistryChainId,
} from "../token-registry";

const REGISTRY_TTL_MS = 6 * 60 * 1_000;
const REGISTRY_STALE_MS = 24 * 60 * 60 * 1_000;
const REGISTRY_RETRY_MS = 30 * 1_000;

export type TokenRegistrySnapshot = {
  chainId: TokenRegistryChainId;
  source: string;
  fetchedAt: string;
  stale: boolean;
  degraded: boolean;
  rejected: number;
  tokens: RegistryToken[];
};

export type TokenRegistryDependencies = {
  apiKey?: string;
  fetch?: typeof fetch;
  now?: () => number;
};

type RegistryCacheEntry = TokenRegistrySnapshot & {
  expiresAtMs: number;
  staleUntilMs: number;
};

const registryCache = new Map<TokenRegistryChainId, RegistryCacheEntry>();
const registryRequests = new Map<
  TokenRegistryChainId,
  Promise<TokenRegistrySnapshot>
>();

function snapshotWithoutExpiry(
  entry: RegistryCacheEntry,
): TokenRegistrySnapshot {
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
  const list = dataTokenList(chainId);
  const parsed = parseTokenRegistry(
    chainId,
    tokens(chainId).map((token) => ({
      ...token,
      chainId,
      ...(token.logo ? { logoURI: token.logo } : {}),
    })),
  );
  return {
    chainId,
    source: `data/${chainId}.json`,
    fetchedAt: list.timestamp,
    stale: nowMs - Date.parse(list.timestamp) > REGISTRY_STALE_MS,
    degraded: true,
    rejected: parsed.rejected,
    tokens: parsed.tokens,
  };
}

function fallbackCacheEntry(
  chainId: TokenRegistryChainId,
  nowMs: number,
): RegistryCacheEntry {
  return {
    ...fallbackSnapshot(chainId, nowMs),
    expiresAtMs: nowMs + REGISTRY_RETRY_MS,
    staleUntilMs: nowMs + REGISTRY_RETRY_MS,
  };
}

async function refreshTokenRegistry(
  chainId: TokenRegistryChainId,
  dependencies: TokenRegistryDependencies,
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
      const staleEntry: RegistryCacheEntry = {
        ...cached,
        stale: true,
        degraded: true,
        expiresAtMs: nowMs + REGISTRY_RETRY_MS,
      };
      registryCache.set(chainId, staleEntry);
      return snapshotWithoutExpiry(staleEntry);
    }
    const fallback = fallbackCacheEntry(chainId, nowMs);
    registryCache.set(chainId, fallback);
    return snapshotWithoutExpiry(fallback);
  }
}

export async function getTokenRegistry(
  chainValue: unknown,
  dependencies: TokenRegistryDependencies = {},
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

export function resetTokenRegistryCacheForTests(): void {
  registryCache.clear();
  registryRequests.clear();
}
