import type { NextConfig } from "next";

const tokenImageHosts = [
  "assets-cdn.trustwallet.com",
  "assets.coingecko.com",
  "cdn.robinhood.com",
  "coin-images.coingecko.com",
  "raw.githubusercontent.com",
  "s2.coinmarketcap.com",
  "tokens-data.1inch.io",
  "tokens.1inch.io",
  "xstocks-metadata.backed.fi",
];

const config: NextConfig = {
  devIndicators: false,
  images: {
    remotePatterns: tokenImageHosts.map((hostname) => ({
      protocol: "https",
      hostname,
    })),
  },
};

export default config;
