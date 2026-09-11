import { getAddress, isAddress, type Address } from "viem";
import { z } from "zod";

export const TOKEN_REGISTRY_CHAIN_IDS = [1, 56, 42161, 4663] as const;
export type TokenRegistryChainId = (typeof TOKEN_REGISTRY_CHAIN_IDS)[number];

export type TokenRisk =
  | "unknown"
  | "no_known_risk"
  | "info"
  | "unverified"
  | "suspicious"
  | "malicious";

export type RegistryToken = {
  chainId: TokenRegistryChainId;
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  tags: string[];
  providers: string[];
  registryStatus: "listed";
  routeStatus: "not_checked";
  risk: TokenRisk;
  selectable: boolean;
};

export type ParsedTokenRegistry = {
  tokens: RegistryToken[];
  rejected: number;
};

export type TokenSearchResult = {
  total: number;
  items: RegistryToken[];
};

export type TokenSearchResponse = TokenSearchResult & {
  chainId: TokenRegistryChainId;
  source: string;
  fetchedAt: string;
  stale: boolean;
  degraded: boolean;
  rejected: number;
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

const rawTokenSchema = z
  .object({
    address: z.string(),
    chainId: z.number().int().optional(),
    symbol: z.string().trim().min(1).max(64),
    name: z.string().trim().min(1).max(180),
    decimals: z.number().int().min(0).max(255),
    logoURI: z.string().url().optional(),
    tags: z.array(z.string().max(100)).optional(),
    providers: z.array(z.string().max(100)).optional(),
  })
  .passthrough();

const RISK_TAGS: ReadonlyArray<[string, TokenRisk]> = [
  ["RISK:malicious", "malicious"],
  ["RISK:suspicious", "suspicious"],
  ["RISK:unverified", "unverified"],
  ["RISK:info", "info"],
  ["RISK:norisk", "no_known_risk"],
];

export function tokenRegistryChainId(value: unknown): TokenRegistryChainId {
  const id = typeof value === "number" ? value : Number(value);
  if (!TOKEN_REGISTRY_CHAIN_IDS.includes(id as TokenRegistryChainId)) {
    throw new Error("Unsupported token registry network.");
  }
  return id as TokenRegistryChainId;
}

export function tokenRisk(tags: readonly string[]): TokenRisk {
  for (const [tag, risk] of RISK_TAGS) {
    if (tags.includes(tag)) return risk;
  }
  return "unknown";
}

export function parseTokenRegistry(
  chainValue: unknown,
  payload: unknown,
): ParsedTokenRegistry {
  const chainId = tokenRegistryChainId(chainValue);
  const container =
    payload && typeof payload === "object" && "tokens" in payload
      ? (payload as { tokens: unknown }).tokens
      : payload;
  const entries = Array.isArray(container)
    ? container
    : container && typeof container === "object"
      ? Object.values(container)
      : [];
  const byAddress = new Map<Address, RegistryToken>();
  let rejected = 0;

  for (const entry of entries) {
    const parsed = rawTokenSchema.safeParse(entry);
    if (
      !parsed.success ||
      (parsed.data.chainId !== undefined && parsed.data.chainId !== chainId) ||
      !isAddress(parsed.data.address, { strict: false })
    ) {
      rejected++;
      continue;
    }

    const address = getAddress(parsed.data.address).toLowerCase() as Address;
    if (byAddress.has(address)) {
      rejected++;
      continue;
    }
    const tags = [...new Set(parsed.data.tags ?? [])].sort();
    const risk = tokenRisk(tags);
    byAddress.set(address, {
      chainId,
      address,
      symbol: parsed.data.symbol,
      name: parsed.data.name,
      decimals: parsed.data.decimals,
      ...(parsed.data.logoURI ? { logoURI: parsed.data.logoURI } : {}),
      tags,
      providers: [...new Set(parsed.data.providers ?? [])].sort(),
      registryStatus: "listed",
      routeStatus: "not_checked",
      risk,
      selectable: risk !== "malicious" && risk !== "suspicious",
    });
  }

  return { tokens: [...byAddress.values()], rejected };
}

function preferenceScore(token: RegistryToken): number {
  let score = 0;
  if (token.tags.includes("bluechip")) score += 32;
  if (token.tags.includes("stablecoin")) score += 24;
  if (token.tags.includes("connector")) score += 16;
  if (token.tags.includes("RISK:norisk")) score += 12;
  if (token.tags.includes("RISK:info")) score += 8;
  if (!token.selectable) score -= 1_000;
  if (token.risk === "unverified") score -= 100;
  return score;
}

function textMatchScore(token: RegistryToken, query: string): number {
  if (!query) return 0;
  const symbol = token.symbol.toLowerCase();
  const name = token.name.toLowerCase();
  const address = token.address.toLowerCase();
  if (address === query) return 10_000;
  if (symbol === query) return 8_000;
  if (symbol.startsWith(query)) return 6_000;
  if (name === query) return 5_000;
  if (name.startsWith(query)) return 4_000;
  if (symbol.includes(query)) return 3_000;
  if (name.includes(query)) return 2_000;
  if (address.startsWith(query)) return 1_000;
  return -1;
}

export function searchTokenRegistry(
  tokens: readonly RegistryToken[],
  queryValue: string,
  limitValue: number,
): TokenSearchResult {
  const query = queryValue.trim().toLowerCase();
  const limit = Math.min(100, Math.max(1, Math.trunc(limitValue)));
  const matches = tokens
    .map((token) => ({ token, match: textMatchScore(token, query) }))
    .filter(({ match }) => match >= 0)
    .sort(
      (left, right) =>
        right.match - left.match ||
        preferenceScore(right.token) - preferenceScore(left.token) ||
        left.token.symbol.localeCompare(right.token.symbol) ||
        left.token.address.localeCompare(right.token.address),
    );
  return {
    total: matches.length,
    items: matches.slice(0, limit).map(({ token }) => token),
  };
}

export function findRegistryToken(
  tokens: readonly RegistryToken[],
  addressValue: string,
): RegistryToken {
  if (!isAddress(addressValue, { strict: false })) {
    throw new Error("Token address is invalid.");
  }
  const address = addressValue.toLowerCase();
  const token = tokens.find((item) => item.address === address);
  if (!token) throw new Error("Token is not listed by 1inch for this network.");
  return token;
}
