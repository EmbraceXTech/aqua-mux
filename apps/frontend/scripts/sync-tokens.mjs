import { mkdir, unlink, writeFile } from "node:fs/promises";
import { format } from "prettier";

const CHAINS = [1, 56, 42161, 4663];
const FALLBACK_ADDRESSES = {
  1: [
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2",
    "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    "0xdac17f958d2ee523a2206206994597c13d831ec7",
    "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599",
    "0x6b175474e89094c44da98b954eedeac495271d0f",
    "0x514910771af9ca656af840dff83e8264ecf986ca",
    "0xb50721bcf8d664c30412cfbc6cf7a15145234ad1",
    "0x1f9840a85d5af5bf1d1762f925bdaddc4201f984",
    "0x111111111117dc0aa78b770fa6a738034120c302",
    "0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9",
  ],
  56: [
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c",
    "0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d",
    "0x55d398326f99059ff775485246999027b3197955",
    "0x7130d2a12b9bcbfae4f2634d864a1ee1ce3ead9c",
    "0x2170ed0880ac9a755fd29b2688956bd959f933f8",
    "0x111111111117dc0aa78b770fa6a738034120c302",
    "0xcf6bb5389c92bdda8a3747ddb454cb7a64626c63",
  ],
  42161: [
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    "0xaf88d065e77c8cc2239327c5edb3a432268e5831",
    "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f",
    "0xda10009cbd5d07dd0cecc66161fc93d7c9000da1",
    "0xf97f4df75117a78c1a5a0dbb814af92458539fb4",
    "0x912ce59144191c1204e64559fe8253a0e49e6548",
    "0xfa7f8980b0f1e64a2062791cc3b0871572f1f7f0",
    "0x6314c31a7a1652ce482cffe247e9cb7c3f4bb9af",
    "0xfc5a1a6eb076a2c7ad06ed22c90d7e710e35ad0a",
  ],
  4663: [
    "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
    "0x0bd7d308f8e1639fab988df18a8011f41eacad73",
    "0x5fc5360d0400a0fd4f2af552add042d716f1d168",
    "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9",
    "0x39dbed3a2bd333467115de45665cc57f813c4571",
    "0x322f0929c4625ed5bad873c95208d54e1c003b2d",
  ],
};
const LOGO_HOSTS = new Set([
  "tokens.1inch.io",
  "tokens-data.1inch.io",
  "assets.coingecko.com",
  "cdn.robinhood.com",
  "cdn.dexscreener.com",
]);
const IMAGE_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/jpeg", "jpg"],
]);

function validateToken(chain, token) {
  if (
    !token ||
    token.chainId !== chain ||
    !/^0x[0-9a-fA-F]{40}$/.test(token.address) ||
    typeof token.symbol !== "string" ||
    !token.symbol.trim() ||
    typeof token.name !== "string" ||
    !token.name.trim() ||
    !Number.isInteger(token.decimals) ||
    token.decimals < 0 ||
    token.decimals > 255
  ) {
    throw new Error(
      `Invalid token metadata in the 1inch list for chain ${chain}.`,
    );
  }
}

const catalog = {};
for (const chain of CHAINS) {
  const response = await fetch(`https://tokens.1inch.io/v1.2/${chain}`);
  if (!response.ok) throw new Error(`Token list ${chain}: ${response.status}`);
  const all = Object.values(await response.json());
  all.forEach((token) => validateToken(chain, token));
  const byAddress = new Map(
    all.map((token) => [token.address.toLowerCase(), token]),
  );
  if (byAddress.size !== all.length) {
    throw new Error(
      `Duplicate token address in the 1inch list for chain ${chain}.`,
    );
  }
  const selected = FALLBACK_ADDRESSES[chain].map((address) => {
    const token = byAddress.get(address);
    if (!token)
      throw new Error(`Required fallback token is absent: ${chain} ${address}`);
    return token;
  });
  catalog[chain] = await Promise.all(
    selected.map(async (token) => {
      const logo = new URL(token.logoURI);
      if (!LOGO_HOSTS.has(logo.hostname))
        throw new Error("Unexpected logo source");
      const logoResponse = await fetch(logo);
      if (!logoResponse.ok) {
        throw new Error(`Logo failed: ${chain} ${token.address}`);
      }
      const address = token.address.toLowerCase();
      const contentType = logoResponse.headers
        .get("content-type")
        ?.split(";")[0];
      const extension = contentType && IMAGE_EXTENSIONS.get(contentType);
      if (!extension) {
        throw new Error(`Unsupported logo format: ${chain} ${token.address}`);
      }
      const basename = `${chain}-${address}`;
      const localLogo = `/tokens/${basename}.${extension}`;
      for (const oldExtension of IMAGE_EXTENSIONS.values()) {
        if (oldExtension === extension) continue;
        await unlink(`public/tokens/${basename}.${oldExtension}`).catch(
          (error) => {
            if (error?.code !== "ENOENT") throw error;
          },
        );
      }
      await writeFile(
        `public${localLogo}`,
        Buffer.from(await logoResponse.arrayBuffer()),
      );
      return {
        address,
        symbol: token.symbol,
        name: token.name,
        decimals: token.decimals,
        logo: localLogo,
        source: token.logoURI,
        tags: [...new Set(token.tags ?? [])].sort(),
        providers: [...new Set(token.providers ?? [])].sort(),
      };
    }),
  );
  const symbolCounts = new Map();
  for (const token of all) {
    symbolCounts.set(token.symbol, (symbolCounts.get(token.symbol) ?? 0) + 1);
  }
  console.log(
    chain,
    `registry=${all.length}`,
    `fallback=${catalog[chain].length}`,
    `ambiguousSymbols=${[...symbolCounts.values()].filter((count) => count > 1).length}`,
  );
}

await mkdir("lib", { recursive: true });
const output = await format(
  JSON.stringify({
    capturedAt: new Date().toISOString(),
    source: "https://tokens.1inch.io/v1.2/{chainId}",
    chains: catalog,
  }),
  { parser: "json" },
);
await writeFile("lib/token-catalog.json", output);
