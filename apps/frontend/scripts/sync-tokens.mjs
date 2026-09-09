import { mkdir, writeFile } from "node:fs/promises";
const catalog = {};
for (const chain of [1, 42161, 4663, 56]) {
  const response = await fetch(`https://tokens.1inch.io/v1.2/${chain}`);
  if (!response.ok) throw new Error(`Token list ${chain}: ${response.status}`);
  const all = Object.values(await response.json());
  const wanted =
    chain === 4663
      ? ["ETH", "WETH", "USDG", "AAPL", "PONS", "TSLA"]
      : chain === 56
        ? ["BNB", "WBNB", "USDC", "USDT", "BTCB", "ETH", "CAKE", "1INCH"]
        : [
            "ETH",
            "WETH",
            "USDC",
            "USDT",
            "WBTC",
            "DAI",
            "LINK",
            "ARB",
            "UNI",
            "1INCH",
          ];
  const selected = wanted.flatMap((symbol) => {
    const matches = all.filter((t) => t.symbol === symbol);
    if (matches.length > 1) console.log(chain, symbol, "ambiguous, omitted");
    return matches.length === 1 ? matches : [];
  });
  catalog[chain] = await Promise.all(
    selected.map(async (t) => {
      const logo = new URL(t.logoURI);
      if (
        ![
          "tokens.1inch.io",
          "tokens-data.1inch.io",
          "assets.coingecko.com",
          "cdn.robinhood.com",
          "cdn.dexscreener.com",
        ].includes(logo.hostname)
      )
        throw new Error("Unexpected logo source");
      const r = await fetch(logo);
      if (!r.ok) throw new Error(`Logo failed: ${chain} ${t.symbol}`);
      const path = `/tokens/${chain}-${t.address.toLowerCase()}.png`;
      await writeFile(`public${path}`, Buffer.from(await r.arrayBuffer()));
      return {
        address: t.address.toLowerCase(),
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logo: path,
        source: t.logoURI,
      };
    }),
  );
  console.log(chain, catalog[chain].map((t) => t.symbol).join(", "));
}
await mkdir("lib", { recursive: true });
await writeFile(
  "lib/token-catalog.json",
  JSON.stringify(
    {
      capturedAt: new Date().toISOString(),
      source: "https://tokens.1inch.io/v1.2/{chainId}",
      chains: catalog,
    },
    null,
    2,
  ) + "\n",
);
