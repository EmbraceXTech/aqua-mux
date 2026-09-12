import { getAddress, type Address } from "viem";

export const TOKEN_LIST_CHAIN_IDS = [1, 42_161, 56, 4_663] as const;
export type TokenListChainId = (typeof TOKEN_LIST_CHAIN_IDS)[number];

export type CuratedToken = {
  chainId: TokenListChainId;
  address: Address;
  decimals: number;
  name: string;
  symbol: string;
  logoURI?: string;
};

export type TokenList = {
  name: string;
  timestamp: string;
  version: { major: number; minor: number; patch: number };
  tokens: CuratedToken[];
};

export type TokenListSource = {
  name: string;
  url: string;
};

export type TokenListSourceResult = TokenListSource & {
  accepted: number;
  rejected: number;
};

export type TokenListBuild = {
  chainId: TokenListChainId;
  /** The first configured registry, retained for callers using the old API. */
  source: TokenListSource;
  sources: TokenListSourceResult[];
  list: TokenList;
  rejected: number;
};

export type TokenListOptions = {
  chainIds?: readonly TokenListChainId[];
  fetch?: typeof fetch;
  now?: () => Date;
};

type SourceFormat = "token-list" | "token-map" | "camelot" | "robinhood";
type ConfiguredSource = TokenListSource & { format: SourceFormat };

const trustWalletSources: Record<1 | 42161 | 56, ConfiguredSource> = {
  1: {
    name: "Trust Wallet Assets",
    url: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/tokenlist.json",
    format: "token-list",
  },
  42161: {
    name: "Trust Wallet Assets",
    url: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/arbitrum/tokenlist.json",
    format: "token-list",
  },
  56: {
    name: "Trust Wallet Assets",
    url: "https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/smartchain/tokenlist.json",
    format: "token-list",
  },
};

const arbitrumSources: ConfiguredSource[] = [
  trustWalletSources[42161],
  {
    name: "Camelot default token list",
    url: "https://raw.githubusercontent.com/CamelotLabs/default-token-list/master/src/tokens/arbitrum-one.json",
    format: "camelot",
  },
  {
    name: "1inch Token List",
    url: "https://tokens.1inch.io/v1.2/42161",
    format: "token-map",
  },
];

const robinhoodSource: ConfiguredSource = {
  name: "Robinhood Chain Stock Token API",
  url: "https://api.robinhood.com/rhj/assets",
  format: "robinhood",
};

/** Returns every public registry used for a supported chain, in metadata priority order. */
export function tokenListSources(chainId: TokenListChainId): readonly TokenListSource[] {
  if (chainId === 42161) return arbitrumSources;
  if (chainId === 4663) return [robinhoodSource];
  return [trustWalletSources[chainId]];
}

/** Returns the highest-priority public registry for a supported chain. */
export function tokenListSource(chainId: TokenListChainId): TokenListSource {
  return tokenListSources(chainId)[0]!;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isLogoUri(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try {
    const uri = new URL(value);
    return uri.protocol === "https:" || uri.protocol === "ipfs:";
  } catch {
    return value.startsWith("ipfs://");
  }
}

function validToken(row: unknown, chainId: TokenListChainId): CuratedToken | undefined {
  if (!isRecord(row)) return undefined;
  const { address, decimals, name, symbol } = row;
  if (
    typeof address !== "string" ||
    !/^0x[0-9a-fA-F]{40}$/.test(address) ||
    address.toLowerCase() === "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" ||
    !Number.isInteger(decimals) ||
    (decimals as number) < 0 ||
    (decimals as number) > 255 ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof symbol !== "string" ||
    !symbol.trim()
  ) {
    return undefined;
  }

  try {
    return {
      chainId,
      address: getAddress(address),
      decimals: decimals as number,
      name: name.trim().slice(0, 60),
      symbol: symbol.trim().slice(0, 20),
      ...(isLogoUri(row.logoURI) ? { logoURI: row.logoURI } : {}),
    };
  } catch {
    return undefined;
  }
}

function hasRejectedRisk(row: unknown): boolean {
  if (!isRecord(row) || !Array.isArray(row.tags)) return false;
  return row.tags.some((tag) => tag === "RISK:malicious" || tag === "RISK:suspicious");
}

function parseRows(rows: unknown[], chainId: TokenListChainId): { tokens: CuratedToken[]; rejected: number } {
  let rejected = 0;
  const tokens = rows.flatMap((row) => {
    const token = !hasRejectedRisk(row) && validToken(row, chainId);
    if (!token) rejected += 1;
    return token ? [token] : [];
  });
  return { tokens, rejected };
}

function tokensFromTokenList(payload: unknown, chainId: TokenListChainId) {
  const rows = isRecord(payload) && Array.isArray(payload.tokens) ? payload.tokens : [];
  return parseRows(rows, chainId);
}

function tokensFrom1inch(payload: unknown, chainId: TokenListChainId) {
  const rows = isRecord(payload) ? Object.values(payload) : [];
  return parseRows(rows, chainId);
}

function tokensFromCamelot(payload: unknown, chainId: TokenListChainId) {
  const rows = Array.isArray(payload)
    ? payload.filter((row) => isRecord(row) && row.chainId === chainId)
    : [];
  return parseRows(rows, chainId);
}

function tokensFromRobinhood(payload: unknown): { tokens: CuratedToken[]; rejected: number } {
  const assets = isRecord(payload) && Array.isArray(payload.assets) ? payload.assets : [];
  const rows: unknown[] = [];
  for (const asset of assets) {
    if (!isRecord(asset) || asset.status !== "ASSET_STATUS_ACTIVE") continue;
    const deployments = Array.isArray(asset.deployments) ? asset.deployments : [];
    for (const deployment of deployments) {
      if (!isRecord(deployment) || deployment.chainId !== 4663) continue;
      rows.push({
        address: deployment.contractAddress,
        decimals: 18,
        name: asset.tokenName,
        symbol: asset.tokenSymbol,
        logoURI: asset.logoUrl,
      });
    }
  }
  return parseRows(rows, 4663);
}

function parseSource(payload: unknown, source: ConfiguredSource, chainId: TokenListChainId) {
  switch (source.format) {
    case "token-map":
      return tokensFrom1inch(payload, chainId);
    case "camelot":
      return tokensFromCamelot(payload, chainId);
    case "robinhood":
      return tokensFromRobinhood(payload);
    default:
      return tokensFromTokenList(payload, chainId);
  }
}

function deduplicate(tokens: CuratedToken[]): CuratedToken[] {
  const byAddress = new Map<string, CuratedToken>();
  for (const token of tokens) {
    const key = token.address.toLowerCase();
    const existing = byAddress.get(key);
    if (!existing || (!existing.logoURI && token.logoURI)) byAddress.set(key, token);
  }
  return [...byAddress.values()].sort((a, b) =>
    a.symbol.localeCompare(b.symbol) || a.address.localeCompare(b.address),
  );
}

async function fetchSource(
  source: ConfiguredSource,
  chainId: TokenListChainId,
  request: typeof fetch,
): Promise<{ source: TokenListSourceResult; tokens: CuratedToken[] }> {
  const response = await request(source.url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`${source.name} returned HTTP ${response.status} for chain ${chainId}.`);
  }
  const parsed = parseSource(await response.json(), source, chainId);
  return { source: { ...source, accepted: parsed.tokens.length, rejected: parsed.rejected }, tokens: parsed.tokens };
}

/**
 * Fetches public curated registries and converts them to the Uniswap Token Lists
 * shape. Only display metadata is accepted. Contracts still need on-chain checks
 * before a transaction is built.
 */
export async function fetchTokenList(
  chainId: TokenListChainId,
  options: TokenListOptions = {},
): Promise<TokenListBuild> {
  const configuredSources = chainId === 42161
    ? arbitrumSources
    : chainId === 4663
      ? [robinhoodSource]
      : [trustWalletSources[chainId]];
  const request = options.fetch ?? fetch;
  const fetched = await Promise.all(configuredSources.map((source) => fetchSource(source, chainId, request)));
  const tokens = deduplicate(fetched.flatMap((result) => result.tokens));
  if (tokens.length === 0) {
    throw new Error(`${configuredSources[0]!.name} registries returned no valid tokens for chain ${chainId}.`);
  }

  return {
    chainId,
    source: configuredSources[0]!,
    sources: fetched.map((result) => result.source),
    rejected: fetched.reduce((total, result) => total + result.source.rejected, 0),
    list: {
      name: `AquaMux curated tokens ${chainId}`,
      timestamp: (options.now ?? (() => new Date()))().toISOString(),
      version: { major: 1, minor: 0, patch: 0 },
      tokens,
    },
  };
}

/** Fetches and normalizes the public registries for all requested supported chains. */
export async function fetchTokenLists(options: TokenListOptions = {}): Promise<TokenListBuild[]> {
  const chainIds = options.chainIds ?? TOKEN_LIST_CHAIN_IDS;
  return Promise.all(chainIds.map((chainId) => fetchTokenList(chainId, options)));
}
